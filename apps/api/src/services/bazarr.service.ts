import { HttpClient } from '../clients/base/HttpClient';
import { CacheService } from './cache.service';
import { ServiceConfig } from '../config/services.config';
import { BazarrSubtitleStatus } from '@dasharr/shared-types';
import type { LogEntry } from '@dasharr/shared-types';
import { logger } from '../utils/logger';

interface SubtitleSearchOptions {
  language?: string;
  forced?: boolean;
  hi?: boolean;
}

export class BazarrService {
  private client: HttpClient;
  private cacheService: CacheService;
  private serviceName = 'bazarr';
  private apiKey?: string;

  constructor(config: ServiceConfig, cacheService: CacheService) {
    this.apiKey = config.apiKey;
    const headers = config.apiKey ? { 'X-API-KEY': config.apiKey } : undefined;
    this.client = new HttpClient(
      {
        baseUrl: `${config.baseUrl}/api`,
        timeout: config.timeout,
        headers,
      },
      this.serviceName
    );
    this.cacheService = cacheService;
  }

  async getHealth(): Promise<{ healthy: boolean; message?: string }> {
    const cacheKey = `${this.serviceName}:health`;
    const cached = await this.cacheService.get<{ healthy: boolean; message?: string }>(
      cacheKey
    );
    if (cached !== undefined) {
      return cached;
    }

    try {
      await this.client.get('/system/ping', this.withApiKey());
      const result = { healthy: true };
      await this.cacheService.set(cacheKey, result, 60);
      return result;
    } catch (error) {
      const result = { healthy: false, message: 'Failed to connect to Bazarr' };
      await this.cacheService.set(cacheKey, result, 60);
      return result;
    }
  }

  async getMovieSubtitles(radarrIds?: number[]): Promise<BazarrSubtitleStatus[]> {
    const cacheKey = `${this.serviceName}:movies:${this.cacheKeySuffix(radarrIds)}`;
    const cached = await this.cacheService.get<BazarrSubtitleStatus[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const params: Record<string, any> = {};
    const fallbackParams: Record<string, any> = {};
    if (radarrIds && radarrIds.length > 0) {
      params.radarrid = radarrIds;
      fallbackParams['radarrid[]'] = radarrIds;
    }

    const payload = await this.getWithFallback('/movies', params, fallbackParams);
    const items = this.normalizeList(payload);
    const statuses = items
      .map((item) => this.buildMovieStatus(item))
      .filter((status): status is BazarrSubtitleStatus => !!status);

    if (!statuses.length) {
      const sampleIds = items
        .slice(0, 5)
        .map((item: any) => item?.radarrId ?? item?.radarrid ?? item?.movieId ?? item?.id)
        .filter((value) => value !== undefined && value !== null);
      logger.warn(
        `[bazarr] movie subtitles returned 0 statuses (items=${items.length} sampleIds=${sampleIds.join(',')})`
      );
    }

    await this.cacheService.set(cacheKey, statuses, 60);
    return statuses;
  }

  async getEpisodeSubtitles(options: {
    seriesIds?: number[];
    episodeIds?: number[];
  }): Promise<BazarrSubtitleStatus[]> {
    const cacheKey = `${this.serviceName}:episodes:${this.cacheKeySuffix(options)}`;
    const cached = await this.cacheService.get<BazarrSubtitleStatus[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const params: Record<string, any> = {};
    const fallbackParams: Record<string, any> = {};
    if (options.seriesIds && options.seriesIds.length > 0) {
      params.seriesid = options.seriesIds;
      fallbackParams['seriesid[]'] = options.seriesIds;
    }
    if (options.episodeIds && options.episodeIds.length > 0) {
      params.episodeid = options.episodeIds;
      fallbackParams['episodeid[]'] = options.episodeIds;
    }

    const payload = await this.getWithFallback('/episodes', params, fallbackParams);
    const items = this.normalizeList(payload);
    const statuses = items
      .map((item) => this.buildEpisodeStatus(item))
      .filter((status): status is BazarrSubtitleStatus => !!status);

    if (!statuses.length) {
      const sampleIds = items
        .slice(0, 5)
        .map((item: any) => item?.sonarrEpisodeId ?? item?.episodeId ?? item?.id)
        .filter((value) => value !== undefined && value !== null);
      logger.warn(
        `[bazarr] episode subtitles returned 0 statuses (items=${items.length} sampleIds=${sampleIds.join(',')})`
      );
    }

    await this.cacheService.set(cacheKey, statuses, 60);
    return statuses;
  }

  async searchMovieSubtitles(
    radarrId: number,
    options?: SubtitleSearchOptions
  ): Promise<any> {
    await this.cacheService.delByPattern(`${this.serviceName}:movies`);
    return this.client.patch('/movies/subtitles', null, {
      params: this.withApiKey({
        radarrid: radarrId,
        language: options?.language || 'eng',
        forced: this.booleanParam(options?.forced),
        hi: this.booleanParam(options?.hi),
      }),
    });
  }

  async searchEpisodeSubtitles(
    seriesId: number,
    episodeId: number,
    options?: SubtitleSearchOptions
  ): Promise<any> {
    await this.cacheService.delByPattern(`${this.serviceName}:episodes`);
    return this.client.patch('/episodes/subtitles', null, {
      params: this.withApiKey({
        seriesid: seriesId,
        episodeid: episodeId,
        language: options?.language || 'eng',
        forced: this.booleanParam(options?.forced),
        hi: this.booleanParam(options?.hi),
      }),
    });
  }

  async searchSeriesSubtitles(
    seriesId: number,
    options?: SubtitleSearchOptions
  ): Promise<any> {
    await this.cacheService.delByPattern(`${this.serviceName}:episodes`);
    return this.client.patch('/episodes/subtitles', null, {
      params: this.withApiKey({
        seriesid: seriesId,
        language: options?.language || 'eng',
        forced: this.booleanParam(options?.forced),
        hi: this.booleanParam(options?.hi),
      }),
    });
  }

  async getLogs(): Promise<LogEntry[]> {
    const payload = await this.client.get<any>('/system/logs', this.withApiKey());
    const items = this.normalizeList(payload);
    return items.map((entry) => this.normalizeLogEntry(entry));
  }

  private withApiKey(params: Record<string, any> = {}): Record<string, any> {
    if (!this.apiKey) {
      return params;
    }
    return { ...params, apikey: this.apiKey };
  }

  private async getWithFallback(
    endpoint: string,
    params: Record<string, any>,
    fallbackParams: Record<string, any>
  ): Promise<any> {
    const primary = await this.client.get<any>(endpoint, this.withApiKey(params));
    const primaryItems = this.normalizeList(primary);
    if (primaryItems.length > 0 || Object.keys(fallbackParams).length === 0) {
      return primary;
    }

    const fallback = await this.client.get<any>(
      endpoint,
      this.withApiKey(fallbackParams)
    );
    return fallback;
  }

  private normalizeLogEntry(entry: any): LogEntry {
    const rawLevel = String(entry?.type || 'info').toLowerCase();
    const level: LogEntry['level'] =
      rawLevel.includes('error')
        ? 'error'
        : rawLevel.includes('warn')
          ? 'warn'
          : rawLevel.includes('debug')
            ? 'debug'
            : 'info';
    return {
      time: entry?.timestamp || new Date().toISOString(),
      level,
      message: String(entry?.message || ''),
      exception: entry?.exception || undefined,
    };
  }

  private booleanParam(value?: boolean): string {
    return value ? 'true' : 'false';
  }

  private cacheKeySuffix(value?: unknown): string {
    if (!value) {
      return 'all';
    }
    if (Array.isArray(value)) {
      return value.join(',');
    }
    try {
      return JSON.stringify(value);
    } catch {
      return 'all';
    }
  }

  private normalizeList<T = any>(payload: any): T[] {
    if (!payload) {
      return [];
    }
    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload.data)) {
      return payload.data;
    }
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
    if (Array.isArray(payload.results)) {
      return payload.results;
    }
    return [];
  }

