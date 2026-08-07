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