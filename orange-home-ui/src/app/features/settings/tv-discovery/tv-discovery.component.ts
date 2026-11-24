import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TvControlService } from '../../../core/services/tv-control.service';
import { TvDevice, TvSettings, TvSettingsResponse, TvSettingsUpdateResponse } from '../../../core/models/tv.model';

interface PlayerOption {
  value: string;
  label: string;
  hint: string;
  icon: string;
}

@Component({
  selector: 'app-tv-discovery',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    ProgressSpinnerModule,
    ToastModule,
    ConfirmDialogModule
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './tv-discovery.component.html',
  styleUrl: './tv-discovery.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TvDiscoveryComponent implements OnInit {
  private readonly tvService = inject(TvControlService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  private readonly PLAYER_META: Record<string, { label: string; hint: string; icon: string }> = {
    nova: {
      label: 'Nova Video Player',
      hint: 'Запуск по SMB · позицию воспроизведения не отдаёт',
      icon: 'pi pi-play-circle'
    },
    kodi: {
      label: 'Kodi',
      hint: 'Запуск по SMB · точная позиция воспроизведения',
      icon: 'pi pi-video'
    },
    tcl: {
      label: 'Встроенный плеер TCL',
      hint: 'Только чтение статуса · запуск по SMB недоступен',
      icon: 'pi pi-desktop'
    }
  };

  readonly settings = signal<TvSettings | null>(null);
  readonly effectiveTarget = signal<string>('');
  readonly fallbackTarget = signal<string>('');
  readonly settingsPath = signal<string>('');
  readonly availablePlayers = signal<string[]>([]);

  readonly loadingSettings = signal<boolean>(false);
  readonly settingsError = signal<boolean>(false);

  readonly devices = signal<TvDevice[]>([]);
  readonly scanning = signal<boolean>(false);
  readonly subnet = signal<string>('');
  readonly hasSearched = signal<boolean>(false);

  readonly savingTarget = signal<string | null>(null);
  readonly savingPlayer = signal<boolean>(false);
  readonly resetting = signal<boolean>(false);

  readonly busy = computed(() => this.savingTarget() !== null || this.savingPlayer() || this.resetting());

  readonly playerOptions = computed<PlayerOption[]>(() =>
    this.availablePlayers().map(value => {
      const meta = this.PLAYER_META[value];
      return {
        value,
        label: meta?.label ?? value,
        hint: meta?.hint ?? 'Драйвер плеера',
        icon: meta?.icon ?? 'pi pi-play'
      };
    })
  );

  readonly savedDeviceMissing = computed(() => {
    const device = this.settings()?.device;
    if (!device || !this.hasSearched() || this.scanning()) return false;
    return !this.devices().some(d => d.target === device.target);
  });

  readonly visibleDevices = computed(() => {
    const selectedTarget = this.settings()?.device?.target ?? null;
    const saving = this.savingTarget();
    return this.devices().filter(d => d.target !== selectedTarget || d.target === saving);
  });

  readonly hiddenSelectedCount = computed(() => this.devices().length - this.visibleDevices().length);

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.loadingSettings.set(true);
    this.settingsError.set(false);

    this.tvService.getSettings().subscribe({
      next: (response) => {
        this.applySettingsResponse(response);
        this.loadingSettings.set(false);
      },
      error: () => {
        this.loadingSettings.set(false);
        this.settingsError.set(true);
        this.toast('error', 'Ошибка', 'Не удалось загрузить настройки ТВ');
      }
    });
  }

  discoverDevices(): void {
    if (this.scanning() || this.busy()) return;

    this.scanning.set(true);
    this.hasSearched.set(true);
    this.devices.set([]);

    this.tvService.discover().subscribe({
      next: (response) => {
        this.scanning.set(false);
        if (!response.ok) {
          this.toast('error', 'Ошибка', 'Сервер не вернул результаты сканирования');
          return;
        }

        this.subnet.set(response.subnet);
        this.devices.set(response.devices);

        if (response.count === 0) {
          this.toast('warn', 'Ничего не найдено', `В сети ${response.subnet} нет устройств с открытым портом 5555`);
        } else {
          this.toast('success', 'Поиск завершён', `Найдено устройств: ${response.count}`);
        }
      },
      error: () => {
        this.scanning.set(false);
        this.toast('error', 'Ошибка', 'Не удалось просканировать сеть');
      }
    });
  }

  isSelected(device: TvDevice): boolean {
    return this.settings()?.device?.target === device.target;
  }

  selectDevice(device: TvDevice): void {
    if (this.busy() || this.scanning()) return;

    if (this.isSelected(device)) {
      this.toast('info', 'Уже выбрано', `${device.name} уже используется`);
      return;
    }

    const previous = this.settings();
    const previousTarget = this.effectiveTarget();

    this.savingTarget.set(device.target);
    this.settings.set({ device, player: previous?.player ?? 'nova' });
    this.effectiveTarget.set(device.target);

    this.tvService.updateSettings({ device }).subscribe({
      next: (response) => {
        this.savingTarget.set(null);
        if (response.ok) {
          this.applySettingsResponse(response);
          this.toast('success', 'Телевизор выбран', `${device.name} · ${device.target}`);
        } else {
          this.rollback(previous, previousTarget);
          this.toast('error', 'Ошибка', response.error || 'Не удалось сохранить устройство');
        }
      },
      error: (err) => {
        this.savingTarget.set(null);
        this.rollback(previous, previousTarget);
        this.toast('error', 'Ошибка', this.extractError(err, 'Не удалось сохранить устройство'));
      }
    });
  }

  selectPlayer(player: string): void {
    if (this.busy() || this.settings()?.player === player) return;

    const previous = this.settings();
    const previousTarget = this.effectiveTarget();

    this.savingPlayer.set(true);
    this.settings.set({ device: previous?.device ?? null, player });

    this.tvService.updateSettings({ player }).subscribe({
      next: (response) => {
        this.savingPlayer.set(false);
        if (response.ok) {
          this.applySettingsResponse(response);
          this.toast('success', 'Плеер выбран', this.PLAYER_META[player]?.label ?? player);
        } else {
          this.rollback(previous, previousTarget);
          this.toast('error', 'Ошибка', response.error || 'Не удалось сохранить плеер');
        }
      },
      error: (err) => {
        this.savingPlayer.set(false);
        this.rollback(previous, previousTarget);
        this.toast('error', 'Ошибка', this.extractError(err, 'Не удалось сохранить плеер'));
      }
    });
  }

  confirmReset(): void {
    this.confirmationService.confirm({
      message: 'Выбор телевизора будет сброшен. Сервис вернётся к адресу по умолчанию из конфигурации. Продолжить?',
      header: 'Сброс выбора',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Сбросить',
      rejectLabel: 'Отмена',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.resetDevice()
    });
  }

  onDeviceKeydown(event: KeyboardEvent, device: TvDevice): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectDevice(device);
    }
  }

  private resetDevice(): void {
    const previous = this.settings();
    const previousTarget = this.effectiveTarget();

    this.resetting.set(true);
    this.settings.set({ device: null, player: previous?.player ?? 'nova' });
    this.effectiveTarget.set(this.fallbackTarget());

    this.tvService.updateSettings({ device: null }).subscribe({
      next: (response) => {
        this.resetting.set(false);
        if (response.ok) {
          this.applySettingsResponse(response);
          this.toast('info', 'Выбор сброшен', `Используется адрес по умолчанию: ${response.effectiveTarget}`);
        } else {
          this.rollback(previous, previousTarget);
          this.toast('error', 'Ошибка', response.error || 'Не удалось сбросить выбор');
        }
      },
      error: (err) => {
        this.resetting.set(false);
        this.rollback(previous, previousTarget);
        this.toast('error', 'Ошибка', this.extractError(err, 'Не удалось сбросить выбор'));
      }
    });
  }

  private applySettingsResponse(response: TvSettingsResponse | TvSettingsUpdateResponse): void {
    this.settings.set(response.settings);
    this.effectiveTarget.set(response.effectiveTarget);

    const full = response as TvSettingsResponse;
    if (full.fallbackTarget) this.fallbackTarget.set(full.fallbackTarget);
    if (full.settingsPath) this.settingsPath.set(full.settingsPath);
    if (full.availablePlayers?.length) this.availablePlayers.set(full.availablePlayers);
  }

  private rollback(previous: TvSettings | null, previousTarget: string): void {
    this.settings.set(previous);
    this.effectiveTarget.set(previousTarget);
  }

  private extractError(err: unknown, fallback: string): string {
    const body = (err as { error?: { error?: string } })?.error;
    return body?.error || fallback;
  }

  private toast(severity: 'success' | 'info' | 'warn' | 'error', summary: string, detail: string): void {
    this.messageService.add({ severity, summary, detail });
  }
}