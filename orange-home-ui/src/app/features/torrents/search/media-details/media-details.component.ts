import { Component, EventEmitter, Input, Output, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TmdbSearchResult } from '../../../../core/models/tmdb.model';
import { TmdbService } from '../../../../core/services/tmdb.service';
import { SeasonSelectorComponent } from './season-selector/season-selector.component';
import { EpisodeListComponent } from './episode-list/episode-list.component';

@Component({
  selector: 'app-media-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ButtonModule,
    TagModule,
    SeasonSelectorComponent,
    EpisodeListComponent,
  ],
  templateUrl: './media-details.component.html',
  styleUrls: ['./media-details.component.css']
})
export class MediaDetailsComponent {
  @Input() media!: TmdbSearchResult;
  @Input() fullDetails: any = null;
  @Input() isLoadingDetails = false;
  @Input() selectedSeason: number = 0;

  @Output() goBack = new EventEmitter<void>();
  @Output() seasonSelected = new EventEmitter<number>();

  public tmdb = inject(TmdbService);
  private cdr = inject(ChangeDetectorRef);

  showEpisodes = false;
  episodes: any[] = [];
  isLoadingEpisodes = false;

  getTitle(): string {
    return this.tmdb.getTitle(this.media);
  }

  getYear(): number | null {
    const date = this.media.media_type === 'movie' ? this.media.release_date : this.media.first_air_date;
    return this.tmdb.getYear(date);
  }

  getBackdrop(): string | null {
    return this.tmdb.getBackdropUrl(this.media.backdrop_path);
  }

  getPoster(): string | null {
    return this.tmdb.getPosterUrl(this.media.poster_path);
  }

  getTopCast(): any[] {
    if (!this.fullDetails?.credits?.cast) return [];
    return this.fullDetails.credits.cast.slice(0, 6);
  }

  onSeasonChange(seasonNumber: number) {
    this.showEpisodes = false;
    this.episodes = [];
    this.seasonSelected.emit(seasonNumber);
    this.cdr.markForCheck();
  }

  toggleEpisodes() {
    if (this.showEpisodes) {
      this.showEpisodes = false;
      this.cdr.markForCheck(); // 🔥 Обязательно при OnPush
      return;
    }

    // Если эпизоды ещё не загружены — загружаем
    if (this.episodes.length === 0 && this.selectedSeason > 0) {
      this.loadEpisodes();
    } else {
      this.showEpisodes = true;
      this.cdr.markForCheck(); // 🔥 Обязательно при OnPush
    }
  }

  private loadEpisodes() {
    this.isLoadingEpisodes = true;
    this.cdr.markForCheck(); // 🔥 Показываем спиннер

    this.tmdb.getSeasonEpisodes(this.media.id, this.selectedSeason).subscribe({
      next: (data) => {
        this.episodes = data.episodes || [];
        this.showEpisodes = true;
        this.isLoadingEpisodes = false;
        this.cdr.markForCheck(); // 🔥 ГЛАВНОЕ: сообщаем Angular о новых данных
      },
      error: () => {
        this.isLoadingEpisodes = false;
        this.cdr.markForCheck(); // 🔥 Снимаем спиннер при ошибке
      }
    });
  }

}