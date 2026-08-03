import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, tap, switchMap, map } from 'rxjs/operators';
import { SyncMainDataResponse, TorrentFile, TorrentInfo } from '../models/qbittorrent.model';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root'
})
export class QBittorrentService {
  private http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private readonly settings = this.config.settings;
  private apiBase = `${this.settings.qbittorrent.apiUrl}/api/v2`;
  
  private isAuthenticated = new BehaviorSubject<boolean>(false);

  constructor() {
    this.login().subscribe();
  }

  private login(): Observable<any> {
    const body = new HttpParams()
      .set('username', this.settings.qbittorrent.username)
      .set('password', this.settings.qbittorrent.password);

    return this.http.post(`${this.apiBase}/auth/login`, body.toString(), {
      responseType: 'text',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }).pipe(
      tap(() => this.isAuthenticated.next(true)),
      catchError(err => {
        console.error('qBittorrent login failed', err);
        return throwError(() => new Error('Ошибка авторизации qBittorrent'));
      })
    );
  }

  private ensureAuth<T>(observable: Observable<T>): Observable<T> {
    if (!this.isAuthenticated.value) {
      return this.login().pipe(switchMap(() => observable));
    }
    return observable;
  }

  getTorrents(): Observable<TorrentInfo[]> {
    return this.ensureAuth(this.http.get<TorrentInfo[]>(`${this.apiBase}/torrents/info`));
  }

  addTorrent(magnetUrl: string, isSeries: boolean, category: string): Observable<any> {
    const body = new HttpParams()
      .set('urls', magnetUrl)
      .set('savepath', this.settings.torrents.defaultSavePath)
      .set('category', category)
      .set('sequentialDownload', String(this.settings.torrents.sequentialDownload))
      .set('firstLastPiecePrio', String(this.settings.torrents.firstLastPiecePrio))
      .set('stopped', String(isSeries)); // Сериалы ставим на паузу для выбора серий

    return this.ensureAuth(
      this.http.post(`${this.apiBase}/torrents/add`, body.toString(), {
        responseType: 'text',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
    );
  }

  stopTorrent(hash: string): Observable<any> {
    const body = new HttpParams().set('hashes', hash);
    return this.ensureAuth(
      this.http.post(`${this.apiBase}/torrents/stop`, body.toString(), {
        responseType: 'text',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
    );
  }

  startTorrent(hash: string): Observable<any> {
    const body = new HttpParams().set('hashes', hash);
    return this.ensureAuth(
      this.http.post(`${this.apiBase}/torrents/start`, body.toString(), {
        responseType: 'text',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
    );
  }

  deleteTorrent(hash: string, deleteFiles: boolean = false): Observable<any> {
    const body = new HttpParams()
      .set('hashes', hash)
      .set('deleteFiles', String(deleteFiles));
      
    return this.ensureAuth(
      this.http.post(`${this.apiBase}/torrents/delete`, body.toString(), {
        responseType: 'text',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
    );
  }

  getFreeSpace(): Observable<number> {
    return this.ensureAuth(
      this.http.get<SyncMainDataResponse>(`${this.apiBase}/sync/maindata?rid=0`).pipe(
        map(response => response.server_state?.free_space_on_disk || 0)
      )
    );
  }

  /**
   * Получить список файлов торрента
   */
  getTorrentFiles(hash: string): Observable<TorrentFile[]> {
    return this.ensureAuth(
      this.http.get<TorrentFile[]>(`${this.apiBase}/torrents/files`, {
        params: new HttpParams().set('hash', hash) // <-- ИЗМЕНИЛИ 'hashes' НА 'hash'
      })
    );
  }

  /**
   * Установить приоритет для файлов торрента
   */
  setFilePriority(hash: string, fileIds: number[], priority: number): Observable<any> {
    const body = new HttpParams()
      .set('hash', hash) // <-- ИЗМЕНИЛИ 'hashes' НА 'hash'
      .set('id', fileIds.join('|'))
      .set('priority', priority.toString());

    return this.ensureAuth(
      this.http.post(`${this.apiBase}/torrents/filePrio`, body.toString(), {
        responseType: 'text',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
    );
  }

}