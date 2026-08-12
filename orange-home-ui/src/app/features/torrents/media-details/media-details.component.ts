import { Component, EventEmitter, Input, Output, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TmdbSearchResult } from '../../../core/models/tmdb.model';
import { TmdbService } from '../../../core/services/tmdb.service';
import { SeasonSelectorComponent } from './season-selector/season-selector.component';

@Component({
  selector: 'app-media-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, TagModule, SeasonSelectorComponent],
  templateUrl: './media-details.component.html',
  styleUrls: ['./media-details.component.css']
})
export class MediaDetailsComponent {
  @Input() media!: TmdbSearchResult;
  @Input() fullDetails: any = null;
  @Input() isLoadingDetails = false;

  @Output() goBack = new EventEmitter<void>();
  @Output() seasonSelected = new EventEmitter<number>();

  public tmdb = inject(TmdbService);

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
    this.seasonSelected.emit(seasonNumber);
  }

}