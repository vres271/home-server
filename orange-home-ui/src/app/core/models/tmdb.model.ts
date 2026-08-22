export interface TmdbSearchResult {
  id: number;
  media_type: 'movie' | 'tv';
  title?: string;       // Для фильмов
  name?: string;        // Для сериалов
  original_title?: string;
  original_name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;    // Для фильмов
  first_air_date?: string;  // Для сериалов
  vote_average: number;
  popularity: number;
}

export interface TmdbSearchResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbSearchResult[];
}

export interface TmdbCredit {
  name: string;
  character?: string;
  job?: string;
  profile_path: string | null;
}

export interface TmdbVideo {
  name: string;
  key: string;
  site: string;
  type: string;
}

export interface TmdbSeason {
  season_number: number;
  name: string;
  air_date: string | null;
  episode_count: number;
  poster_path: string | null;
  overview: string;
  vote_average: number;
}

export interface Genre {
  id: number;
  name: string;
}

export interface TmdbPerson {
  id: number;
  name: string;
  original_name: string;
  profile_path: string | null;
  known_for_department: string; // 'Acting', 'Directing', 'Writing' и т.д.
}

export type DiscoverMediaType = 'movie' | 'tv';

export type DiscoverSortBy =
  | 'popularity.desc'
  | 'popularity.asc'
  | 'vote_average.desc'
  | 'vote_average.asc'
  | 'primary_release_date.desc'
  | 'primary_release_date.asc'
  | 'first_air_date.desc'
  | 'first_air_date.asc';

export interface DiscoverParams {
  mediaType: DiscoverMediaType;
  query?: string;
  genreIds?: number[];
  yearFrom?: number;
  yearTo?: number;
  minRating?: number;
  countryCode?: string;
  personId?: number;
  sortBy?: DiscoverSortBy;
  page?: number;
}