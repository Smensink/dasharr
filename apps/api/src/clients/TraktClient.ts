import { HttpClient } from './base/HttpClient';
import { ServiceConfig } from '../config/services.config';

export interface TraktIds {
  trakt?: number;
  imdb?: string;
  tmdb?: number;
  tvdb?: number;
}

export interface TraktShowOrMovie {
  title: string;
  year?: number;
  ids: TraktIds;
  overview?: string;
}

export interface TraktTrendingItem {
  watchers?: number;
  movie?: TraktShowOrMovie;
  show?: TraktShowOrMovie;
}

export interface TraktListItem {
  type: 'movie' | 'show';
  movie?: TraktShowOrMovie;
  show?: TraktShowOrMovie;
  notes?: string;
}

export interface TraktListSummary {
  name: string;
  description?: string;
  ids: {
    trakt?: number;
    slug?: string;
  };
  user: {
    username: string;
  };
}

export interface TraktListSearchResult {
  type: 'list';
  score?: number;
  list: TraktListSummary;
}

export class TraktClient {
  private client: HttpClient;

  constructor(config: ServiceConfig) {
    this.client = new HttpClient(
      {
        baseUrl: config.baseUrl,
        timeout: config.timeout,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Dasharr/1.0',
          'trakt-api-version': '2',
          'trakt-api-key': config.apiKey || '',
        },
      },
      'trakt'
    );
  }

  getTrending(
    type: 'movies' | 'shows',
    params?: { page?: number; limit?: number }
  ) {
    return this.client.get<TraktTrendingItem[]>(`/${type}/trending`, {
      extended: 'full',
      ...params,
    });
  }

  getAnticipated(
    type: 'movies' | 'shows',
    params?: { page?: number; limit?: number }
  ) {
    return this.client.get<TraktTrendingItem[]>(`/${type}/anticipated`, {
      extended: 'full',
      ...params,
    });
  }

  getListItems(user: string, list: string) {
    return this.client.get<TraktListItem[]>(
      `/users/${encodeURIComponent(user)}/lists/${encodeURIComponent(list)}/items`,
      { extended: 'full' }
    );
  }

  searchLists(query: string, limit: number = 10) {
    return this.client.get<TraktListSearchResult[]>('/search/list', {
      query,
      page: 1,
      limit,
    });
  }
}
