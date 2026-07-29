export interface TorrentInfo {
  hash: string;
  name: string;
  added_on: number;
  state: string; // pausedDL, downloading, stalledDL, etc.
  progress: number; // от 0 до 1
  dlspeed: number; // байт/сек
  upspeed: number; // байт/сек
  num_seeds: number;
  num_leechs: number;
  size: number;
  category: string;
  save_path: string;
  eta: number;
  has_metadata: boolean;
}

export interface ServerState {
  free_space_on_disk: number;
}

export interface SyncMainDataResponse {
  rid: number;
  full_update: boolean;
  server_state: ServerState;
}

export interface TorrentFile {
  index: number;
  name: string;
  size: number;
  progress: number;
  priority: number; // 0=не качать, 1=обычный, 6=высокий, 7=максимум
  is_seed: boolean;
  piece_range?: number[];
  availability?: number;
}
