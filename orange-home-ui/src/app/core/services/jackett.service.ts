import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { JackettSearchResponse } from '../models/jackett.model';

@Injectable({
  providedIn: 'root'
})
export class JackettService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.jackett.apiUrl}/api/v2.0/indexers/all/results`;

  search(query: string): Observable<JackettSearchResponse> {
    const params = new HttpParams()
      .set('apikey', environment.jackett.apiKey)
      .set('Query', query)
    //   .set('Category', '0'); // 0 = все категории

    return this.http.get<JackettSearchResponse>(this.apiUrl, { params });
  }
}