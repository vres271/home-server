import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from './config.service';
import { TmdbSearchResponse, TmdbSearchResult } from '../models/tmdb.model';

@Injectable({
  providedIn: 'root'
})
export class TmdbService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private readonly settings = this.config.settings;

  private readonly apiBaseUrl = this.settings.tmdb.baseUrl;
  private readonly imagesBaseUrl = this.settings.tmdb.imagesBaseUrl;
  private readonly apiKey = this.settings.tmdb.apiKey;
  private readonly language = this.settings.tmdb.defaultLanguage;

  /**
   * Мульти-поиск фильмов и сериалов
   * @param query Поисковый запрос
   * @param page Номер страницы (по умолчанию 1)
   */
  searchMulti(query: string, page: number = 1): Observable<TmdbSearchResponse> {
    const params = new HttpParams()
      .set('api_key', this.apiKey)
      .set('query', query)
      .set('page', page.toString())
      .set('language', this.language)
      .set('include_adult', 'false');

    return this.http.get<TmdbSearchResponse>(`${this.apiBaseUrl}/3/search/multi`, { params });
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
      `${this.apiBaseUrl}/3/${mediaType}/${id}/external_ids`,
      { params: new HttpParams().set('api_key', this.apiKey) }
    );
  }
  
}