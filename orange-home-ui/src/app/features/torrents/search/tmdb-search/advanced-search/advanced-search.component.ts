import {
  Component, ChangeDetectionStrategy, ChangeDetectorRef,
  EventEmitter, Output, inject, OnInit, OnDestroy,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, forkJoin } from 'rxjs';

import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';

import { TmdbService } from '../../../../../core/services/tmdb.service';
import {
  DiscoverParams, DiscoverMediaType, DiscoverSortBy, Genre
} from '../../../../../core/models/tmdb.model';
import { SelectModule } from 'primeng/select';
import { PersonSearchComponent } from "./person-search/person-search.component";

interface SelectOption { label: string; value: any; }

interface CountryOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-advanced-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule,
    InputTextModule, SelectModule, MultiSelectModule,
    InputNumberModule, ButtonModule, ChipModule,
    PersonSearchComponent
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
  @ViewChild(PersonSearchComponent) personSearchComponent!: PersonSearchComponent;

  // Форма
  mediaType: DiscoverMediaType = 'movie';
  query = '';
  selectedGenreIds: number[] = [];
  currentYear = new Date().getFullYear();
  yearFrom: number | null = null;
  yearTo: number | null = null;
  minRating: number | null = null;
  selectedCountryCode: string | null = null;
  selectedPersonId: number | null = null;
  selectedPersonName: string | null = null;
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

  countryOptions: CountryOption[] = [
    { label: 'США', value: 'US' },
    { label: 'Россия', value: 'RU' },
    { label: 'Великобритания', value: 'GB' },
    { label: 'Южная Корея', value: 'KR' },
    { label: 'Япония', value: 'JP' },
    { label: 'Франция', value: 'FR' },
    { label: 'Германия', value: 'DE' },
    { label: 'Индия', value: 'IN' },
    { label: 'Испания', value: 'ES' },
    { label: 'Италия', value: 'IT' },
    { label: 'Канада', value: 'CA' },
    { label: 'Австралия', value: 'AU' },
    { label: 'Китай', value: 'CN' },
    { label: 'Мексика', value: 'MX' },
    { label: 'Бразилия', value: 'BR' },
    { label: 'Швеция', value: 'SE' },
    { label: 'Норвегия', value: 'NO' },
    { label: 'Дания', value: 'DK' },
    { label: 'Новая Зеландия', value: 'NZ' },
    { label: 'Гонконг', value: 'HK' }
  ];

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

  onPersonSelected(event: { id: number, name: string }): void {
    if (event.id === 0) {
      this.selectedPersonId = null;
      this.selectedPersonName = null;
    } else {
      this.selectedPersonId = event.id;
      this.selectedPersonName = event.name;
    }
    this.cdr.markForCheck();
  }

  // Методы для установки дефолтных значений при фокусе
  setDefaultYearFrom(): void {
    if (this.yearFrom === null || this.yearFrom === undefined) {
      this.yearFrom = this.currentYear - 10;
      this.cdr.markForCheck();
    }
  }

  setDefaultYearTo(): void {
    if (this.yearTo === null || this.yearTo === undefined) {
      this.yearTo = this.currentYear;
      this.cdr.markForCheck();
    }
  }

  setDefaultRating(): void {
    if (this.minRating === null || this.minRating === undefined || this.minRating === 0) {
      this.minRating = 7.0;
      this.cdr.markForCheck();
    }
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
      minRating: this.minRating || undefined,
      countryCode: this.selectedCountryCode || undefined,
      personId: this.selectedPersonId || undefined,
      sortBy: this.sortBy
    });
  }

  reset(): void {
    this.query = '';
    this.selectedGenreIds = [];
    this.yearFrom = null;
    this.yearTo = null;
    this.minRating = 0;
    this.selectedCountryCode = null;
    this.selectedPersonId = null;
    this.selectedPersonName = null;
    this.sortBy = 'popularity.desc';
    this.cdr.markForCheck();
    if (this.personSearchComponent) {
      this.personSearchComponent.clearSelection();
    }    
  }

  onClose(): void {
    this.close.emit();
  }
}