// src/app/core/services/config.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AppConfig } from '../models/config.model';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private readonly http = inject(HttpClient);
  private config: AppConfig | null = null;
  public loadError: string | null = null;

  async loadConfig(): Promise<void> {
    try {
      this.config = await firstValueFrom(this.http.get<AppConfig>('/config.json'));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.loadError = 'Файл конфигурации не найден (404).';
      } else {
        this.loadError = `Ошибка загрузки: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`;
      }
      console.error('❌ ConfigService:', this.loadError);
    }
  }

  get settings(): AppConfig {
    if (!this.config) {
      throw new Error('Конфигурация не загружена. Проверьте наличие public/config.json');
    }
    return this.config;
  }
}