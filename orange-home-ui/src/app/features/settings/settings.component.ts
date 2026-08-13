import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CardModule } from 'primeng/card';
import { SystemService } from '../../core/services/system.service';
import { SystemStatus } from '../../core/models/system.model';
import { SystemPowerControlComponent } from './system-power-control/system-power-control.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CardModule, SystemPowerControlComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent implements OnInit {
  private readonly systemService = inject(SystemService);

  readonly status = signal<SystemStatus | null>(null);

  ngOnInit(): void {
    this.systemService.getStatus().subscribe({
      next: (status) => this.status.set(status),
      error: (err) => console.error('Failed to load system status', err)
    });
  }

  formatUptime(seconds: number | null): string {
    if (seconds === null) return 'неизвестно';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}д ${hours}ч ${minutes}м`;
    if (hours > 0) return `${hours}ч ${minutes}м`;
    return `${minutes}м`;
  }
}