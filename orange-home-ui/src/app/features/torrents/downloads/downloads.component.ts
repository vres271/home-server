import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ProgressBarModule } from 'primeng/progressbar';
import { MessageService } from 'primeng/api';
import { finalize, tap, concatMap, map } from 'rxjs/operators';
import { interval, Subject, Observable } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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
export class DownloadsComponent implements OnInit, OnDestroy {
  private qbService = inject(QBittorrentService);
  private messageService = inject(MessageService);

  activeTorrents: TorrentInfo[] = [];
  downloadsLoading = false;
  freeSpace: number = 0;
  
  private destroy$ = new Subject<void>();
  private readonly refreshInterval = 5000;
  private readonly freeSpaceInterval = 30000; // <-- 30 секунд для диска

  ngOnInit() {
    this.loadTorrents();
    this.loadFreeSpace();               // 1. Загружаем сразу при старте
    this.startAutoUpdate();             // 2. Таймер торрентов (5 сек)
    this.startFreeSpaceAutoUpdate();    // 3. Таймер диска (30 сек)
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private fetchAndSortTorrents(): Observable<TorrentInfo[]> {
    return this.qbService.getTorrents().pipe(
      map(torrents => 
        [...torrents].sort((a, b) => {
          const timeA = a.added_on || 0;
          const timeB = b.added_on || 0;
          return timeB - timeA;
        })
      )
    );
  }

  private startAutoUpdate() {
    interval(this.refreshInterval)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.fetchAndSortTorrents().subscribe({
          next: (torrents) => { this.activeTorrents = torrents; },
          error: () => {}
        });
      });
  }

  private loadFreeSpace() {
    this.qbService.getFreeSpace().subscribe({
      next: (size) => { this.freeSpace = size || 0; },
      error: () => {} // Тихо игнорируем
    });
  }

  private startFreeSpaceAutoUpdate() {
    interval(this.freeSpaceInterval)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadFreeSpace());
  }

  private refreshList(): Observable<TorrentInfo[]> {
    this.downloadsLoading = true;
    return this.fetchAndSortTorrents().pipe(
      finalize(() => this.downloadsLoading = false)
    );
  }

  loadTorrents() {
    this.refreshList().subscribe({
      next: (torrents) => { this.activeTorrents = torrents; },
      error: () => this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось получить список' })
    });
    this.loadFreeSpace();
  }

  pauseTorrent(hash: string) {
    this.qbService.stopTorrent(hash).pipe(
      tap(() => this.messageService.add({ severity: 'warn', summary: 'Пауза', detail: 'Загрузка приостановлена' })),
      concatMap(() => this.refreshList())
    ).subscribe({
      next: (torrents) => { this.activeTorrents = torrents; },
      error: () => this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось обновить список' })
    });
  }

  resumeTorrent(hash: string) {
    this.qbService.startTorrent(hash).pipe(
      tap(() => this.messageService.add({ severity: 'success', summary: 'Возобновлено', detail: 'Загрузка возобновлена' })),
      concatMap(() => this.refreshList())
    ).subscribe({
      next: (torrents) => { this.activeTorrents = torrents; },
      error: () => this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось обновить список' })
    });
  }

  deleteTorrent(hash: string, name: string) {
    if (confirm(`Удалить "${name}"?\n\nФайлы на диске также будут удалены.`)) {
      this.qbService.deleteTorrent(hash, true).pipe(
        tap(() => this.messageService.add({ severity: 'info', summary: 'Удалено', detail: 'Торрент и файлы удалены' })),
        concatMap(() => this.refreshList()), // Сначала обновляем список
        tap(() => this.loadFreeSpace())      // И сразу обновляем свободное место
      ).subscribe({
        next: (torrents) => { this.activeTorrents = torrents; },
        error: () => this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось обновить список' })
      });
    }
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

  formatEta(seconds: number): string {
    // 8640000 или -1 в qBittorrent означает "неизвестно" или "бесконечно" (например, при сидировании)
    if (seconds < 0 || seconds >= 8640000) {
      return '∞';
    }
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}д ${hours}ч`;
    if (hours > 0) return `${hours}ч ${minutes}м`;
    return `${minutes}м`;
  }

  getStateLabel(state: string): string {
    const labels: Record<string, string> = {
      'error': '❌ Ошибка', 'missingFiles': '❗ Файлы отсутствуют', 'uploading': '⬆️ Раздаётся',
      'stalledUP': '⬆️ Раздача (нет пиров)', 'forcedUP': '⬆️ Раздача (приоритет)', 'queuedUP': '⏳ В очереди на раздачу',
      'checkingUP': '🔍 Проверка (раздача)', 'allocating': '💾 Выделение места', 'downloading': '⬇️ Скачивается',
      'metaDL': '🔗 Получение метаданных', 'stalledDL': '⏸️ Ожидание (нет сидов)', 'forcedDL': '⬇️ Скачивается (приоритет)',
      'stoppedDL': '⏸️ На паузе', 'stoppedUP': '⏸️ На паузе (раздача)', 'queuedDL': '⏳ В очереди',
      'checkingDL': '🔍 Проверка', 'checkingResumeData': '🔍 Проверка данных', 'moving': '📁 Перемещение', 'unknown': '❓ Неизвестно'
    };
    return labels[state] || `❓ ${state}`;
  }
}