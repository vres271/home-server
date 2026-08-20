import { Component, EventEmitter, Input, Output, SimpleChanges, inject, ChangeDetectionStrategy, ChangeDetectorRef, HostListener, ViewChild, ElementRef, OnDestroy, AfterViewChecked, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { TmdbService } from '../../../../core/services/tmdb.service';
import { DiscoverParams, TmdbSearchResult } from '../../../../core/models/tmdb.model';
import { AdvancedSearchComponent } from './advanced-search/advanced-search.component';
import { fromEvent, Subscription, throttleTime } from 'rxjs';

type SearchType = 'multi' | 'discover';

interface SearchState {
  type: SearchType;
  query?: string;
  discoverParams?: DiscoverParams;
}

@Component({
  selector: 'app-tmdb-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, InputTextModule,
    ButtonModule, IconFieldModule, InputIconModule,
    AdvancedSearchComponent,
  ],
  templateUrl: './tmdb-search.component.html',
  styleUrls: ['./tmdb-search.component.css']
})
export class TmdbSearchComponent implements AfterViewChecked, AfterViewInit, OnDestroy{
  private tmdbService = inject(TmdbService);
  private messageService = inject(MessageService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('sentinel') sentinel!: ElementRef<HTMLDivElement>;
  private lastSentinelEl: HTMLDivElement | null = null;

  @Output() mediaSelected = new EventEmitter<TmdbSearchResult>();
  @Output() requestDirectSearch = new EventEmitter<void>();
  @Output() searchCompleted = new EventEmitter<{ results: TmdbSearchResult[], query: string, hasSearched: boolean }>();

  @Input() savedResults: TmdbSearchResult[] = [];
  @Input() savedQuery: string = '';
  @Input() savedHasSearched: boolean = false;

  searchQuery = '';
  results: TmdbSearchResult[] = [];
  isLoading = false;
  hasSearched = false;
  showAdvanced = false;

  // Пагинация
  private currentPage = 1;
  private totalPages = 1;
  isLoadingNextPage = false;
  private lastSearchState: SearchState | null = null;
  private observer: IntersectionObserver | null = null;

  // Кнопка "Наверх"
  showScrollToTop = false;
  private scrollSubscription: Subscription | null = null;
  private scrollContainer: HTMLElement | null = null;

  ngAfterViewChecked(): void {
    const currentEl = this.sentinel?.nativeElement || null;
    if (currentEl !== this.lastSentinelEl) {
      this.lastSentinelEl = currentEl;
      this.setupIntersectionObserver();
    }
  }

  ngAfterViewInit(): void {
    // Находим контейнер, на котором происходит скролл
    this.scrollContainer = document.querySelector('.content-container');
    
    if (this.scrollContainer) {
      this.scrollSubscription = fromEvent(this.scrollContainer, 'scroll')
        .pipe(throttleTime(100)) // ограничиваем частоту до 10 раз в секунду
        .subscribe(() => {
          const scrollPosition = this.scrollContainer!.scrollTop;
          this.showScrollToTop = scrollPosition > 1000;
          this.cdr.markForCheck();
        });
    }
  }

  ngOnDestroy(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.scrollSubscription) {
      this.scrollSubscription.unsubscribe();
    }
  }

