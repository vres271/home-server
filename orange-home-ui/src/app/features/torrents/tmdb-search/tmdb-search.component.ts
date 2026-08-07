import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { TmdbService } from '../../../core/services/tmdb.service';
import { TmdbSearchResult } from '../../../core/models/tmdb.model';

@Component({
  selector: 'app-tmdb-search',
  standalone: true,
  imports: [CommonModule, FormsModule, InputTextModule, ButtonModule],
  templateUrl: './tmdb-search.component.html',
  styleUrls: ['./tmdb-search.component.css']
})
export class TmdbSearchComponent {
  private tmdbService = inject(TmdbService);
  private messageService = inject(MessageService);

  @Output() mediaSelected = new EventEmitter<TmdbSearchResult>();
  @Output() requestDirectSearch = new EventEmitter<void>();

  searchQuery = '';
  results: TmdbSearchResult[] = [];
  isLoading = false;
  hasSearched = false;

  search() {
    if (!this.searchQuery.trim()) return;
    this.isLoading = true;
    this.hasSearched = true;
    this.results = [];

    this.tmdbService.searchMulti(this.searchQuery).subscribe({
      next: (response) => {
        this.results = response.results || [];
        this.isLoading = false;
        
        if (this.results.length === 0) {
          this.messageService.add({ 
            severity: 'warn', 
            summary: 'Внимание', 
            detail: 'По вашему запросу в TMDB ничего не найдено. Попробуйте прямой поиск.' 
          });
        }
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось получить данные из TMDB' });
        this.isLoading = false;
      }
    });
  }

  onSelect(item: TmdbSearchResult) {
    this.mediaSelected.emit(item);
  }

  getTitle(item: TmdbSearchResult): string {
    return this.tmdbService.getTitle(item);
  }

  getYear(item: TmdbSearchResult): number | null {
    const date = item.media_type === 'movie' ? item.release_date : item.first_air_date;
    return this.tmdbService.getYear(date);
  }

  getPoster(item: TmdbSearchResult): string | null {
    return this.tmdbService.getPosterUrl(item.poster_path);
  }
}