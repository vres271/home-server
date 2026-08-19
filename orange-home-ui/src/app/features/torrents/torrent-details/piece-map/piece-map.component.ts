import { Component, Input, ChangeDetectionStrategy, computed, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TooltipModule } from 'primeng/tooltip';
import { interval, Subject, startWith } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { QBittorrentService } from '../../../../core/services/qbittorrent.service';

@Component({
  selector: 'app-piece-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TooltipModule],
  templateUrl: './piece-map.component.html',
  styleUrls: ['./piece-map.component.css']
})
export class PieceMapComponent implements OnInit, OnDestroy {
  private qbService = inject(QBittorrentService);

  @Input() hash!: string;
  @Input() pieceRange: [number, number] | undefined;
  @Input() startPieceIndex: number = 0;

  // Сигналы для реактивности
  pieceStates = signal<number[]>([]);
  pieceSize = signal<number>(0); // Можно удалить совсем, если размер куска не нужен в UI
  isFetchingPieces = signal<boolean>(true); // Сразу true, пока не придет первый ответ

  private destroy$ = new Subject<void>();
  private refreshInterval = 5000;

  ngOnInit() {
    // 1. Получаем статические свойства ТОЛЬКО ОДИН РАЗ при инициализации
    // (Если pieceSize вам вообще не нужен, этот блок можно просто удалить)
    this.qbService.getTorrentProperties(this.hash).subscribe({
      next: (props) => this.pieceSize.set(props.piece_size || 0),
      error: () => {} // Игнорируем ошибки, это не критично для отображения карты
    });

    // 2. Декларативный поток автообновления состояний кусков
    interval(this.refreshInterval)
      .pipe(
        startWith(null), // Триггерим первый запрос НЕМЕДЛЕННО при подписке
        switchMap(() => this.qbService.getPieceStates(this.hash)), // switchMap предотвращает наложение запросов
        takeUntil(this.destroy$) // ГАРАНТИРОВАННАЯ отписка при уничтожении компонента
      )
      .subscribe({
        next: (states) => {
          this.pieceStates.set(states);
          this.isFetchingPieces.set(false);
        },
        error: () => {
          this.isFetchingPieces.set(false);
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // computed автоматически пересчитывается при изменении pieceStates
  visibleStates = computed(() => {
    const states = this.pieceStates(); 
    const range = this.pieceRange;
    
    if (!range || states.length === 0) return [];
    const [start, end] = range;
    return states.slice(start, end + 1);
  });

  getStateClass(state: number): string | string[] {
    switch (state) {
      case 2: return 'bg-green-500';
      case 1: return ['bg-yellow-400', 'piece-cell--loading'];
      default: return 'bg-grey-piece';
    }
  }

}