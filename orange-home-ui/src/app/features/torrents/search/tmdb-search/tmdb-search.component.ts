import { Component, EventEmitter, Input, Output, SimpleChanges, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { TmdbService } from '../../../../core/services/tmdb.service';
import { TmdbSearchResult } from '../../../../core/models/tmdb.model';

@Component({
  selector: 'app-tmdb-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, InputTextModule, ButtonModule, IconFieldModule, InputIconModule],
  templateUrl: './tmdb-search.component.html',
  styleUrls: ['./tmdb-search.component.css']
})
export class TmdbSearchComponent {
  private tmdbService = inject(TmdbService);
  private messageService = inject(MessageService);
  private cdr = inject(ChangeDetectorRef);

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
    this.cdr.markForCheck();

    this.tmdbService.searchMulti(this.searchQuery).subscribe({
      next: (response) => {
        this.results = response.results || [];
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
}