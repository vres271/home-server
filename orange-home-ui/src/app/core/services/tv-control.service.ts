import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  TvDiscoverResponse,
  TvSettingsResponse,
  TvSettingsUpdateRequest,
  TvSettingsUpdateResponse
} from '../models/tv.model';

@Injectable({
  providedIn: 'root'
})
export class TvControlService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/media';

  discover(): Observable<TvDiscoverResponse> {
    return this.http.get<TvDiscoverResponse>(`${this.baseUrl}/discover`);
  }

  getSettings(): Observable<TvSettingsResponse> {
    return this.http.get<TvSettingsResponse>(`${this.baseUrl}/settings`);
  }

  updateSettings(payload: TvSettingsUpdateRequest): Observable<TvSettingsUpdateResponse> {
    return this.http.post<TvSettingsUpdateResponse>(`${this.baseUrl}/settings`, payload);
  }
}