import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable, of, tap } from 'rxjs';
import { ConfigService } from './config.service';
import { DiscoverMediaType, DiscoverParams, Genre, TmdbSearchResponse, TmdbSearchResult } from '../models/tmdb.model';

@Injectable({
  providedIn: 'root'
})
export class TmdbService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private readonly settings = this.config.settings;

  private readonly apiBaseUrl = this.settings.tmdb.baseUrl + '/3';
  private readonly imagesBaseUrl = this.settings.tmdb.imagesBaseUrl;
  private readonly apiKey = this.settings.tmdb.apiKey;
  private readonly language = this.settings.tmdb.defaultLanguage;

  private movieGenresCache: Genre[] | null = null;
  private tvGenresCache: Genre[] | null = null;

  /**
   * Мульти-поиск фильмов и сериалов
   * @param query Поисковый запрос
   * @param page Номер страницы (по умолчанию 1)
   */
  searchMulti(query: string, page: number = 1): Observable<{ results: TmdbSearchResult[], total_results: number, total_pages: number }> {
    return this.http.get<any>(`${this.apiBaseUrl}/search/multi`, {
      params: {
        api_key: this.apiKey,
        language: 'ru-RU',
        query: query,
        include_adult: 'false',
        page: String(page)
      }
    }).pipe(
      map(response => ({
        results: response.results || [],
        total_results: response.total_results || 0,
        total_pages: Math.min(response.total_pages || 1, 20) // TMDB ограничивает search до 20 страниц
      }))
    );
  }

  /**
   * Расширенный поиск через /discover/movie или /discover/tv.
   * Позволяет комбинировать текст + жанры + год + рейтинг + сортировку.
   */
  discover(params: DiscoverParams): Observable<{ results: TmdbSearchResult[], total_results: number, total_pages: number }> {
    const httpParams: Record<string, string> = {
      api_key: this.apiKey,
      language: 'ru-RU',
      include_adult: 'false',
      page: String(params.page || 1),
      sort_by: params.sortBy || 'popularity.desc'
    };

    if (params.genreIds?.length) {
      httpParams['with_genres'] = params.genreIds.join(',');
    }
    if (params.minRating && params.minRating > 0) {
      httpParams['vote_average.gte'] = String(params.minRating);
    }
    if (params.query?.trim()) {
      httpParams['with_text_query'] = params.query.trim();
    }
    
    if (params.countryCode) {
      httpParams['with_origin_country'] = params.countryCode;
    }

    const isMovie = params.mediaType === 'movie';
    if (params.yearFrom) {
      httpParams[isMovie ? 'primary_release_date.gte' : 'first_air_date.gte'] = `${params.yearFrom}-01-01`;
    }
    if (params.yearTo) {
      httpParams[isMovie ? 'primary_release_date.lte' : 'first_air_date.lte'] = `${params.yearTo}-12-31`;
    }

    const endpoint = isMovie ? 'discover/movie' : 'discover/tv';

    return this.http.get<any>(`${this.apiBaseUrl}/${endpoint}`, { params: httpParams }).pipe(
      map(response => ({
        results: (response.results || []).map((item: any) => ({ ...item, media_type: params.mediaType })),
        total_results: response.total_results || 0,
        total_pages: Math.min(response.total_pages || 1, 500)
      }))
    );
  }

  /**
   * Формирует полный URL для постера
   * @param path Путь к изображению из ответа TMDB (например, "/8kVDhV3.jpg")
   */
  getPosterUrl(path: string | null): string | null {
    if (!path) return null;
    return `${this.imagesBaseUrl}/t/p/${this.settings.tmdb.defaultPosterSize}${path}`;
  }

  /**
   * Формирует полный URL для фонового изображения (backdrop)
   * @param path Путь к изображению из ответа TMDB
   */
  getBackdropUrl(path: string | null): string | null {
    if (!path) return null;
    return `${this.imagesBaseUrl}/t/p/${this.settings.tmdb.defaultBackdropSize}${path}`;
  }

  /**
   * Извлекает год из строки даты (YYYY-MM-DD)
   * @param dateString Дата в формате ISO
   */
  getYear(dateString: string | null | undefined): number | null {
    if (!dateString) return null;
    const year = parseInt(dateString.substring(0, 4), 10);
    return isNaN(year) ? null : year;
  }

  /**
   * Получает название (для фильма или сериала)
   */
  getTitle(item: TmdbSearchResult): string {
    return item.media_type === 'movie' ? (item.title || 'Без названия') : (item.name || 'Без названия');
  }

  /**
   * Получает внешние идентификаторы (включая imdb_id) для фильма или сериала
   */
  getExternalIds(id: number, mediaType: 'movie' | 'tv'): Observable<{ imdb_id: string | null }> {
    return this.http.get<{ imdb_id: string | null }>(
      `${this.apiBaseUrl}/${mediaType}/${id}/external_ids`,
      { params: new HttpParams().set('api_key', this.apiKey) }
    );
  }

  /**
   * Получает полную информацию о фильме или сериале (с актерами и видео)
   */
  getFullDetails(id: number, mediaType: 'movie' | 'tv'): Observable<any> {
    const params = new HttpParams()
      .set('api_key', this.apiKey)
      .set('language', this.language)
      .set('append_to_response', 'videos,credits,seasons'); // Магия TMDB: всё в одном запросе

    return this.http.get<any>(`${this.apiBaseUrl}/${mediaType}/${id}`, { params });
  }

  /**
   * Получает список эпизодов для конкретного сезона сериала
   */
  getSeasonEpisodes(tvId: number, seasonNumber: number): Observable<any> {
    const params = new HttpParams()
      .set('api_key', this.apiKey)
      .set('language', this.language);

    return this.http.get<any>(
      `${this.apiBaseUrl}/tv/${tvId}/season/${seasonNumber}`,
      { params }
    );
  }

  /**
   * Формирует URL для скриншота эпизода (горизонтальное изображение)
   */
  getStillUrl(path: string | null): string | null {
    if (!path) return null;
    return `${this.imagesBaseUrl}/t/p/w300${path}`;
  }

  getMovieGenres(): Observable<Genre[]> {
    if (this.movieGenresCache) return of(this.movieGenresCache);
    return this.http.get<{ genres: Genre[] }>(`${this.apiBaseUrl}/genre/movie/list`, {
      params: { api_key: this.apiKey, language: 'ru-RU' }
    }).pipe(
      map(r => r.genres),
      tap(genres => (this.movieGenresCache = genres))
    );
  }

  getTvGenres(): Observable<Genre[]> {
    if (this.tvGenresCache) return of(this.tvGenresCache);
    return this.http.get<{ genres: Genre[] }>(`${this.apiBaseUrl}/genre/tv/list`, {
      params: { api_key: this.apiKey, language: 'ru-RU' }
    }).pipe(
      map(r => r.genres),
      tap(genres => (this.tvGenresCache = genres))
    );
  }

  getGenresFor(mediaType: DiscoverMediaType): Observable<Genre[]> {
    return mediaType === 'movie' ? this.getMovieGenres() : this.getTvGenres();
  }

}