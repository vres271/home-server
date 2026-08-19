import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common'; // Убедись, что CommonModule импортирован (нужен для date pipe)
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TmdbSeason } from '../../../../../core/models/tmdb.model';
import { TmdbService } from '../../../../../core/services/tmdb.service';

@Component({
  selector: 'app-season-selector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ButtonModule],
  templateUrl: './season-selector.component.html',
  styleUrls: ['./season-selector.component.css']
})
export class SeasonSelectorComponent implements OnInit {
  @Input() seasons: TmdbSeason[] = [];
  @Output() seasonSelected = new EventEmitter<number>();

  private tmdb = inject(TmdbService);
  private cdr = inject(ChangeDetectorRef);

  selectedSeasonNumber: number = 0;
  viewMode: 'grid' | 'list' = 'grid';

  ngOnInit() {
    if (this.seasons && this.seasons.length > 0) {
      const validSeasons = this.seasons.filter(s => s.season_number > 0);
      if (validSeasons.length > 0) {
        // 🔥 Ищем последний сезон, который УЖЕ вышел (дата <= сегодня)
        // Идем с конца массива (от самого нового к старому)
        let defaultSeason = validSeasons[validSeasons.length - 1];
        
        for (let i = validSeasons.length - 1; i >= 0; i--) {
          if (!this.isUnreleased(validSeasons[i].air_date)) {
            defaultSeason = validSeasons[i];
            break;
          }
        }
        
        this.selectedSeasonNumber = defaultSeason.season_number;
      }
    }
    this.emitSelection();
  }

  // 🔥 Новый метод: проверяет, является ли дата выхода будущей
  isUnreleased(airDateStr: string | null): boolean {
    if (!airDateStr) return true; // Если даты нет, считаем, что не вышел
    const airDate = new Date(airDateStr);
    const today = new Date();
    // Сбрасываем время для корректного сравнения только по датам
    today.setHours(0, 0, 0, 0);
    airDate.setHours(0, 0, 0, 0);
    return airDate > today;
  }

  onSelect(seasonNumber: number) {
    // Запрещаем выбирать невышедшие сезоны (опционально, можно убрать, если хочешь разрешить клик)
    const season = this.seasons.find(s => s.season_number === seasonNumber);
    if (season && this.isUnreleased(season.air_date)) {
      return; 
    }

    this.selectedSeasonNumber = seasonNumber;
    this.emitSelection();
  }

  private emitSelection() {
    this.seasonSelected.emit(this.selectedSeasonNumber);
  }

  onToggleViewMode() {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
    this.cdr.markForCheck();
  }

  getPosterUrl(path: string | null): string | null {
    return this.tmdb.getPosterUrl(path);
  }

  getYear(dateString: string | null): string {
    if (!dateString) return 'TBA';
    return dateString.substring(0, 4);
  }
}