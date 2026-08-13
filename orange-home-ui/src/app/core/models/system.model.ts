export interface SystemStatus {
  enabled: boolean;
  dryRun: boolean;
  actions: {
    reboot: boolean;
    shutdown: boolean;
  };
  actionInProgress: boolean;
  currentAction: 'reboot' | 'shutdown' | null;
  time: string;
  uptimeSeconds: number | null;
  cpuTempCelsius: number | null;
}

export interface SystemHealth {
  ok: boolean;
  time: string;
}

export interface SystemActionResponse {
  accepted: boolean;
  action: 'reboot' | 'shutdown';
  dryRun: boolean;
  executeInSeconds: number;
  error?: string;
}