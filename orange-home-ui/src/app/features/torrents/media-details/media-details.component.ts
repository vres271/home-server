import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TmdbSearchResult } from '../../../core/models/tmdb.model';
import { TmdbService } from '../../../core/services/tmdb.service';

@Component({
  selector: 'app-media-details',
  standalone: true,
  imports: [CommonModule, ButtonModule, TagModule],
  templateUrl: './media-details.component.html',
  styleUrls: ['./media-details.component.css']
})
export class MediaDetailsComponent {
  @Input() media!: TmdbSearchResult;
  @Input() fullDetails: any = null;
  @Input() isLoadingDetails = false;
  
  @Output() goBack = new EventEmitter<void>(); // Событие для кнопки "Назад"

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
    return this.fullDetails.credits.cast.slice(0, 6); // Топ-6 актеров
  }


}