  private setupIntersectionObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (!this.sentinel?.nativeElement) {
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !this.isLoadingNextPage && this.hasMorePages()) {
          this.loadNextPage();
        }
      },
      { threshold: 0.1 }
    );

    this.observer.observe(this.sentinel.nativeElement);
  }

  scrollToTop(): void {
    if (this.scrollContainer) {
      this.scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['savedResults'] && this.savedResults.length > 0) {
      this.results = this.savedResults;
      this.searchQuery = this.savedQuery;
      this.hasSearched = this.savedHasSearched;
      this.cdr.markForCheck();
    }
  }

  onSearchQueryChange(value: string): void {
    this.searchQuery = value;
    this.cdr.markForCheck();
  }

  search(): void {
    if (!this.searchQuery.trim()) return;
    
    this.isLoading = true;
    this.hasSearched = true;
    this.results = [];
    this.currentPage = 1;
    this.lastSearchState = { type: 'multi', query: this.searchQuery };
    this.cdr.markForCheck();

    this.tmdbService.searchMulti(this.searchQuery, 1).subscribe({
      next: (response) => {
        this.results = response.results || [];
        this.totalPages = response.total_pages;
        this.isLoading = false;

        this.searchCompleted.emit({
          results: this.results,
          query: this.searchQuery,
          hasSearched: this.hasSearched
        });

        if (this.results.length === 0) {
          this.messageService.add({
            severity: 'warn',
            summary: 'Внимание',
            detail: 'По вашему запросу в TMDB ничего не найдено. Попробуйте прямой поиск.'
          });
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось получить данные из TMDB' });
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.results = [];
    this.hasSearched = false;
    this.currentPage = 1;
    this.lastSearchState = null;
    this.cdr.markForCheck();

    this.searchCompleted.emit({
      results: [],
      query: '',
      hasSearched: false
    });
  }

  onSelect(item: TmdbSearchResult): void {
    this.mediaSelected.emit(item);
  }

  getTitle(item: TmdbSearchResult): string {
    return this.tmdbService.getTitle(item);
  }

  getYear(item: TmdbSearchResult): number | null {
    const date = item.media_type === 'movie' ? item.release_date : item.first_air_date;
    return this.tmdbService.getYear(date);
  }

  getPoster(item: TmdbSearchResult): string | null {
    return this.tmdbService.getPosterUrl(item.poster_path);
  }

  toggleAdvanced(): void {
    this.showAdvanced = !this.showAdvanced;
    this.cdr.markForCheck();
  }

  onAdvancedSearch(params: DiscoverParams): void {
    this.isLoading = true;
    this.hasSearched = true;
    this.results = [];
    this.currentPage = 1;
    this.lastSearchState = { type: 'discover', discoverParams: params };
    this.cdr.markForCheck();

    this.tmdbService.discover({ ...params, page: 1 }).subscribe({
      next: (response) => {
        this.results = response.results || [];
        this.totalPages = response.total_pages;
        this.isLoading = false;

        const queryLabel = this.buildDiscoverLabel(params);
        this.searchCompleted.emit({
          results: this.results,
          query: queryLabel,
          hasSearched: this.hasSearched
        });

        if (this.results.length === 0) {
          this.messageService.add({
            severity: 'warn',
            summary: 'Внимание',
            detail: 'По заданным фильтрам ничего не найдено. Попробуйте ослабить условия.'
          });
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось выполнить расширенный поиск'
        });
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private loadNextPage(): void {
    if (!this.lastSearchState || this.isLoadingNextPage || !this.hasMorePages()) return;

    this.isLoadingNextPage = true;
    this.currentPage++;
    this.cdr.markForCheck();

    const nextPage = this.currentPage;
    const state = this.lastSearchState;

    const request$ = state.type === 'multi'
      ? this.tmdbService.searchMulti(state.query!, nextPage)
      : this.tmdbService.discover({ ...state.discoverParams!, page: nextPage });

    request$.subscribe({
      next: (response) => {
        this.results = [...this.results, ...(response.results || [])];
        this.isLoadingNextPage = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось загрузить следующую страницу'
        });
        this.isLoadingNextPage = false;
        this.currentPage--; // Откатываем страницу при ошибке
        this.cdr.markForCheck();
      }
    });
  }

  hasMorePages(): boolean {
    return this.currentPage < this.totalPages;
  }

  private buildDiscoverLabel(p: DiscoverParams): string {
    const parts: string[] = [];
    if (p.query) parts.push(`«${p.query}»`);
    parts.push(p.mediaType === 'movie' ? 'Фильмы' : 'Сериалы');
    if (p.yearFrom || p.yearTo) {
      parts.push(`${p.yearFrom ?? '…'}–${p.yearTo ?? '…'}`);
    }
    if (p.minRating) parts.push(`≥${p.minRating}`);
    return parts.join(' · ');
  }

}