import { HttpClient } from './base/HttpClient';
import { ServiceConfig } from '../config/services.config';

export interface OmdbResponse {
  Title?: string;
  Year?: string;
  imdbID?: string;
  imdbRating?: string;
  imdbVotes?: string;
  Poster?: string;
  Response?: 'True' | 'False';
  Error?: string;
}

export class OMDbClient {
  private client: HttpClient;
  private apiKey: string;

  constructor(config: ServiceConfig) {
    this.client = new HttpClient(
      {
        baseUrl: config.baseUrl,
        timeout: config.timeout,
      },
      'omdb'
    );
    this.apiKey = config.apiKey || '';
  }

  getByImdbId(imdbId: string) {
    return this.client.get<OmdbResponse>('/', {
      apikey: this.apiKey,
      i: imdbId,
      plot: 'short',
    });
  }
}
