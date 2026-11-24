import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface PendingDownload {
  id: string;
  name: string;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class PendingDownloadService {
  private pendingSubject = new BehaviorSubject<PendingDownload[]>([]);
  pending$ = this.pendingSubject.asObservable();

  add(name: string): string {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    const current = this.pendingSubject.value;
    this.pendingSubject.next([...current, { id, name, timestamp: Date.now() }]);
    return id; // Возвращаем ID, чтобы можно было удалить при ошибке
  }

  remove(id: string) {
    const current = this.pendingSubject.value;
    this.pendingSubject.next(current.filter(p => p.id !== id));
  }

  clear() {
    this.pendingSubject.next([]);
  }
}