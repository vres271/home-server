import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, tap, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { TorrentInfo } from '../models/qbittorrent.model';

@Injectable({
  providedIn: 'root'
})
export class QBittorrentService {
  private http = inject(HttpClient);
  private apiBase = `${environment.qbittorrent.apiUrl}/api/v2`;
  
  private isAuthenticated = new BehaviorSubject<boolean>(false);

  constructor() {
    this.login().subscribe();
  }

  private login(): Observable<any> {
    const body = new HttpParams()
      .set('username', environment.qbittorrent.username)
      .set('password', environment.qbittorrent.password);

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
      .set('savepath', environment.torrents.defaultSavePath)
      .set('category', category)
      .set('sequentialDownload', String(environment.torrents.sequentialDownload))
      .set('firstLastPiecePrio', String(environment.torrents.firstLastPiecePrio))
      .set('paused', String(isSeries)); // Сериалы ставим на паузу для выбора серий

    return this.ensureAuth(
      this.http.post(`${this.apiBase}/torrents/add`, body.toString(), {
        responseType: 'text',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
    );
  }

  pauseTorrent(hash: string): Observable<any> {
    const body = new HttpParams().set('hashes', hash);
    return this.ensureAuth(
      this.http.post(`${this.apiBase}/torrents/pause`, body.toString(), {
        responseType: 'text',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
    );
  }

  resumeTorrent(hash: string): Observable<any> {
    const body = new HttpParams().set('hashes', hash);
    return this.ensureAuth(
      this.http.post(`${this.apiBase}/torrents/resume`, body.toString(), {
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
}