  private buildMovieStatus(item: any): BazarrSubtitleStatus | null {
    const id = this.extractId(item, [
      'radarrId',
      'radarrid',
      'radarr_id',
      'movieId',
      'movie_id',
      'id',
    ]);
    if (!id) {
      return null;
    }

    return this.buildStatus(item, id);
  }

  private buildEpisodeStatus(item: any): BazarrSubtitleStatus | null {
    const id = this.extractId(item, [
      'episodeId',
      'episodeid',
      'episode_id',
      'sonarrEpisodeId',
      'sonarr_episode_id',
      'id',
    ]);
    if (!id) {
      return null;
    }

    const status = this.buildStatus(item, id);
    const seriesId = this.extractSeriesId(item);
    if (seriesId) {
      return { ...status, seriesId };
    }
    return status;
  }

  private extractId(item: any, keys: string[]): number | null {
    for (const key of keys) {
      const value = item?.[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  }

  private buildStatus(item: any, id: number): BazarrSubtitleStatus {
    const subtitles = this.normalizeList(item?.subtitles);
    const embedded = this.normalizeList(
      item?.embedded_subtitles ?? item?.embeddedSubtitles
    );
    const missingList = this.normalizeList(
      item?.missing_subtitles ?? item?.missingSubtitles
    );
    const missingCount = this.numberOrFallback(
      item?.missing_subtitles_count ?? item?.missingSubtitlesCount,
      missingList.length
    );

    const hasSubtitles = subtitles.length > 0 || embedded.length > 0;
    const status = hasSubtitles
      ? 'available'
      : missingCount > 0
        ? 'missing'
        : 'unknown';

    return {
      id,
      status,
      available: status === 'available' ? true : status === 'missing' ? false : null,
      missingCount: missingCount || undefined,
      languages: this.extractLanguages(subtitles.concat(embedded)),
      missingLanguages: this.extractLanguages(missingList),
    };
  }

  private numberOrFallback(value: any, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback;
  }

  private extractLanguages(entries: any[]): string[] {
    if (!Array.isArray(entries)) {
      return [];
    }
    const values = entries
      .map((entry) =>
        entry?.language ||
        entry?.lang ||
        entry?.code ||
        entry?.name ||
        entry?.language_name
      )
      .filter((value) => value !== undefined && value !== null)
      .map((value) => String(value));

    return Array.from(new Set(values));
  }

  private extractSeriesId(item: any): number | null {
    return this.extractId(item, [
      'seriesId',
      'seriesid',
      'series_id',
      'sonarrSeriesId',
      'sonarr_series_id',
    ]);
  }
}
