export interface JackettResult {
  Tracker: string;
  TrackerType: string;
  CategoryDesc: string;
  Title: string;
  Description?: string;
  Guid: string;
  Link: string;
  Details: string;
  PublishDate: string;
  Size: number;
  Seeders: number;
  Peers: number;
  InfoHash: string;
  MagnetUri: string;
  Poster?: string;
}

export interface JackettSearchResponse {
  Results: JackettResult[];
  Error?: string;
}