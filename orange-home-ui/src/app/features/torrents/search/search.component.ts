import { Component, EventEmitter, inject, Output, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { finalize } from 'rxjs/operators';

import { TmdbService } from '../../../core/services/tmdb.service';
import { JackettService } from '../../../core/services/jackett.service';
import { QBittorrentService } from '../../../core/services/qbittorrent.service';
import { JackettResult } from '../../../core/models/jackett.model';
import { TmdbSearchResult } from '../../../core/models/tmdb.model';
import { MediaDetailsComponent } from './media-details/media-details.component';
import { TorrentResultsComponent } from './torrent-results/torrent-results.component';
import { FilterService } from '../../../core/services/filter.service';
import { TmdbSearchComponent } from './tmdb-search/tmdb-search.component';
import { FilterPanelComponent } from './filter-panel/filter-panel.component';

@Component({
  selector: 'app-torrent-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    ToastModule,
    TmdbSearchComponent,
    MediaDetailsComponent,
    TorrentResultsComponent,
    IconFieldModule,
    InputIconModule,
    FilterPanelComponent
],
  providers: [MessageService],
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.css']
})
export class SearchComponent {

  @Output() torrentAdded = new EventEmitter<void>();

  @ViewChild('directSearchBlock') directSearchBlock!: ElementRef;

  public tmdbService = inject(TmdbService);
  private jackettService = inject(JackettService);
  private qbService = inject(QBittorrentService);
  private filterService = inject(FilterService);
  private messageService = inject(MessageService);
  private cdr = inject(ChangeDetectorRef);

  selectedMedia: TmdbSearchResult | null = null;
  showDirectSearch = false;
  viewState: 'search' | 'details' = 'search';
  fullMediaDetails: any = null;
  isLoadingDetails = false;
  isSearched = false;

  savedTmdbResults: TmdbSearchResult[] = [];
  savedTmdbQuery: string = '';
  savedTmdbHasSearched: boolean = false;

  searchQuery = '';
  results: JackettResult[] = [];
  searchLoading = false;
  emptyResultsMessage = '';

  // 🔥 1. Храним "сырые" результаты от Jackett до применения фильтров
  allJackettResults: JackettResult[] = [];
  selectedSeason: number = 0;

  private savedScrollPosition = 0;

