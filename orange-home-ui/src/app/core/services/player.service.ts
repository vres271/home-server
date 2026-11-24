import { HttpClient } from '@angular/common/http';
import { Injectable, inject, OnDestroy } from '@angular/core';
import { Observable, BehaviorSubject, interval, of, Subject } from 'rxjs';
import { catchError, switchMap, takeUntil } from 'rxjs/operators';

export interface MediaPlayRequest {
  file: string;
  target?: string;
}

export interface MediaPlayResponse {
  ok: boolean;
  target?: string;
  smbUrl?: string;
  output?: string;
  error?: string;
  details?: string;
}

export interface TvStatus {
  active: boolean;
  isPlaying: boolean;
  filePath: string | null;
  title: string | null;
  positionSeconds: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class PlayerService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/media';
  private readonly destroy$ = new Subject<void>();

  private statusSubject = new BehaviorSubject<TvStatus>({
    active: false,
    isPlaying: false,
    filePath: null,
    title: null,
    positionSeconds: null
  });

  public status$ = this.statusSubject.asObservable();

  constructor() {
    this.startPolling();
  }

  private startPolling() {
    interval(3000).pipe(
      takeUntil(this.destroy$),
      switchMap(() => 
        this.http.get<TvStatus>(`${this.baseUrl}/status`).pipe(
          catchError(() => of({ active: false, isPlaying: false, filePath: null, title: null, positionSeconds: null }))
        )
      )
    ).subscribe(status => {
      this.statusSubject.next(status);
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  playOnTv(file: string, target?: string): Observable<MediaPlayResponse> {
    const payload: MediaPlayRequest = { file };
    if (target) payload.target = target;
    return this.http.post<MediaPlayResponse>(`${this.baseUrl}/play`, payload);
  }

  togglePlayPause(target?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/control`, { action: 'play_pause', target });
  }

  stop(target?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/control`, { action: 'stop', target });
  }
}