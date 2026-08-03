import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { JackettSearchResponse } from '../models/jackett.model';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root'
})
export class JackettService {
  private http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private readonly settings = this.config.settings;
  private apiUrl = `${this.settings.jackett.apiUrl}/api/v2.0/indexers/all/results`;

  /**
   * Поиск торрентов
   * @param query Поисковый запрос
   * @param categories Массив категорий (по умолчанию [2000, 5000] - фильмы и сериалы)
   */
  search(query: string, categories?: number[]): Observable<JackettSearchResponse> {
    // Создаём базовые параметры
    let params = new HttpParams()
      .set('apikey', this.settings.jackett.apiKey)
      .set('Query', query);
    
    // Добавляем все категории
    // HttpClient автоматически создаст ?Category=2000&Category=5000
    categories?.forEach(cat => {
      params = params.append('Category', cat.toString());
    });

    return this.http.get<JackettSearchResponse>(this.apiUrl, { params });
  }

}