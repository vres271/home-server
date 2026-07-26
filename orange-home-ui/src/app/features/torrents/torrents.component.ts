import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { TabViewModule } from 'primeng/tabview';
import { ProgressBarModule } from 'primeng/progressbar';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs/operators';

import { JackettService } from '../../core/services/jackett.service';
import { QBittorrentService } from '../../core/services/qbittorrent.service';
import { JackettResult } from '../../core/models/jackett.model';
import { TorrentInfo } from '../../core/models/qbittorrent.model';

@Component({
  selector: 'app-torrents',
  standalone: true,
  imports: [
    CommonModule, FormsModule, InputTextModule, ButtonModule, 
    TableModule, ToastModule, TabViewModule, ProgressBarModule
  ],
  providers: [MessageService],
  templateUrl: './torrents.component.html',
  styleUrls: ['./torrents.component.css']
})
export class TorrentsComponent implements OnInit {
  private jackettService = inject(JackettService);
  private qbService = inject(QBittorrentService);
  private messageService = inject(MessageService);

  // Поиск
  searchQuery = '';
  results: JackettResult[] = [];
  searchLoading = false;

  // Загрузки
  activeTorrents: TorrentInfo[] = [];
  downloadsLoading = false;

  ngOnInit() {
    this.loadTorrents();
  }

  // --- Логика Поиска ---
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
      error: () => this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось выполнить поиск в Jackett' })
    });
  }

  isSeries(title: string): boolean {
    return /s\d{2}e\d{2}|сезон|серия|season|episode/i.test(title.toLowerCase());
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

  formatSpeed(bytesPerSec: number): string {
    return this.formatSize(bytesPerSec) + '/s';
  }

  addTorrent(result: JackettResult) {
    const isSeries = this.isSeries(result.Title);
    const category = this.getCategory(result.Title);
    const torrentUrl = result.MagnetUri || result.Link;

    this.qbService.addTorrent(torrentUrl, isSeries, category).subscribe({
      next: () => {
        this.messageService.add({ 
          severity: 'success', 
          summary: 'Успех', 
          detail: `"${result.Title}" добавлен (${isSeries ? 'на паузу' : 'в загрузку'})` 
        });
        this.loadTorrents(); // Обновляем список загрузок
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось добавить торрент' })
    });
  }

  // --- Логика Управления Загрузками ---
    loadTorrents() {
    this.downloadsLoading = true;
    this.qbService.getTorrents().pipe(
        finalize(() => this.downloadsLoading = false)
    ).subscribe({
        next: (torrents) => {
        // Показываем ВСЕ торренты (без фильтра)
        this.activeTorrents = torrents;
        },
        error: () => this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось получить список загрузок' })
    });
    }

  pauseTorrent(hash: string) {
    this.qbService.pauseTorrent(hash).subscribe(() => {
      this.messageService.add({ severity: 'warn', summary: 'Пауза', detail: 'Загрузка приостановлена' });
      this.loadTorrents();
    });
  }

  resumeTorrent(hash: string) {
    this.qbService.resumeTorrent(hash).subscribe(() => {
      this.messageService.add({ severity: 'success', summary: 'Возобновлено', detail: 'Загрузка возобновлена' });
      this.loadTorrents();
    });
  }

  deleteTorrent(hash: string, name: string) {
    if (confirm(`Удалить "${name}" из списка? Файлы на диске останутся.`)) {
      this.qbService.deleteTorrent(hash, false).subscribe(() => {
        this.messageService.add({ severity: 'info', summary: 'Удалено', detail: 'Торрент удален из списка' });
        this.loadTorrents();
      });
    }
  }

    getStateLabel(state: string): string {
        const labels: Record<string, string> = {
            'error': '❌ Ошибка',
            'missingFiles': '❗ Файлы отсутствуют',
            'uploading': '⬆️ Раздаётся',
            'stalledUP': '⬆️ Раздача (нет пиров)',
            'forcedUP': '⬆️ Раздача (приоритет)',
            'queuedUP': '⏳ В очереди на раздачу',
            'checkingUP': '🔍 Проверка (раздача)',
            'allocating': '💾 Выделение места',
            'downloading': '⬇️ Скачивается',
            'metaDL': '🔗 Получение метаданных',
            'stalledDL': '⏸️ Ожидание (нет сидов)',
            'forcedDL': '⬇️ Скачивается (приоритет)',
            'pausedDL': '⏸️ На паузе',
            'pausedUP': '⏸️ На паузе (раздача)',
            'queuedDL': '⏳ В очереди',
            'checkingDL': '🔍 Проверка',
            'checkingResumeData': '🔍 Проверка данных',
            'moving': '📁 Перемещение',
            'unknown': '❓ Неизвестно'
        };
        return labels[state] || `❓ ${state}`;
    }
}