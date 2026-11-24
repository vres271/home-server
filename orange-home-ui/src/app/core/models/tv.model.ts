export interface TvDevice {
  ip: string;
  port: number;
  target: string;
  name: string;
}

export interface TvDiscoverResponse {
  ok: boolean;
  subnet: string;
  devices: TvDevice[];
  count: number;
}

export interface TvSettings {
  device: TvDevice | null;
  player: string;
}

export interface TvSettingsResponse {
  ok: boolean;
  settings: TvSettings;
  effectiveTarget: string;
  fallbackTarget: string;
  availablePlayers: string[];
  settingsPath: string;
}

export interface TvSettingsUpdateResponse {
  ok: boolean;
  settings: TvSettings;
  effectiveTarget: string;
  error?: string;
}

export interface TvSettingsUpdateRequest {
  device?: TvDevice | null;
  player?: string;
}