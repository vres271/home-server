import { ChangeDetectionStrategy, Component, OnInit, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Subject, takeUntil, timer } from 'rxjs';
import { SystemService } from '../../../core/services/system.service';
import { SystemStatus } from '../../../core/models/system.model';

@Component({
  selector: 'app-system-power-control',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    CardModule,
    ConfirmDialogModule,
    ToastModule,
    ProgressSpinnerModule
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './system-power-control.component.html',
  styleUrl: './system-power-control.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SystemPowerControlComponent implements OnInit, OnDestroy {
  private readonly systemService = inject(SystemService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly destroy$ = new Subject<void>();

  readonly status = signal<SystemStatus | null>(null);
  readonly loading = signal<boolean>(false);
  readonly actionInProgress = signal<boolean>(false);
  readonly waitingAction = signal<'reboot' | 'shutdown' | null>(null);
  readonly serverOnline = signal<boolean>(true);

  private pollInterval = 3000;
  private maxPollAttempts = 60;

  ngOnInit(): void {
    this.loadStatus();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadStatus(): void {
    this.loading.set(true);
    this.systemService.getStatus().subscribe({
      next: (status) => {
        this.status.set(status);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось получить статус системы'
        });
      }
    });
  }

  confirmReboot(): void {
    this.confirmationService.confirm({
      message: 'Сервер будет перезагружен. Продолжить?',
      header: 'Перезагрузка',
      icon: 'pi pi-refresh',
      acceptLabel: 'Перезагрузить',
      rejectLabel: 'Отмена',
      acceptButtonStyleClass: 'p-button-warn',
      accept: () => this.executeAction('reboot')
    });
  }

  confirmShutdown(): void {
    this.confirmationService.confirm({
      message: 'Сервер будет выключен. Убедитесь, что у вас есть способ включить его обратно. Продолжить?',
      header: 'Выключение',
      icon: 'pi pi-power-off',
      acceptLabel: 'Выключить',
      rejectLabel: 'Отмена',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.executeAction('shutdown')
    });
  }

  private executeAction(action: 'reboot' | 'shutdown'): void {
    this.actionInProgress.set(true);

    const request$ = action === 'reboot'
      ? this.systemService.reboot()
      : this.systemService.shutdown();

    request$.subscribe({
      next: (response) => {
        if (response.accepted) {
          this.messageService.add({
            severity: 'success',
            summary: action === 'reboot' ? 'Перезагрузка' : 'Выключение',
            detail: response.dryRun
              ? 'Dry-run: команда принята, но не выполнена'
              : 'Команда принята'
          });

          if (!response.dryRun) {
            this.startWaitingForServer(action);
          } else {
            this.actionInProgress.set(false);
            this.loadStatus();
          }
        } else {
          this.actionInProgress.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Ошибка',
            detail: response.error || 'Команда не была принята'
          });
        }
      },
      error: () => {
        this.actionInProgress.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось выполнить запрос'
        });
      }
    });
  }

  private startWaitingForServer(action: 'reboot' | 'shutdown'): void {
    this.waitingAction.set(action);
    this.serverOnline.set(false);

    if (action === 'shutdown') {
      this.messageService.add({
        severity: 'warn',
        summary: 'Выключение',
        detail: 'Сервер выключается. Обновите страницу, когда включите его обратно.'
      });
      this.actionInProgress.set(false);
      return;
    }

    let attempts = 0;

    timer(this.pollInterval, this.pollInterval)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        attempts++;

        this.systemService.getHealth().subscribe({
          next: () => {
            this.waitingAction.set(null);
            this.serverOnline.set(true);
            this.actionInProgress.set(false);
            this.messageService.add({
              severity: 'success',
              summary: 'Сервер доступен',
              detail: 'Перезагрузка завершена'
            });
            this.loadStatus();
            this.destroy$.next();
          },
          error: () => {
            if (attempts >= this.maxPollAttempts) {
              this.waitingAction.set(null);
              this.actionInProgress.set(false);
              this.messageService.add({
                severity: 'error',
                summary: 'Сервер не отвечает',
                detail: 'Превышено время ожидания после перезагрузки'
              });
              this.destroy$.next();
            }
          }
        });
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

  formatTemp(temp: number | null): string {
    if (temp === null) return 'нет данных';
    return `${temp.toFixed(1)} °C`;
  }

  tempClass(temp: number | null): string {
    if (temp === null) return '';
    if (temp >= 65) return 'temp-danger';
    if (temp >= 50) return 'temp-warning';
    return 'temp-normal';
  }  

}