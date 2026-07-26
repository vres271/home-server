import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ProgressBarModule } from 'primeng/progressbar';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs/operators';

import { QBittorrentService } from '../../../core/services/qbittorrent.service';
import { TorrentInfo } from '../../../core/models/qbittorrent.model';

@Component({
  selector: 'app-torrent-downloads',
  standalone: true,
  imports: [CommonModule, ButtonModule, ToastModule, ProgressBarModule],
  providers: [MessageService],
  templateUrl: './downloads.component.html',
  styleUrls: ['./downloads.component.css']
})
export class DownloadsComponent implements OnInit {
  private qbService = inject(QBittorrentService);
  private messageService = inject(MessageService);

  activeTorrents: TorrentInfo[] = [];
  downloadsLoading = false;

  ngOnInit() {
    this.loadTorrents();
  }

  loadTorrents() {
    this.downloadsLoading = true;
    this.qbService.getTorrents().pipe(
      finalize(() => this.downloadsLoading = false)
    ).subscribe({
      next: (torrents) => {
        this.activeTorrents = torrents;
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось получить список' })
    });
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatSpeedProgress(complete: number) {
    return Math.round(complete * 100);
  }

  formatSpeed(bytesPerSec: number): string {
    return this.formatSize(bytesPerSec) + '/s';
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
    if (confirm(`Удалить "${name}"?\n\nФайлы на диске также будут удалены.`)) {
      this.qbService.deleteTorrent(hash, true).subscribe(() => {
        this.messageService.add({ severity: 'info', summary: 'Удалено', detail: 'Торрент и файлы удалены' });
        this.loadTorrents();
      });
    }
  }

  getStateLabel(state: string): string {
    const labels: Record<string, string> = {
      'error': '❌ Ошибка', 'missingFiles': '❗ Файлы отсутствуют', 'uploading': '⬆️ Раздаётся',
      'stalledUP': '⬆️ Раздача (нет пиров)', 'forcedUP': '⬆️ Раздача (приоритет)', 'queuedUP': '⏳ В очереди на раздачу',
      'checkingUP': '🔍 Проверка (раздача)', 'allocating': '💾 Выделение места', 'downloading': '⬇️ Скачивается',
      'metaDL': '🔗 Получение метаданных', 'stalledDL': '⏸️ Ожидание (нет сидов)', 'forcedDL': '⬇️ Скачивается (приоритет)',
      'pausedDL': '⏸️ На паузе', 'pausedUP': '⏸️ На паузе (раздача)', 'queuedDL': '⏳ В очереди',
      'checkingDL': '🔍 Проверка', 'checkingResumeData': '🔍 Проверка данных', 'moving': '📁 Перемещение', 'unknown': '❓ Неизвестно'
    };
    return labels[state] || `❓ ${state}`;
  }
}