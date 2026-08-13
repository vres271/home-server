import { Component, Input, ChangeDetectionStrategy, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TmdbService } from '../../../../core/services/tmdb.service';

@Component({
  selector: 'app-episode-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ButtonModule],
  templateUrl: './episode-list.component.html',
  styleUrls: ['./episode-list.component.css']
})
export class EpisodeListComponent {
  @Input() episodes: any[] = [];
  @Input() seasonNumber: number = 1;

  @Output() hideEpisodes = new EventEmitter<void>();

  private tmdb = inject(TmdbService);

  viewMode: 'grid' | 'list' = 'grid';

  onToggleViewMode() {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
  }

  getStillUrl(path: string | null): string | null {
    return this.tmdb.getStillUrl(path);
  }

  getYear(dateString: string | null): string {
    if (!dateString) return 'TBA';
    return dateString.substring(0, 4);
  }

  getEpisodeLabel(episode: any): string {
    return `Эпизод ${episode.episode_number}`;
  }

  onHideEpisodes() {
    this.hideEpisodes.emit();
  }
  
}