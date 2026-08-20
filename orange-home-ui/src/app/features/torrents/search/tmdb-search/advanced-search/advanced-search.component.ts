import {
  Component, ChangeDetectionStrategy, ChangeDetectorRef,
  EventEmitter, Output, inject, OnInit, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, forkJoin } from 'rxjs';

import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';

import { TmdbService } from '../../../../../core/services/tmdb.service';
import {
  DiscoverParams, DiscoverMediaType, DiscoverSortBy, Genre
} from '../../../../../core/models/tmdb.model';

interface SelectOption { label: string; value: any; }

@Component({
  selector: 'app-advanced-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule,
    InputTextModule, DropdownModule, MultiSelectModule,
    InputNumberModule, ButtonModule, ChipModule
  ],
  templateUrl: './advanced-search.component.html',
  styleUrls: ['./advanced-search.component.css']
})
export class AdvancedSearchComponent implements OnInit, OnDestroy {
  private readonly tmdb = inject(TmdbService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  @Output() search = new EventEmitter<DiscoverParams>();
  @Output() close = new EventEmitter<void>();

  // Форма
  mediaType: DiscoverMediaType = 'movie';
  query = '';
  selectedGenreIds: number[] = [];
  yearFrom: number | null = null;
  yearTo: number | null = null;
  minRating: number = 0;
  sortBy: DiscoverSortBy = 'popularity.desc';

  // Данные для UI
  movieGenres: Genre[] = [];
  tvGenres: Genre[] = [];
  genresLoading = false;

  sortOptions: SelectOption[] = [
    { label: 'По популярности ↓', value: 'popularity.desc' },
    { label: 'По рейтингу ↓', value: 'vote_average.desc' },
    { label: 'Сначала новые', value: 'primary_release_date.desc' },
    { label: 'Сначала старые', value: 'primary_release_date.asc' }
  ];

  tvSortOptions: SelectOption[] = [
    { label: 'По популярности ↓', value: 'popularity.desc' },
    { label: 'По рейтингу ↓', value: 'vote_average.desc' },
    { label: 'Сначала новые', value: 'first_air_date.desc' },
    { label: 'Сначала старые', value: 'first_air_date.asc' }
  ];

  currentYear = new Date().getFullYear();

  get currentGenres(): Genre[] {
    return this.mediaType === 'movie' ? this.movieGenres : this.tvGenres;
  }

  get genreOptions(): SelectOption[] {
    return this.currentGenres.map(g => ({ label: g.name, value: g.id }));
  }

  get currentSortOptions(): SelectOption[] {
    return this.mediaType === 'movie' ? this.sortOptions : this.tvSortOptions;
  }

  ngOnInit(): void {
    this.loadGenres();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadGenres(): void {
    this.genresLoading = true;
    this.cdr.markForCheck();

    forkJoin({
      movie: this.tmdb.getMovieGenres(),
      tv: this.tmdb.getTvGenres()
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ movie, tv }) => {
          this.movieGenres = movie;
          this.tvGenres = tv;
          this.genresLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.genresLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  onMediaTypeChange(): void {
    this.selectedGenreIds = [];
    // Сбрасываем сортировку на дефолт для нового типа
    this.sortBy = 'popularity.desc';
    this.cdr.markForCheck();
  }

  onRatingChange(value: number | null): void {
    this.minRating = value && value > 0 ? Math.min(value, 10) : 0;
    this.cdr.markForCheck();
  }

  submit(): void {
    if (this.yearFrom && this.yearTo && this.yearFrom > this.yearTo) {
      [this.yearFrom, this.yearTo] = [this.yearTo, this.yearFrom];
    }

    this.search.emit({
      mediaType: this.mediaType,
      query: this.query.trim() || undefined,
      genreIds: this.selectedGenreIds.length ? this.selectedGenreIds : undefined,
      yearFrom: this.yearFrom || undefined,
      yearTo: this.yearTo || undefined,
      minRating: this.minRating > 0 ? this.minRating : undefined,
      sortBy: this.sortBy
    });
  }

  reset(): void {
    this.query = '';
    this.selectedGenreIds = [];
    this.yearFrom = null;
    this.yearTo = null;
    this.minRating = 0;
    this.sortBy = 'popularity.desc';
    this.cdr.markForCheck();
  }

  onClose(): void {
    this.close.emit();
  }
}