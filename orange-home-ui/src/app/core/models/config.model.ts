/** Конфигурация Jackett */
export interface JackettConfig {
  readonly apiUrl: string;
  readonly apiKey: string;
}

/** Конфигурация qBittorrent */
export interface QbittorrentConfig {
  readonly apiUrl: string;
  readonly username: string;
  readonly password: string;
}

/** Настройки по умолчанию для торрентов */
export interface TorrentDefaults {
  readonly defaultSavePath: string;
  readonly sequentialDownload: boolean;
  readonly firstLastPiecePrio: boolean;
}

/** Конфигурация TMDB */
export interface TmdbConfig {
  readonly baseUrl: string;
  readonly imagesBaseUrl: string;
  readonly apiKey: string;
  readonly defaultLanguage: string;
  readonly defaultPosterSize: string;
  readonly defaultBackdropSize: string;
}

/** Главный интерфейс окружения */
export interface AppConfig {
  readonly production: boolean;
  readonly jackett: JackettConfig;
  readonly qbittorrent: QbittorrentConfig;
  readonly torrents: TorrentDefaults;
  readonly tmdb: TmdbConfig;
}
