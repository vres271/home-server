import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { JackettResult } from '../../../core/models/jackett.model';

@Component({
  selector: 'app-torrent-results',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, DatePipe],
  templateUrl: './torrent-results.component.html',
  styleUrls: ['./torrent-results.component.css']
})
export class TorrentResultsComponent {

  @Input() results: JackettResult[] = [];
  @Input() loading = false;
  @Input() overlayMode = false;      // true = оверлей поверх старых результатов (прямой поиск)
  @Input() showEmptyState = false;   // true = показывать "Раздачи не найдены" с кнопкой
  @Input() hasSearched = false;      // true = поиск уже был выполнен (для простого "Ничего не найдено")

  @Output() addTorrent = new EventEmitter<JackettResult>();
  @Output() requestDirectSearch = new EventEmitter<void>();

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

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}