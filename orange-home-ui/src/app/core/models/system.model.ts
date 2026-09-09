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

export interface UpdateCheckResponse {
  currentVersion: string | null;
  availableVersion: string | null;
  hasUpdate: boolean;
  downloadUrl: string | null;
}

export interface UpdateStatusResponse {
  status: 'idle' | 'checking' | 'downloading' | 'installing' | 'success' | 'error';
  currentVersion: string | null;
  availableVersion: string | null;
  message: string;
}

export interface UpdateInstallResponse {
  accepted: boolean;
  dryRun?: boolean;
  newVersion?: string;
  error?: string;
}