export interface JackettResult {
  Tracker: string;
  TrackerType: string;
  CategoryDesc: string;
  Title: string;
  Guid: string;
  Link: string; // Ссылка на скачивание через Jackett (с apiKey)
  Details: string;
  PublishDate: string;
  Size: number; // в байтах
  Seeders: number;
  Peers: number;
  InfoHash: string;
  MagnetUri: string;
}

export interface JackettSearchResponse {
  Results: JackettResult[];
  Error?: string;
}