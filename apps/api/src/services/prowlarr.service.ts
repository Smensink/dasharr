import { HttpClient } from '../clients/base/HttpClient';
import { CacheService } from './cache.service';
import { ServiceConfig } from '../config/services.config';
import {
  ProwlarrIndexer,
  ProwlarrIndexerStats,
  ProwlarrSearchRequest,
  ProwlarrSearchResult,
  AddProwlarrIndexerRequest,
  UpdateProwlarrIndexerRequest,
} from '../types/prowlarr.types';
import { HealthStatus } from '@dasharr/shared-types';

export class ProwlarrService {
  protected client: HttpClient;
  protected serviceName: string = 'prowlarr';
  protected cacheService: CacheService;

  constructor(config: ServiceConfig, cacheService: CacheService) {
    this.client = new HttpClient(
      {
        baseUrl: `${config.baseUrl}/api/v1`,
        apiKey: config.apiKey,
        timeout: config.timeout,
      },
      'prowlarr'
    );
    this.cacheService = cacheService;
  }

  // Indexer management
  async getIndexers(): Promise<ProwlarrIndexer[]> {
    return this.withCache(
      'prowlarr:indexers',
      300,
      () => this.client.get<ProwlarrIndexer[]>('/indexer')
    );
  }

  async getIndexerById(id: number): Promise<ProwlarrIndexer> {
    return this.client.get<ProwlarrIndexer>(`/indexer/${id}`);
  }

  async addIndexer(indexer: AddProwlarrIndexerRequest): Promise<ProwlarrIndexer> {
    await this.cacheService.delByPattern('prowlarr');
    return this.client.post<ProwlarrIndexer>('/indexer', indexer);
  }

  async updateIndexer(
    id: number,
    updates: UpdateProwlarrIndexerRequest
  ): Promise<ProwlarrIndexer> {
    await this.cacheService.delByPattern('prowlarr');
    return this.client.put<ProwlarrIndexer>(`/indexer/${id}`, updates);
  }

  async deleteIndexer(id: number): Promise<void> {
    await this.client.delete(`/indexer/${id}`);
    await this.cacheService.delByPattern('prowlarr');
  }

  async testIndexer(id: number): Promise<any> {
    return this.client.post(`/indexer/test/${id}`);
  }

  // Indexer statistics
  async getIndexerStats(): Promise<ProwlarrIndexerStats[]> {
    return this.withCache(
      'prowlarr:stats',
      60,
      () => this.client.get<ProwlarrIndexerStats[]>('/indexerstats')
    );
  }

  // Search
  async search(params: ProwlarrSearchRequest): Promise<ProwlarrSearchResult[]> {
    // No cache for search - always return fresh results
    return this.client.get<ProwlarrSearchResult[]>('/search', params);
  }

  // History
  async getHistory(params?: any): Promise<any[]> {
    return this.withCache(
      `prowlarr:history:${JSON.stringify(params || {})}`,
      60,
      () =>
        this.client
          .get<any>('/history', params)
          .then((data: any) => data.records || [])
    );
  }

  // Health
  async getHealth(): Promise<HealthStatus> {
    return this.withCache(
      'prowlarr:health',
      60,
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
            message: 'Failed to connect to Prowlarr',
          };
        }
      }
    );
  }

  async getSystemStatus(): Promise<any> {
    return this.client.get('/system/status');
  }

  // Tags
  async getTags(): Promise<any[]> {
    return this.withCache(
      'prowlarr:tags',
      300,
      () => this.client.get<any[]>('/tag')
    );
  }

  // App profiles
  async getAppProfiles(): Promise<any[]> {
    return this.withCache(
      'prowlarr:appprofiles',
      300,
      () => this.client.get<any[]>('/appprofile')
    );
  }

  // Protected utility method
  protected async withCache<T>(
    key: string,
    ttl: number,
    fn: () => Promise<T>
  ): Promise<T> {
    const cached = await this.cacheService.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = await fn();
    await this.cacheService.set(key, result, ttl);
    return result;
  }
}
