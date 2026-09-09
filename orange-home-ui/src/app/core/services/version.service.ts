import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, firstValueFrom } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

export interface VersionInfo {
  version: string;
  commitHash: string;
  buildDate: string;
  buildTimestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  private http = inject(HttpClient);
  private versionInfo: VersionInfo | null = null;

  /**
   * Загружает информацию о версии из version.json
   */
  loadVersion(): Observable<VersionInfo> {
    if (this.versionInfo) {
      return of(this.versionInfo);
    }

    // Путь /version.json, так как файл лежит в папке public
    return this.http.get<VersionInfo>('/version.json').pipe(
      tap(info => {
        this.versionInfo = info;
        console.log(`📦 Приложение версии ${info.version} (коммит ${info.commitHash})`);
      }),
      catchError(error => {
        console.warn('⚠️ Не удалось загрузить version.json. Используем заглушку.', error);
        return of({
          version: 'dev',
          commitHash: 'unknown',
          buildDate: new Date().toISOString(),
          buildTimestamp: Date.now()
        });
      })
    );
  }

  /**
   * Возвращает уже загруженную версию (синхронно)
   */
  getVersion(): VersionInfo | null {
    return this.versionInfo;
  }
}