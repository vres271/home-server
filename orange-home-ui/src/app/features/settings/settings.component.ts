import { 
  ChangeDetectionStrategy, 
  Component, 
  OnInit, 
  inject, 
  signal, 
  OnDestroy 
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Subject, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';

// Ваши сервисы и модели
import { SystemService } from '../../core/services/system.service';
import { SystemStatus, UpdateCheckResponse, UpdateStatusResponse } from '../../core/models/system.model';
import { VersionService, VersionInfo } from '../../core/services/version.service';

// Ваши компоненты
import { SystemPowerControlComponent } from './system-power-control/system-power-control.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CardModule,
    ButtonModule,
    ProgressSpinnerModule,
    ConfirmDialogModule,
    ToastModule,
    DatePipe,
    SystemPowerControlComponent
  ],
  providers: [
    ConfirmationService, 
    MessageService
  ], // <-- КРИТИЧЕСКИ ВАЖНО для работы диалогов и тостов
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent implements OnInit, OnDestroy {
  private readonly systemService = inject(SystemService);
  private readonly versionService = inject(VersionService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly destroy$ = new Subject<void>();

  readonly status = signal<SystemStatus | null>(null);
  readonly versionInfo = signal<VersionInfo | null>(this.versionService.getVersion());

  // Сигналы для управления обновлениями
  readonly updateCheck = signal<UpdateCheckResponse | null>(null);
  readonly updateStatus = signal<UpdateStatusResponse | null>(null);
  readonly checkingUpdate = signal<boolean>(false);
  readonly installingUpdate = signal<boolean>(false);

  ngOnInit(): void {
    this.systemService.getStatus().subscribe({
      next: (status) => this.status.set(status),
      error: (err) => console.error('Failed to load system status', err)
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // --- ЛОГИКА ОБНОВЛЕНИЙ ---

  checkForUpdates(): void {
    this.checkingUpdate.set(true);
    this.systemService.checkUpdate().subscribe({
      next: (response) => {
        this.updateCheck.set(response);
        this.checkingUpdate.set(false);
        if (response.hasUpdate) {
          this.confirmUpdate(response);
        } else {
          this.messageService.add({
            severity: 'info',
            summary: 'Обновления',
            detail: response.currentVersion
              ? `У вас последняя версия (v${response.currentVersion})`
              : 'Не удалось определить текущую версию'
          });
        }
      },
      error: () => {
        this.checkingUpdate.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось проверить обновления'
        });
      }
    });
  }

  private confirmUpdate(response: UpdateCheckResponse): void {
    this.confirmationService.confirm({
      message: `Доступна новая версия v${response.availableVersion} (текущая: v${response.currentVersion}). Установить?`,
      header: 'Обновление',
      icon: 'pi pi-download',
      acceptLabel: 'Установить',
      rejectLabel: 'Отмена',
      acceptButtonStyleClass: 'p-button-success',
      accept: () => this.startUpdate(response)
    });
  }

  private startUpdate(response: UpdateCheckResponse): void {
    this.installingUpdate.set(true);
    this.systemService.installUpdate().subscribe({
      next: (installResponse) => {
        if (installResponse.accepted) {
          if (installResponse.dryRun) {
            this.messageService.add({
              severity: 'info',
              summary: 'Dry-run',
              detail: `Обновление до v${installResponse.newVersion} (dry-run)`
            });
            this.installingUpdate.set(false);
          } else {
            this.messageService.add({
              severity: 'info',
              summary: 'Обновление',
              detail: `Установка v${installResponse.newVersion} запущена...`
            });
            this.startUpdatePolling();
          }
        } else {
          this.installingUpdate.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Ошибка',
            detail: installResponse.error || 'Не удалось начать обновление'
          });
        }
      },
      error: () => {
        this.installingUpdate.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Ошибка',
          detail: 'Не удалось начать обновление'
        });
      }
    });
  }

  private startUpdatePolling(): void {
    timer(1000, 1500)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.systemService.getUpdateStatus().subscribe({
          next: (status) => {
            this.updateStatus.set(status);
            
            if (status.status === 'success') {
              this.installingUpdate.set(false);
              this.destroy$.next(); // Остановить polling
              this.messageService.add({
                severity: 'success',
                summary: 'Обновление завершено',
                detail: `Установлена версия v${status.availableVersion}. Перезагрузите страницу.`,
                life: 10000
              });
            } else if (status.status === 'error') {
              this.installingUpdate.set(false);
              this.destroy$.next();
              this.messageService.add({
                severity: 'error',
                summary: 'Ошибка обновления',
                detail: status.message
              });
            }
          }
        });
      });
  }
}