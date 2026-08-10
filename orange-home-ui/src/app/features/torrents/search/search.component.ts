import { Component, EventEmitter, inject, Output, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
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
import { TmdbSearchComponent } from '../tmdb-search/tmdb-search.component';
import { MediaDetailsComponent } from '../media-details/media-details.component';
import { TorrentResultsComponent } from '../torrent-results/torrent-results.component';

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
    InputIconModule
  ],
  providers: [MessageService],
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.css']
})
export class SearchComponent {

  @Output() torrentAdded = new EventEmitter<void>();

  public tmdbService = inject(TmdbService);
  private jackettService = inject(JackettService);
  private qbService = inject(QBittorrentService);
  private messageService = inject(MessageService);
  private cdr = inject(ChangeDetectorRef);

  selectedMedia: TmdbSearchResult | null = null;
  showDirectSearch = false;
  viewState: 'search' | 'details' = 'search';
  fullMediaDetails: any = null;
  isLoadingDetails = false;

  savedTmdbResults: TmdbSearchResult[] = [];
  savedTmdbQuery: string = '';
  savedTmdbHasSearched: boolean = false;

  searchQuery = '';
  results: JackettResult[] = [];
  searchLoading = false;

  // ─── Навигация ───────────────────────────────────────────

  onMediaSelected(media: TmdbSearchResult) {
    this.viewState = 'details';
    this.selectedMedia = media;
    this.fullMediaDetails = null;
    this.isLoadingDetails = true;
    this.results = [];
    this.cdr.markForCheck();
    this.fetchMediaDetailsAndSearchJackett(media);
  }

  onGoBack() {
    this.viewState = 'search';
    this.selectedMedia = null;
    this.fullMediaDetails = null;
    this.results = [];
    this.cdr.markForCheck();
  }

  onRequestDirectSearch() {
    this.viewState = 'search';
    this.showDirectSearch = true;
    this.selectedMedia = null;
    this.fullMediaDetails = null;
    this.searchQuery = '';
    this.results = [];
    this.cdr.markForCheck();
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
    this.searchLoading = true;
    this.results = [];
    this.cdr.markForCheck();

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
          console.log(`⚠️ imdb_id не найден, используем fallback: "${query}"`);
        }

        this.searchQuery = query;
        this.cdr.markForCheck();
        this.executeJackettSearch(query);
      },
      error: (err) => {
        console.error('Ошибка получения external_ids:', err);
        this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось получить данные о фильме' });
        this.searchLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  search() {
    if (!this.searchQuery.trim()) return;
    this.searchLoading = true;
    this.cdr.markForCheck();
    this.executeJackettSearch(this.searchQuery, true);
  }

  private executeJackettSearch(query: string, isDirectSearch = false) {
    this.jackettService.search(query).pipe(
      finalize(() => {
        this.searchLoading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (res) => {
        this.results = res.Results || [];
        if (this.results.length === 0) {
          this.messageService.add({
            severity: isDirectSearch ? 'info' : 'warn',
            summary: isDirectSearch ? 'Информация' : 'Внимание',
            detail: isDirectSearch
              ? 'Ничего не найдено'
              : `Раздачи по запросу "${query}" не найдены. Попробуйте прямой поиск.`
          });
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось выполнить поиск в Jackett' });
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
    this.cdr.markForCheck();
  }

  // ─── qBittorrent ─────────────────────────────────────────

  addTorrent(result: JackettResult) {
    const displayName = result.Description && result.Description !== result.Title
      ? result.Description
      : result.Title || 'Без названия';

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