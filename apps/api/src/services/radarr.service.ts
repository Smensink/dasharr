import { ArrService } from './base/ArrService';
import { CacheService } from './cache.service';
import { ServiceConfig } from '../config/services.config';
import {
  RadarrMovie,
  AddRadarrMovieRequest,
  UpdateRadarrMovieRequest,
} from '../types/radarr.types';
import { UnifiedMediaItem, SearchResult } from '@dasharr/shared-types';

export class RadarrService extends ArrService<
  RadarrMovie,
  AddRadarrMovieRequest,
  UpdateRadarrMovieRequest
> {
  constructor(config: ServiceConfig, cacheService: CacheService) {
    super(config, 'radarr', cacheService);
  }

  protected getItemsEndpoint(): string {
    return '/movie';
  }

  protected getItemEndpoint(id: number): string {
    return `/movie/${id}`;
  }

  // Radarr-specific methods
  async getMovies(params?: any): Promise<RadarrMovie[]> {
    return this.getItems(params);
  }

  async getMovieById(id: number): Promise<RadarrMovie> {
    return this.getItemById(id);
  }

  async addMovie(movie: AddRadarrMovieRequest): Promise<RadarrMovie> {
    return this.addItem(movie);
  }

  async updateMovie(
    id: number,
    updates: UpdateRadarrMovieRequest
  ): Promise<RadarrMovie> {
    return this.updateItem(id, updates);
  }

  async deleteMovie(id: number, deleteFiles: boolean = false): Promise<void> {
    await this.client.delete(`/movie/${id}?deleteFiles=${deleteFiles}`);
    await this.cacheService.delByPattern(this.serviceName);
  }

  async searchMovie(query: string): Promise<SearchResult[]> {
    return this.search(query);
  }

  async triggerMovieSearch(
    movieId: number,
    interactive: boolean = false
  ): Promise<void> {
    const commandNames = interactive
      ? ['MoviesSearch', 'MovieSearch']
      : ['MoviesSearchAutomatic', 'MoviesSearch', 'MovieSearch'];
    let lastError: unknown;

    for (const name of commandNames) {
      try {
        await this.executeCommand({
          name,
          movieIds: [movieId],
          movieId,
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  async getRootFolders(): Promise<any[]> {
    return this.client.get('/rootfolder');
  }

  // Transform Radarr movie to unified format
  transformToUnified(movie: RadarrMovie): UnifiedMediaItem {
    const poster = movie.images?.find((img) => img.coverType === 'poster');
    const backdrop = movie.images?.find((img) => img.coverType === 'fanart');

    let status: UnifiedMediaItem['status'] = 'missing';
    if (movie.hasFile) {
      status = 'available';
    } else if (movie.monitored) {
      status = 'wanted';
    }

    return {
      id: `radarr:${movie.id}`,
      type: 'movie',
      title: movie.title,
      year: movie.year,
      overview: movie.overview,
      posterUrl: poster?.remoteUrl || poster?.url,
      backdropUrl: backdrop?.remoteUrl || backdrop?.url,
      status,
      qualityProfile: movie.qualityProfileId.toString(),
      monitored: movie.monitored,
      metadata: {
        runtime: movie.runtime,
      },
      source: {
        service: 'radarr',
        id: movie.id,
      },
    };
  }
}