  // ─── Навигация ───────────────────────────────────────────

switchToDirectSearch() {
    this.showDirectSearch = true;
    this.viewState = 'search';
    this.selectedMedia = null;
    this.fullMediaDetails = null;
    this.searchQuery = '';
    this.results = [];
    this.allJackettResults = [];
    this.isSearched = false;
    this.emptyResultsMessage = '';
    this.cdr.markForCheck();
  
    setTimeout(() => {
      if (this.directSearchBlock) {
        this.directSearchBlock.nativeElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    }, 0);
  }

  switchToNormalSearch() {
    this.showDirectSearch = false;
    this.viewState = 'search';
    this.searchQuery = '';
    this.results = [];
    this.allJackettResults = [];
    this.isSearched = false;
    this.emptyResultsMessage = '';
    this.cdr.markForCheck();
  }

  onMediaSelected(media: TmdbSearchResult) {
    // 1. Сохраняем текущую позицию скролла ПЕРЕД переходом
    const container = document.querySelector('.content-container') || document.documentElement;
    this.savedScrollPosition = container.scrollTop;

    // 2. Переключаем состояние
    this.viewState = 'details';
    this.selectedMedia = media;
    this.fullMediaDetails = null;
    this.isLoadingDetails = true;
    this.searchLoading = true; 
    
    this.results = [];
    this.allJackettResults = [];
    this.isSearched = false;
    this.selectedSeason = 0;
    this.emptyResultsMessage = '';
    this.cdr.markForCheck();
    
    this.fetchMediaDetailsAndSearchJackett(media);
  }

  onGoBack() {
    // 1. Переключаем состояние обратно
    this.viewState = 'search';
    this.selectedMedia = null;
    this.fullMediaDetails = null;
    this.results = [];
    this.allJackettResults = [];
    this.isSearched = false;
    this.selectedSeason = 0;
    this.emptyResultsMessage = '';
    this.cdr.markForCheck();

    // 2. Восстанавливаем скролл ПОСЛЕ того, как Angular обновил DOM (убрал [hidden])
    // Небольшая задержка (0-50мс) гарантирует, что браузер уже отрисовал блок поиска
    setTimeout(() => {
      const container = document.querySelector('.content-container') || document.documentElement;
      container.scrollTop = this.savedScrollPosition;
    }, 50);
  }

  onRequestDirectSearch() {
    this.viewState = 'search';
    this.showDirectSearch = true;
    this.selectedMedia = null;
    this.fullMediaDetails = null;
    this.searchQuery = '';
    this.results = [];
    this.allJackettResults = [];
    this.isSearched = false;

    this.cdr.markForCheck();
  
    setTimeout(() => {
      if (this.directSearchBlock) {
        this.directSearchBlock.nativeElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    }, 0);
  }

  closeDirectSearch(): void {
    this.showDirectSearch = false;
    this.searchQuery = '';
    this.results = [];
  }

  // ─── Выбор сезона ────────────────────────────────────────

  // 🔥 3. ТЕПЕРЬ ЭТО МГНОВЕННО: никаких запросов, только клиентская фильтрация
  onSeasonSelected(seasonNumber: number) {
    this.selectedSeason = seasonNumber;
    
    // 🔥 Если поиск ещё идёт, просто запоминаем выбор. 
    // Фильтрация применится автоматически, когда запрос завершится.
    // Если поиск уже завершён, фильтруем мгновенно.
    if (!this.searchLoading) {
      this.applyFilters(false);
    }
  }

  // ─── TMDB ────────────────────────────────────────────────

  onTmdbSearchCompleted(event: { results: TmdbSearchResult[], query: string, hasSearched: boolean }) {
    this.savedTmdbResults = event.results;
    this.savedTmdbQuery = event.query;
    this.savedTmdbHasSearched = event.hasSearched;
    this.cdr.markForCheck();
  }

  // ─── Jackett: поиск ──────────────────────────────────────

  private fetchMediaDetailsAndSearchJackett(media: TmdbSearchResult) {
    this.tmdbService.getFullDetails(media.id, media.media_type).subscribe({
      next: (details) => {
        this.fullMediaDetails = details;
        this.isLoadingDetails = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingDetails = false;
        this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить детали фильма' });
        this.cdr.markForCheck();
      }
    });

    this.searchJackettByImdbId(media);
  }

  private searchJackettByImdbId(media: TmdbSearchResult) {
    // Запрашиваем external_ids ТОЛЬКО один раз при первом открытии
    this.tmdbService.getExternalIds(media.id, media.media_type).subscribe({
      next: (externalIds) => {
        let query = '';

        if (externalIds.imdb_id) {
          query = externalIds.imdb_id;
        } else {
          const title = this.tmdbService.getTitle(media);
          const year = this.tmdbService.getYear(
            media.media_type === 'movie' ? media.release_date : media.first_air_date
          );
          query = year ? `${title} ${year}` : title;
        }

        this.searchQuery = query;
        this.cdr.markForCheck();
        
        // Выполняем запрос к Jackett
        this.executeJackettSearch(query, false);
      },
      error: (err) => {
        console.error('Ошибка получения external_ids:', err);
        this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось получить данные о фильме' });
        this.cdr.markForCheck();
      }
    });
  }

  // 🔥 Теперь этот метод использует FilterService для ВСЕХ фильтров (включая сезон)
  private applyFilters(isDirectSearch: boolean) {
    if (this.searchLoading) {
      this.results = [];
      this.emptyResultsMessage = '';
      this.cdr.markForCheck();
      return;
    }

    this.results = this.filterService.applyFilters(
      this.allJackettResults,
      this.selectedSeason
    );
    this.emptyResultsMessage = '';

    // 🔥 ГЛАВНОЕ: Если поиск уже был выполнен (isSearched) и результатов 0, 
    // мы ВСЕГДА формируем сообщение, чтобы блок не исчезал.
    if (this.isSearched && this.results.length === 0) {
      const activeCount = this.filterService.getActiveFiltersCount();
      const hasRaw = this.allJackettResults.length > 0;

      if (hasRaw) {
        this.emptyResultsMessage = activeCount > 0
          ? `Найдено ${this.allJackettResults.length} раздач, но они скрыты активными фильтрами (${activeCount} шт.). Попробуйте сбросить их.`
          : `Раздачи найдены, но не подходят под текущие условия. Попробуйте выбрать "Все сезоны".`;
      } else {
        this.emptyResultsMessage = activeCount > 0
          ? `По запросу ничего не найдено. Попробуйте сбросить активные фильтры (${activeCount} шт.) или изменить запрос.`
          : `По вашему запросу ничего не найдено.`;
      }
    }
    
    this.cdr.markForCheck();
  }

  getDisplayTitle(result: JackettResult): string {
    return (result.Description && result.Description !== result.Title) 
      ? result.Description 
      : (result.Title || 'Без названия');
  }

  search() {
    if (!this.searchQuery.trim()) return;
    this.executeJackettSearch(this.searchQuery, true);
  }


  private executeJackettSearch(query: string, isDirectSearch = false) {
    this.searchLoading = true;
    this.isSearched = false; // Сбрасываем до получения ответа
    this.cdr.markForCheck();

    this.jackettService.search(query).subscribe({
      next: (res) => {
        this.allJackettResults = res.Results || [];
        this.isSearched = true; // 🔥 Поиск завершен, можно показывать блок результатов
        this.searchLoading = false;
        
        this.applyFilters(isDirectSearch);
      },
      error: () => {
        this.searchLoading = false;
        this.isSearched = true;
        this.emptyResultsMessage = 'Не удалось выполнить поиск в Jackett.';
        this.cdr.markForCheck();
      }
    });
  }

  onSearchQueryChange(value: string) {
    this.searchQuery = value;
    this.cdr.markForCheck();
  }

  clearDirectSearch(): void {
    this.searchQuery = '';
    this.results = [];
    this.allJackettResults = [];
    this.isSearched = false;
    this.emptyResultsMessage = '';
    this.cdr.markForCheck();
  }

  onFiltersChanged() {
    // Определяем, в каком мы режиме, чтобы передать правильный флаг (хотя сейчас логика внутри applyFilters унифицирована)
    this.applyFilters(this.showDirectSearch);
  }

  // ─── qBittorrent ─────────────────────────────────────────

  addTorrent(result: JackettResult) {
    const displayName = this.getDisplayTitle(result);
    const isSeries = /s\d{1,2}(e\d{1,2})?|сезон|серия|season|episode|\d{1,2}[хx]\d{1,2}/i.test(displayName.toLowerCase());
    const category = isSeries ? 'series' : 'movies';

    let torrentUrl = result.MagnetUri;

    if (result.Link && !result.Link.startsWith('magnet:')) {
      torrentUrl = result.Link.replace(/^https?:\/\/[^/]+(\/dl\/.*)$/i, `http://192.168.0.150/api/jackett$1`);
    }

    this.qbService.addTorrent(torrentUrl, isSeries, category).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Успех',
          detail: `"${displayName}" добавлен (${isSeries ? 'на паузу' : 'в загрузку'})`
        });
        this.torrentAdded.emit();
      },
      error: (err) => {
        console.error('❌ Ошибка добавления:', err);

        if (result.MagnetUri && torrentUrl !== result.MagnetUri) {
          this.qbService.addTorrent(result.MagnetUri, isSeries, category).subscribe({
            next: () => {
              this.messageService.add({ severity: 'success', summary: 'Успех (Magnet)', detail: `"${displayName}" добавлен через магнет` });
              this.torrentAdded.emit();
            },
            error: () => {
              this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось добавить торрент' });
            }
          });
        } else {
          this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось добавить торрент' });
        }
      }
    });
  }

}