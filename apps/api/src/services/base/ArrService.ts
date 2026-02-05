import { HttpClient } from '../../clients/base/HttpClient';
import { CacheService } from '../cache.service';
import { ServiceConfig } from '../../config/services.config';
import {
  QualityProfile,
  CalendarEvent,
  HistoryItem,
  LogEntry,
  HealthStatus,
  SearchResult,
} from '@dasharr/shared-types';

export interface QueryParams {
  [key: string]: any;
}

export interface CalendarParams {
  start?: Date;
  end?: Date;
}

export interface HistoryParams {
  page?: number;
  pageSize?: number;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
}

export interface LogParams {
  page?: number;
  pageSize?: number;
  level?: string;
}

// Base abstract class for all *arr services (Radarr, Sonarr, Readarr, Prowlarr)
export abstract class ArrService<TItem = any, TAddRequest = any, TUpdateRequest = any> {
  protected client: HttpClient;
  protected serviceName: string;
  protected cacheService: CacheService;

  constructor(
    config: ServiceConfig,
    serviceName: string,
    cacheService: CacheService,
    apiVersion: string = 'v3'
  ) {
    this.serviceName = serviceName;
    this.client = new HttpClient(
      {
        baseUrl: `${config.baseUrl}/api/${apiVersion}`,
        apiKey: config.apiKey,
        timeout: config.timeout,
      },
      serviceName
    );
    this.cacheService = cacheService;
  }

  // Abstract methods that must be implemented by subclasses
  protected abstract getItemsEndpoint(): string;
  protected abstract getItemEndpoint(id: number): string;

  // Common methods all *arr services share
  async getItems(params?: QueryParams): Promise<TItem[]> {
    return this.withCache(
      this.getCacheKey('items', params),
      300, // 5 minutes
      () => this.client.get<TItem[]>(this.getItemsEndpoint(), params)
    );
  }

  async getItemById(id: number): Promise<TItem> {
    return this.withCache(
      this.getCacheKey('item', id),
      300,
      () => this.client.get<TItem>(this.getItemEndpoint(id))
    );
  }

  async addItem(item: TAddRequest): Promise<TItem> {
    // Invalidate cache after adding
    await this.cacheService.delByPattern(this.serviceName);
    return this.client.post<TItem>(this.getItemsEndpoint(), item);
  }

  async updateItem(id: number, updates: TUpdateRequest): Promise<TItem> {
    // Invalidate cache after updating
    await this.cacheService.delByPattern(this.serviceName);
    return this.client.put<TItem>(this.getItemEndpoint(id), updates);
  }

  async deleteItem(id: number): Promise<void> {
    // Invalidate cache after deleting
    await this.cacheService.delByPattern(this.serviceName);
    await this.client.delete(this.getItemEndpoint(id));
  }

  async search(term: string): Promise<SearchResult[]> {
    // No cache for search - always return fresh results
    // Use the items endpoint + /lookup (e.g., /movie/lookup for Radarr)
    const searchEndpoint = `${this.getItemsEndpoint()}/lookup`;
    return this.client.get<SearchResult[]>(searchEndpoint, { term });
  }

  async getQueue(): Promise<any[]> {
    return this.withCache(
      this.getCacheKey('queue'),
      10, // 10 seconds for queue
      () => this.client.get<any>('/queue').then((data: any) => data.records || [])
    );
  }

  async deleteQueueItem(
    id: number,
    options?: {
      removeFromClient?: boolean;
      blocklist?: boolean;
      skipRedownload?: boolean;
      changeCategory?: boolean;
    }
  ): Promise<void> {
    const params = new URLSearchParams();
    if (options?.removeFromClient !== undefined) {
      params.set('removeFromClient', String(options.removeFromClient));
    }
    if (options?.blocklist !== undefined) {
      params.set('blocklist', String(options.blocklist));
    }
    if (options?.skipRedownload !== undefined) {
      params.set('skipRedownload', String(options.skipRedownload));
    }
    if (options?.changeCategory !== undefined) {
      params.set('changeCategory', String(options.changeCategory));
    }

    const query = params.toString();
    const path = query ? `/queue/${id}?${query}` : `/queue/${id}`;
    await this.client.delete(path);
    await this.cacheService.delByPattern(this.serviceName);
  }

  async getHistory(params?: HistoryParams): Promise<HistoryItem[]> {
    return this.withCache(
      this.getCacheKey('history', params),
      60, // 1 minute
      () =>
        this.client
          .get<any>('/history', params)
          .then((data: any) => data.records || [])
    );
  }

  async getCalendar(params?: CalendarParams): Promise<CalendarEvent[]> {
    const queryParams: any = {};

    if (params?.start) {
      queryParams.start = params.start.toISOString();
    }
    if (params?.end) {
      queryParams.end = params.end.toISOString();
    }

    return this.withCache(
      this.getCacheKey('calendar', params),
      900, // 15 minutes
      () => this.client.get<CalendarEvent[]>('/calendar', queryParams)
    );
  }

  async getProfiles(): Promise<QualityProfile[]> {
    return this.withCache(
      this.getCacheKey('profiles'),
      300,
      () => this.client.get<QualityProfile[]>('/qualityprofile')
    );
  }

  async getLogs(params?: LogParams): Promise<LogEntry[]> {
    return this.client.get<any>('/log', params).then((data: any) => data.records || []);
  }

  async getHealth(): Promise<HealthStatus> {
    return this.withCache(
      this.getCacheKey('health'),
      60, // 1 minute
      async () => {
        try {
          const checks = await this.client.get<any[]>('/health');
          const hasErrors = checks.some((check) => check.type === 'error');

          return {
            healthy: !hasErrors,
            checks: checks.map((check) => ({
              source: check.source,
              type: check.type,
              message: check.message,
              wikiUrl: check.wikiUrl,
            })),
          };
        } catch (error) {
          return {
            healthy: false,
            message: `Failed to connect to ${this.serviceName}`,
          };
        }
      }
    );
  }

  async getSystemStatus(): Promise<any> {
    return this.client.get('/system/status');
  }

  // Command execution (for triggering searches, refreshes, etc.)
  async executeCommand(command: any): Promise<any> {
    return this.client.post('/command', command);
  }

  // Protected utility methods
  protected getCacheKey(operation: string, params?: any): string {
    const baseKey = `${this.serviceName}:${operation}`;
    if (!params) {
      return baseKey;
    }
    const paramsStr = JSON.stringify(params);
    return `${baseKey}:${paramsStr}`;
  }

  protected async withCache<T>(
    key: string,
    ttl: number,
    fn: () => Promise<T>
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.cacheService.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Execute the function and cache the result
    const result = await fn();
    await this.cacheService.set(key, result, ttl);
    return result;
  }
}
