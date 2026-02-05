import { HttpClient } from './base/HttpClient';
import { ServiceConfig } from '../config/services.config';

export interface TmdbMediaItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string;
  backdrop_path?: string;
}

export interface TmdbListResponse {
  results: TmdbMediaItem[];
}

export interface TmdbExternalIds {
  imdb_id?: string;
  tvdb_id?: number;
}

export interface TmdbDetails {
  poster_path?: string;
  backdrop_path?: string;
}

export class TMDBClient {
  private client: HttpClient;
  private apiKey: string;

  constructor(config: ServiceConfig) {
    this.client = new HttpClient(
      {
        baseUrl: config.baseUrl,
        timeout: config.timeout,
      },
      'tmdb'
    );
    this.apiKey = config.apiKey || '';
  }

  private getWithKey<T>(url: string, params?: Record<string, any>): Promise<T> {
    return this.client.get<T>(url, { ...params, api_key: this.apiKey });
  }

  getTrending(mediaType: 'movie' | 'tv', timeWindow: 'day' | 'week' = 'week') {
    return this.getWithKey<TmdbListResponse>(
      `/trending/${mediaType}/${timeWindow}`
    );
  }

  getPopular(mediaType: 'movie' | 'tv') {
    return this.getWithKey<TmdbListResponse>(`/${mediaType}/popular`);
  }

  getUpcoming() {
    return this.getWithKey<TmdbListResponse>('/movie/upcoming');
  }

  getNowPlaying() {
    return this.getWithKey<TmdbListResponse>('/movie/now_playing');
  }

  discoverMovies(params: Record<string, any>) {
    return this.getWithKey<TmdbListResponse>('/discover/movie', params);
  }

  discoverTv(params: Record<string, any>) {
    return this.getWithKey<TmdbListResponse>('/discover/tv', params);
  }

  getConfiguration() {
    return this.getWithKey<{ images?: { base_url?: string } }>('/configuration');
  }

  getExternalIds(mediaType: 'movie' | 'tv', id: number) {
    return this.getWithKey<TmdbExternalIds>(`/${mediaType}/${id}/external_ids`);
  }

  getDetails(mediaType: 'movie' | 'tv', id: number) {
    return this.getWithKey<TmdbDetails>(`/${mediaType}/${id}`);
  }
}
