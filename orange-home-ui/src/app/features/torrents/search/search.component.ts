import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs/operators';

import { JackettService } from '../../../core/services/jackett.service';
import { QBittorrentService } from '../../../core/services/qbittorrent.service';
import { JackettResult } from '../../../core/models/jackett.model';

@Component({
  selector: 'app-torrent-search',
  standalone: true,
  imports: [CommonModule, FormsModule, InputTextModule, ButtonModule, ToastModule, DatePipe],
  providers: [MessageService],
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.css']
})
export class SearchComponent {
  private jackettService = inject(JackettService);
  private qbService = inject(QBittorrentService);
  private messageService = inject(MessageService);

  searchQuery = '';
  results: JackettResult[] = [];
  searchLoading = false;

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

  isSeries(title: string): boolean {
    return /s\d{2}e\d{2}|сезон|серия|season|episode/i.test(title.toLowerCase());
  }

  getDisplayTitle(result: JackettResult): string {
    // Если есть Description и он отличается от Title (часто там полное имя), берем его
    if (result.Description && result.Description !== result.Title) {
      return result.Description;
    }
    // Иначе берем Title, или заглушку, если и его нет
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

  // --- Новые методы для проверки типов ссылок ---
  hasMagnet(result: JackettResult): boolean {
    return !!result.MagnetUri && result.MagnetUri.startsWith('magnet:');
  }

  hasTorrentFile(result: JackettResult): boolean {
    // Если есть Link и это не магнет-ссылка (иногда Jackett кладет магнет и туда)
    return !!result.Link && !result.Link.startsWith('magnet:');
  }

  addTorrent(result: JackettResult) {
    const displayName = this.getDisplayTitle(result);
    const isSeries = this.isSeries(displayName);
    const category = this.getCategory(displayName);
    
    let torrentUrl = result.MagnetUri; // Запасной вариант

    if (result.Link && !result.Link.startsWith('magnet:')) {
      const currentOrigin = 'http://192.168.0.150';
      torrentUrl = result.Link.replace(/^https?:\/\/[^/]+(\/dl\/.*)$/i, `${currentOrigin}/api/jackett$1`);
    }

    this.qbService.addTorrent(torrentUrl, isSeries, category).subscribe({
      next: () => {
        this.messageService.add({ 
          severity: 'success', 
          summary: 'Успех', 
          detail: `"${displayName}" добавлен (${isSeries ? 'на паузу' : 'в загрузку'})` 
        });
      },
      error: (err) => {
        console.error('❌ Ошибка добавления через прямую ссылку:', err);
        
        if (result.MagnetUri && torrentUrl !== result.MagnetUri) {
          this.qbService.addTorrent(result.MagnetUri, isSeries, category).subscribe({
            next: () => {
              this.messageService.add({ severity: 'success', summary: 'Успех (Magnet)', detail: `"${displayName}" добавлен через магнет` });
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