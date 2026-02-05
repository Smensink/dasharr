import { ArrService } from './base/ArrService';
import { CacheService } from './cache.service';
import { ServiceConfig } from '../config/services.config';
import {
  SonarrSeries,
  SonarrEpisode,
  AddSonarrSeriesRequest,
  UpdateSonarrSeriesRequest,
} from '../types/sonarr.types';
import { UnifiedMediaItem, SearchResult } from '@dasharr/shared-types';

export class SonarrService extends ArrService<
  SonarrSeries,
  AddSonarrSeriesRequest,
  UpdateSonarrSeriesRequest
> {
  constructor(config: ServiceConfig, cacheService: CacheService) {
    super(config, 'sonarr', cacheService);
  }

  protected getItemsEndpoint(): string {
    return '/series';
  }

  protected getItemEndpoint(id: number): string {
    return `/series/${id}`;
  }

  // Sonarr-specific methods
  async getSeries(params?: any): Promise<SonarrSeries[]> {
    return this.getItems(params);
  }

  async getSeriesById(id: number): Promise<SonarrSeries> {
    return this.getItemById(id);
  }

  async getEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
    return this.withCache(
      this.getCacheKey('episodes', seriesId),
      30,
      () => this.client.get<SonarrEpisode[]>('/episode', { seriesId })
    );
  }

  async addSeries(series: AddSonarrSeriesRequest): Promise<SonarrSeries> {
    return this.addItem(series);
  }

  async updateSeries(
    id: number,
    updates: UpdateSonarrSeriesRequest
  ): Promise<SonarrSeries> {
    return this.updateItem(id, updates);
  }

  async deleteSeries(id: number, deleteFiles: boolean = false): Promise<void> {
    await this.client.delete(`/series/${id}?deleteFiles=${deleteFiles}`);
    await this.cacheService.delByPattern(this.serviceName);
  }

  async searchSeries(query: string): Promise<SearchResult[]> {
    return this.search(query);
  }

  async triggerSeriesSearch(
    seriesId: number,
    interactive: boolean = false
  ): Promise<void> {
    const commandNames = interactive
      ? ['SeriesSearch']
      : ['SeriesSearchAutomatic', 'SeriesSearch'];
    let lastError: unknown;

    for (const name of commandNames) {
      try {
        await this.executeCommand({
          name,
          seriesId,
          seriesIds: [seriesId],
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  async triggerSeasonSearch(
    seriesId: number,
    seasonNumber: number,
    interactive: boolean = false
  ): Promise<void> {
    const commandNames = interactive
      ? ['SeasonSearch']
      : ['SeasonSearchAutomatic', 'SeasonSearch'];
    let lastError: unknown;

    for (const name of commandNames) {
      try {
        await this.executeCommand({
          name,
          seriesId,
          seasonNumber,
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  async triggerEpisodeSearch(
    episodeIds: number[],
    interactive: boolean = false
  ): Promise<void> {
    const commandNames = interactive
      ? ['EpisodeSearch']
      : ['EpisodeSearchAutomatic', 'EpisodeSearch'];
    let lastError: unknown;

    for (const name of commandNames) {
      try {
        await this.executeCommand({
          name,
          episodeIds,
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

  // Transform Sonarr series to unified format
  transformToUnified(series: SonarrSeries): UnifiedMediaItem {
    const poster = series.images?.find((img) => img.coverType === 'poster');
    const backdrop = series.images?.find((img) => img.coverType === 'fanart');

    let status: UnifiedMediaItem['status'] = 'missing';
    if (series.episodeFileCount > 0) {
      status = 'available';
    } else if (series.monitored) {
      status = 'wanted';
    }

    return {
      id: `sonarr:${series.id}`,
      type: 'series',
      title: series.title,
      year: series.year,
      overview: series.overview,
      posterUrl: poster?.remoteUrl || poster?.url,
      backdropUrl: backdrop?.remoteUrl || backdrop?.url,
      status,
      qualityProfile: series.qualityProfileId.toString(),
      monitored: series.monitored,
      metadata: {
        seasonCount: series.seasonCount,
        episodeCount: series.episodeCount,
      },
      source: {
        service: 'sonarr',
        id: series.id,
      },
    };
  }
}
