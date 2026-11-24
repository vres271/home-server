import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { catchError, of, tap } from 'rxjs';
import { PlayerService } from '../../core/services/player.service';

@Component({
  selector: 'app-tv-player-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, ProgressBarModule, TooltipModule],
  providers: [MessageService],
  templateUrl: './tv-player-bar.component.html',
  styleUrls: ['./tv-player-bar.component.css']
})
export class TvPlayerBarComponent {
  readonly playerService = inject(PlayerService);
  private messageService = inject(MessageService);

  isControlling = false;

  getFileName(filePath: string | null): string {
    if (!filePath) return 'Неизвестный файл';
    return filePath.split('/').pop() || filePath;
  }

  sendControl(action: 'play_pause' | 'stop') {
    this.isControlling = true;
    const control$ = action === 'play_pause' 
      ? this.playerService.togglePlayPause() 
      : this.playerService.stop();

    control$.pipe(
      tap(() => {
        const msg = action === 'play_pause' ? 'Команда отправлена' : 'Остановлено';
        this.messageService.add({ severity: 'info', summary: 'ТВ', detail: msg });
      }),
      catchError(() => {
        this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Нет связи с ТВ' });
        return of(null);
      })
    ).subscribe({
      next: () => { this.isControlling = false; },
      error: () => { this.isControlling = false; }
    });
  }

  formatTime(seconds: number | null): string {
    if (seconds === null || seconds < 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

}