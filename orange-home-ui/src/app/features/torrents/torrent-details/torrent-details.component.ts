import { Component, inject, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { interval, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { QBittorrentService } from '../../../core/services/qbittorrent.service';
import { TorrentFile, TorrentInfo } from '../../../core/models/qbittorrent.model';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-torrent-details',
  standalone: true,
  imports: [
    CommonModule, DialogModule, ButtonModule, CheckboxModule,
    ProgressBarModule, TooltipModule, ToastModule, FormsModule
  ],
  providers: [MessageService],
  templateUrl: './torrent-details.component.html',
  styleUrls: ['./torrent-details.component.css']
})
export class TorrentDetailsComponent implements OnInit, OnDestroy {
  private qbService = inject(QBittorrentService);
  private messageService = inject(MessageService);

  @Input() visible = false;
  @Input() torrentInfo!: TorrentInfo;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() onTorrentUpdated = new EventEmitter<void>();

  files: TorrentFile[] = [];
  selectedFiles = new Set<number>();
  loading = false;
  private destroy$ = new Subject<void>();
  private refreshInterval = 5000;

  // Кэшированные общие части имён файлов
  private commonPrefix = '';
  private commonSuffix = '';

  ngOnInit() {
    // При первом открытии показываем спиннер
    this.loadFiles(false);
    
    // Дальнейшие обновления каждые 5 секунд происходят "тихо", без мигания
    interval(this.refreshInterval)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadFiles(true));
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isSingleFile(): boolean {
    return this.files.length === 1;
  }

  get allSelected(): boolean {
    return this.files.length > 0 && this.selectedFiles.size === this.files.length;
  }

  /**
   * Загрузка файлов. 
   * @param silent если true, не показывает спиннер загрузки (для фоновых обновлений)
   */
  loadFiles(silent: boolean = false) {
    if (!silent) this.loading = true;
    
    this.qbService.getTorrentFiles(this.torrentInfo.hash).subscribe({
      next: (files) => {
        this.files = files;
        this.computeCommonParts();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  toggleSelectAll() {
    if (this.allSelected) {
      this.selectedFiles.clear();
    } else {
      this.selectedFiles = new Set(this.files.map(f => f.index));
    }
  }

  toggleFile(index: number) {
    if (this.selectedFiles.has(index)) {
      this.selectedFiles.delete(index);
    } else {
      this.selectedFiles.add(index);
    }
  }

  /**
   * Установить приоритет для выбранных файлов
   */
  setPriorityForSelected(priority: number) {
    if (this.selectedFiles.size === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Внимание',
        detail: 'Выберите файлы для изменения приоритета'
      });
      return;
    }

    const fileIds = Array.from(this.selectedFiles);
    this.qbService.setFilePriority(this.torrentInfo.hash, fileIds, priority).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Успех',
          detail: `Приоритет установлен для ${fileIds.length} файл(ов)`
        });
        this.loadFiles();
        this.onTorrentUpdated.emit();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось установить приоритет'
        });
      }
    });
  }

  /**
   * Каскадный приоритет: 1-й выбранный → Макс, 2-й → Высокий, остальные → Обычный
   */
  applyCascadePriority() {
    if (this.selectedFiles.size === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Внимание',
        detail: 'Выберите файлы для каскадного приоритета'
      });
      return;
    }

    const sortedIds = Array.from(this.selectedFiles).sort((a, b) => a - b);
    const requests: any[] = [];

    sortedIds.forEach((fileId, index) => {
      let priority: number;
      if (index === 0) {
        priority = 7; // Maximum
      } else if (index === 1) {
        priority = 6; // High
      } else {
        priority = 1; // Normal
      }
      requests.push(
        this.qbService.setFilePriority(this.torrentInfo.hash, [fileId], priority)
      );
    });

    // Выполняем все запросы параллельно
    import('rxjs').then(({ forkJoin }) => {
      forkJoin(requests).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Успех',
            detail: `Каскадный приоритет установлен для ${sortedIds.length} файл(ов)`
          });
          this.loadFiles();
          this.onTorrentUpdated.emit();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Ошибка',
            detail: 'Не удалось установить каскадный приоритет'
          });
        }
      });
    });
  }

  /**
   * Запустить все файлы (приоритет 1)
   */
  startAll() {
    const allFileIds = this.files.map(f => f.index);
    this.qbService.setFilePriority(this.torrentInfo.hash, allFileIds, 1).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Успех',
          detail: 'Все файлы запущены'
        });
        this.loadFiles();
        this.onTorrentUpdated.emit();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось запустить файлы'
        });
      }
    });
  }

  closeDialog() {
    this.visibleChange.emit(false);
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getPriorityLabel(priority: number): string {
    switch (priority) {
      case 0: return 'Не качать';
      case 1: return 'Обычный';
      case 6: return 'Высокий';
      case 7: return 'Максимум';
      default: return 'Неизвестно';
    }
  }

  getPriorityClass(priority: number): string {
    switch (priority) {
      case 0: return 'text-red-500';
      case 1: return 'text-500';
      case 6: return 'text-orange-500';
      case 7: return 'text-green-600';
      default: return 'text-500';
    }
  }

  getFileStatusIcon(file: TorrentFile): string {
    if (file.progress === 1) return 'pi pi-check-circle text-green-600';
    if (file.priority === 0) return 'pi pi-pause-circle text-red-500';
    if (file.progress > 0) return 'pi pi-spin pi-spinner text-blue-500';
    return 'pi pi-clock text-500';
  }

  /**
   * Находит общий префикс и суффикс всех имён файлов.
   * Например, для:
   *   "Series/S01E01.1080p.mkv"
   *   "Series/S01E02.1080p.mkv"
   *   "Series/S01E03.1080p.mkv"
   * Префикс: "Series/S01E0", Суффикс: ".1080p.mkv"
   */
  /**
   * Находит общий префикс и суффикс всех имён файлов
   */
  private computeCommonParts() {
    if (this.files.length <= 1) {
      this.commonPrefix = '';
      this.commonSuffix = '';
      return;
    }
    
    const names = this.files.map(f => f.name);
    const first = names[0];
    
    // Находим общий префикс
    let prefixLen = 0;
    for (let i = 0; i < first.length; i++) {
      const char = first[i];
      if (names.every(name => name[i] === char)) {
        prefixLen = i + 1;
      } else {
        break;
      }
    }
    
    // Находим общий суффикс
    let suffixLen = 0;
    for (let i = 0; i < first.length; i++) {
      const char = first[first.length - 1 - i];
      if (names.every(name => name[name.length - 1 - i] === char)) {
        suffixLen = i + 1;
      } else {
        break;
      }
    }
    
    // Проверяем, что префикс и суффикс не пересекаются
    if (prefixLen + suffixLen >= first.length) {
      this.commonPrefix = '';
      this.commonSuffix = '';
      return;
    }
    
    this.commonPrefix = first.substring(0, prefixLen);
    this.commonSuffix = suffixLen > 0 ? first.substring(first.length - suffixLen) : '';

  }

  /**
   * Возвращает сокращённое имя файла
   */
  getShortFileName(fileName: string): string {
    if (!this.commonPrefix && !this.commonSuffix) {
      return fileName;
    }
    
    const start = this.commonPrefix.length;
    const end = this.commonSuffix.length > 0 
      ? fileName.length - this.commonSuffix.length 
      : fileName.length;
    
    if (end <= start) {
      return fileName;
    }
    
    const shortName = fileName.substring(start, end).trim();
    
    if (!shortName) return fileName;

    if (shortName.length < 5) {
      return `Серия ${shortName}`;
    }
    
    return shortName;
  }

}