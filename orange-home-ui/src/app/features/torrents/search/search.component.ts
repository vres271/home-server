import { Component, EventEmitter, inject, Output } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs/operators';

import { TmdbService } from '../../../core/services/tmdb.service';
import { JackettService } from '../../../core/services/jackett.service';
import { QBittorrentService } from '../../../core/services/qbittorrent.service';
import { JackettResult } from '../../../core/models/jackett.model';
import { TmdbSearchResult } from '../../../core/models/tmdb.model';
import { TmdbSearchComponent } from '../tmdb-search/tmdb-search.component';

@Component({
  selector: 'app-torrent-search',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    InputTextModule, 
    ButtonModule, 
    ToastModule, 
    DatePipe,
    TmdbSearchComponent // <-- Добавляем новый компонент
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

  // Состояние для новой логики
  selectedMedia: TmdbSearchResult | null = null;
  showDirectSearch = false;
  
  // Состояние для Jackett (остается как было)
  searchQuery = '';
  results: JackettResult[] = [];
  searchLoading = false;

  // 1. Пользователь выбрал фильм в TMDB
  onMediaSelected(media: TmdbSearchResult) {
    this.selectedMedia = media;
    this.showDirectSearch = false;
    this.searchJackettByImdbId(media); // <-- Вызываем новый метод
  }

  // 2. Новый метод: получаем imdb_id из TMDB, затем ищем в Jackett
  private searchJackettByImdbId(media: TmdbSearchResult) {
    this.searchLoading = true;
    this.results = [];

    // Запрашиваем внешние ID у TMDB
    this.tmdbService.getExternalIds(media.id, media.media_type).subscribe({
      next: (externalIds) => {
        let searchQuery = '';

        // Если у фильма есть imdb_id, используем его (это идеальный вариант)
        if (externalIds.imdb_id) {
          searchQuery = externalIds.imdb_id; 
        } else {
          // Fallback: если imdb_id вдруг нет (редко, но бывает), ищем по Названию + Году
          const title = this.tmdbService.getTitle(media);
          const year = this.tmdbService.getYear(media.media_type === 'movie' ? media.release_date : media.first_air_date);
          searchQuery = year ? `${title} ${year}` : title;
          console.log(`⚠️ imdb_id не найден, используем fallback запрос: "${searchQuery}"`);
        }

        this.searchQuery = searchQuery; // Обновляем поле, чтобы пользователь видел, по чему ищем

        // Ищем в Jackett
        this.jackettService.search(searchQuery).pipe(
          finalize(() => this.searchLoading = false)
        ).subscribe({
          next: (res) => {
            this.results = res.Results || [];
            if (this.results.length === 0) {
              this.messageService.add({ 
                severity: 'warn', 
                summary: 'Внимание', 
                detail: `Раздачи по запросу "${searchQuery}" не найдены. Попробуйте прямой поиск.` 
              });
            }
          },
          error: () => this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось выполнить поиск в Jackett' })
        });
      },
      error: (err) => {
        console.error('Ошибка получения external_ids:', err);
        this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось получить данные о фильме' });
        this.searchLoading = false;
      }
    });
  }

  // 2. Пользователь нажал "Прямой поиск"
  onRequestDirectSearch() {
    this.showDirectSearch = true;
    this.selectedMedia = null;
    this.searchQuery = ''; // Сбрасываем поле ввода для прямого поиска
    this.results = [];
  }

  // 3. Поиск в Jackett по выбранному медиа (используем Название + Год)
  private searchJackettByMedia(media: TmdbSearchResult) {
    this.searchLoading = true;
    this.results = [];

    const title = this.tmdbService.getTitle(media);
    // const year = this.tmdbService.getYear(media.media_type === 'movie' ? media.release_date : media.first_air_date);
    
    // Формируем умный запрос: "Дюна: Часть вторая 2024"
    // this.searchQuery = year ? `${title} ${year}` : title;

    this.searchQuery = title;

    this.jackettService.search(this.searchQuery).pipe(
      finalize(() => this.searchLoading = false)
    ).subscribe({
      next: (res) => {
        this.results = res.Results || [];
        if (this.results.length === 0) {
          this.messageService.add({ severity: 'info', summary: 'Информация', detail: 'Раздачи не найдены. Попробуйте прямой поиск.' });
        }
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось выполнить поиск в Jackett' })
    });
  }

  // 4. Прямой поиск (твоя старая логика)
  search() {
    if (!this.searchQuery.trim()) return;
    this.searchLoading = true;
    
    this.jackettService.search(this.searchQuery).pipe(
      finalize(() => this.searchLoading = false)
    ).subscribe({
      next: (res) => {
        this.results = res.Results || [];
        if (this.results.length === 0) {
          this.messageService.add({ severity: 'info', summary: 'Информация', detail: 'Ничего не найдено' });
        }
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось выполнить поиск' })
    });
  }

  // --- Все твои существующие методы (без изменений) ---

  isSeries(title: string): boolean {
    const lowerTitle = title.toLowerCase();
    return /s\d{1,2}(e\d{1,2})?|сезон|серия|season|episode|\d{1,2}[хx]\d{1,2}/i.test(lowerTitle);
  }

  getDisplayTitle(result: JackettResult): string {
    if (result.Description && result.Description !== result.Title) {
      return result.Description;
    }
    return result.Title || 'Без названия';
  }

  getCategory(title: string): string {
    return this.isSeries(title) ? 'series' : 'movies';
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  hasMagnet(result: JackettResult): boolean {
    return !!result.MagnetUri && result.MagnetUri.startsWith('magnet:');
  }

  hasTorrentFile(result: JackettResult): boolean {
    return !!result.Link && !result.Link.startsWith('magnet:');
  }

  addTorrent(result: JackettResult) {
    const displayName = this.getDisplayTitle(result);
    const isSeries = this.isSeries(displayName);
    const category = this.getCategory(displayName);
    
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
  
  onImageError(event: any) {
    event.target.style.display = 'none';
  }
}