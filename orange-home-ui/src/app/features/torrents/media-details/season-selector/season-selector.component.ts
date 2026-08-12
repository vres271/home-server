import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { TmdbSeason } from '../../../../core/models/tmdb.model';
import { TmdbService } from '../../../../core/services/tmdb.service';

@Component({
  selector: 'app-season-selector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ButtonModule, ToggleButtonModule],
  templateUrl: './season-selector.component.html',
  styleUrls: ['./season-selector.component.css']
})
export class SeasonSelectorComponent implements OnInit {
  @Input() seasons: TmdbSeason[] = [];
  @Output() seasonSelected = new EventEmitter<number>();

  private tmdb = inject(TmdbService);
  private cdr = inject(ChangeDetectorRef); // 🔥 Добавляем ChangeDetectorRef

  selectedSeasonNumber: number = 0;
  viewMode: 'grid' | 'list' = 'grid';

  ngOnInit() {
    if (this.seasons && this.seasons.length > 0) {
      const validSeasons = this.seasons.filter(s => s.season_number > 0);
      if (validSeasons.length > 0) {
        this.selectedSeasonNumber = validSeasons[validSeasons.length - 1].season_number;
      }
    }
    this.emitSelection();
  }

  onSelect(seasonNumber: number) {
    this.selectedSeasonNumber = seasonNumber;
    this.emitSelection();
  }

  // 🔥 Новый метод для переключения режима
  onToggleViewMode() {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
    this.cdr.markForCheck(); // 🔥 Принудительно запускаем change detection
  }

  private emitSelection() {
    this.seasonSelected.emit(this.selectedSeasonNumber);
  }

  getPosterUrl(path: string | null): string | null {
    return this.tmdb.getPosterUrl(path);
  }

  getYear(dateString: string | null): string {
    if (!dateString) return 'TBA';
    return dateString.substring(0, 4);
  }
}