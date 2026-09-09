import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SystemActionResponse, SystemHealth, SystemStatus, UpdateCheckResponse, UpdateInstallResponse, UpdateStatusResponse } from '../models/system.model';

@Injectable({
  providedIn: 'root'
})
export class SystemService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = '/api/system';
  private readonly actionHeaders = new HttpHeaders({
    'X-System-Action': 'true'
  });

  getStatus(): Observable<SystemStatus> {
    return this.http.get<SystemStatus>(`${this.baseUrl}/status`);
  }

  getHealth(): Observable<SystemHealth> {
    return this.http.get<SystemHealth>(`${this.baseUrl}/health`);
  }

  reboot(): Observable<SystemActionResponse> {
    return this.http.post<SystemActionResponse>(
      `${this.baseUrl}/actions/reboot`,
      null,
      { headers: this.actionHeaders }
    );
  }

  shutdown(): Observable<SystemActionResponse> {
    return this.http.post<SystemActionResponse>(
      `${this.baseUrl}/actions/shutdown`,
      null,
      { headers: this.actionHeaders }
    );
  }

  checkUpdate(): Observable<UpdateCheckResponse> {
    return this.http.get<UpdateCheckResponse>('/api/system/update/check');
  }

  installUpdate(): Observable<UpdateInstallResponse> {
    return this.http.post<UpdateInstallResponse>(
      '/api/system/update/install',
      {},
      { headers: { 'X-System-Action': 'true' } }
    );
  }

  getUpdateStatus(): Observable<UpdateStatusResponse> {
    return this.http.get<UpdateStatusResponse>('/api/system/update/status');
  }  

}