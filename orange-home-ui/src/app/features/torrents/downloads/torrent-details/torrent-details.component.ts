import { Component, inject, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { interval, Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';

import { QBittorrentService } from '../../../../core/services/qbittorrent.service';
import { TorrentFile, TorrentInfo } from '../../../../core/models/qbittorrent.model';
import { PieceMapComponent } from "./piece-map/piece-map.component";

@Component({
  selector: 'app-torrent-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, DialogModule, ButtonModule, CheckboxModule,
    ProgressBarModule, TooltipModule, ToastModule, FormsModule,
    PieceMapComponent
],
  providers: [MessageService],
  templateUrl: './torrent-details.component.html',
  styleUrls: ['./torrent-details.component.css']
})
export class TorrentDetailsComponent implements OnInit, OnDestroy {
  private qbService = inject(QBittorrentService);
  private messageService = inject(MessageService);
  private cdr = inject(ChangeDetectorRef);

  @Input() visible = false;
  @Input() torrentInfo!: TorrentInfo;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() onTorrentUpdated = new EventEmitter<void>();

  dialogVisible = false;

  files: TorrentFile[] = [];
  selectedFiles = new Set<number>();
  loading = false;
  private destroy$ = new Subject<void>();
  private refreshInterval = 5000;

  private commonPrefix = '';
  private commonSuffix = '';

  ngOnInit() {
    this.dialogVisible = this.visible;
    this.loadFiles(false);
    interval(this.refreshInterval)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadFiles(true));
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      this.dialogVisible = this.visible;
      this.cdr.markForCheck();
    }
  }

  get isSingleFile(): boolean {
    return this.files.length === 1;
  }

  get allSelected(): boolean {
    return this.files.length > 0 && this.selectedFiles.size === this.files.length;
  }

  loadFiles(silent: boolean = false) {
    if (!silent) this.loading = true;

    this.qbService.getTorrentFiles(this.torrentInfo.hash).subscribe({
      next: (files) => {
        this.files = [...files];
        this.computeCommonParts();
        this.sortFiles();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  toggleSelectAll() {
    if (this.allSelected) {
      this.selectedFiles = new Set();
    } else {
      this.selectedFiles = new Set(this.files.map(f => f.index));
    }
    this.cdr.markForCheck();
  }

  toggleFile(index: number) {
    // Иммутабельное обновление Set — Angular увидит новую ссылку
    const newSet = new Set(this.selectedFiles);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    this.selectedFiles = newSet;
    this.cdr.markForCheck();
  }

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
    const requests = sortedIds.map((fileId, index) => {
      let priority: number;
      if (index === 0) priority = 7;
      else if (index === 1) priority = 6;
      else priority = 1;
      return this.qbService.setFilePriority(this.torrentInfo.hash, [fileId], priority);
    });

    forkJoin(requests).subscribe({
      next: () => {
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
  }

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

  onVisibleChange(newValue: boolean) {
    if (!newValue) {
      this.closeDialog();
    }
  }

  closeDialog() {
    this.dialogVisible = false;
    this.visibleChange.emit(false);
    this.cdr.markForCheck();
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
      case 0: return 'text-grey-600';
      case 1: return 'text-green-600';
      case 6: return 'text-yellow-500';
      case 7: return 'text-red-500';
      default: return 'text-500';
    }
  }

  getFileStatusIcon(file: TorrentFile): string {
    if (file.progress === 1) return 'pi pi-check-circle';
    if (file.priority === 0) return 'pi pi-pause-circle';
    if (file.progress > 0) return 'pi pi-spin pi-spinner';
    return 'pi pi-clock';
  }

  private computeCommonParts() {
    if (this.files.length <= 1) {
      this.commonPrefix = '';
      this.commonSuffix = '';
      return;
    }

    const names = this.files.map(f => f.name);
    const first = names[0];

    let prefixLen = 0;
    for (let i = 0; i < first.length; i++) {
      const char = first[i];
      if (names.every(name => name[i] === char)) {
        prefixLen = i + 1;
      } else {
        break;
      }
    }

    let suffixLen = 0;
    for (let i = 0; i < first.length; i++) {
      const char = first[first.length - 1 - i];
      if (names.every(name => name[name.length - 1 - i] === char)) {
        suffixLen = i + 1;
      } else {
        break;
      }
    }

    if (prefixLen + suffixLen >= first.length) {
      this.commonPrefix = '';
      this.commonSuffix = '';
      return;
    }

    this.commonPrefix = first.substring(0, prefixLen);
    this.commonSuffix = suffixLen > 0 ? first.substring(first.length - suffixLen) : '';
  }

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

  private sortFiles(): void {
    this.files.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  }

}