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
}