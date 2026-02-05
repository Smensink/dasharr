import { HttpClient } from '../clients/base/HttpClient';
import { CacheService } from './cache.service';
import { ServiceConfig } from '../config/services.config';
import { HealthStatus, QueueItem } from '@dasharr/shared-types';

export class SabnzbdService {
  private client: HttpClient;
  private cacheService: CacheService;
  private serviceName = 'sabnzbd';
  private apiKey: string;

  constructor(config: ServiceConfig, cacheService: CacheService) {
    this.apiKey = config.apiKey || '';
    this.client = new HttpClient(
      {
        baseUrl: config.baseUrl,
        timeout: config.timeout,
        username: config.username,
        password: config.password,
      },
      this.serviceName
    );
    this.cacheService = cacheService;
  }

  // SABnzbd requires API key as query parameter, not header
  private withApiKey(params: Record<string, any>): Record<string, any> {
    return { ...params, apikey: this.apiKey };
  }

  private getCacheKey(...parts: any[]): string {
    return `${this.serviceName}:${parts.join(':')}`;
  }

  private async withCache<T>(
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

  async getHealth(): Promise<HealthStatus> {
    try {
      const response = await this.client.get<any>('/api', this.withApiKey({
        mode: 'version',
        output: 'json',
      }));

      return {
        healthy: true,
        message: `SABnzbd ${response.version}`,
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getQueue(): Promise<QueueItem[]> {
    const result = await this.withCache(this.getCacheKey('queue'), 10, async () => {
      const response = await this.client.get<any>('/api', this.withApiKey({
        mode: 'queue',
        output: 'json',
      }));

      const queue = response?.queue || {};
      const slots = queue.slots || [];

      return slots.map((slot: any) => {
        const progress = parseFloat(slot.percentage) || 0;
        const sizeleft = parseFloat(slot.mbleft) * 1024 * 1024; // Convert MB to bytes
        const size = parseFloat(slot.mb) * 1024 * 1024;

        let status: QueueItem['status'] = 'queued';
        if (slot.status === 'Downloading') {
          status = 'downloading';
        } else if (slot.status === 'Paused') {
          status = 'paused';
        } else if (slot.status === 'Failed') {
          status = 'failed';
        }

        return {
          id: `sabnzbd:${slot.nzo_id}`,
          title: slot.filename,
          status,
          size,
          sizeleft,
          progress,
          timeleft: slot.timeleft || undefined,
          downloadId: slot.nzo_id,
          downloadClient: 'SABnzbd',
          category: slot.cat,
          protocol: 'usenet' as const,
        };
      });
    });
    // Ensure we always return an array
    return result || [];
  }

  async getStats(): Promise<any> {
    try {
      const result = await this.withCache(this.getCacheKey('stats'), 10, async () => {
        const response = await this.client.get<any>('/api', this.withApiKey({
          mode: 'queue',
          output: 'json',
        }));

        const queue = response?.queue || {};

        return {
          downloadSpeed: parseFloat(queue.kbpersec) * 1024 || 0, // Convert KB/s to bytes/s
          isAvailable: true,
          totalDownloading: parseInt(queue.noofslots) || 0,
          totalPaused: queue.paused ? parseInt(queue.noofslots) || 0 : 0,
          diskSpace: {
            free: parseFloat(queue.diskspacetotal1) * 1024 * 1024 * 1024 || 0, // Convert GB to bytes
            total: parseFloat(queue.diskspace1) * 1024 * 1024 * 1024 || 0,
          },
        };
      });
      return result || { isAvailable: false };
    } catch (error) {
      return { isAvailable: false };
    }
  }

  async pauseQueue(): Promise<void> {
    await this.client.get('/api', this.withApiKey({
      mode: 'pause',
      output: 'json',
    }));
    await this.cacheService.delByPattern(this.serviceName);
  }

  async resumeQueue(): Promise<void> {
    await this.client.get('/api', this.withApiKey({
      mode: 'resume',
      output: 'json',
    }));
    await this.cacheService.delByPattern(this.serviceName);
  }

  async pauseItem(nzoId: string): Promise<void> {
    await this.client.get('/api', this.withApiKey({
      mode: 'queue',
      name: 'pause',
      value: nzoId,
      output: 'json',
    }));
    await this.cacheService.delByPattern(this.serviceName);
  }

  async resumeItem(nzoId: string): Promise<void> {
    await this.client.get('/api', this.withApiKey({
      mode: 'queue',
      name: 'resume',
      value: nzoId,
      output: 'json',
    }));
    await this.cacheService.delByPattern(this.serviceName);
  }

  async deleteItem(nzoId: string, deleteFiles: boolean = false): Promise<void> {
    const response = await this.client.get<any>('/api', this.withApiKey({
      mode: 'queue',
      name: 'delete',
      value: nzoId,
      del_files: deleteFiles ? '1' : '0',
      output: 'json',
    }));
    const failed = response?.status === false || response?.error !== undefined;
    if (failed) {
      await this.client.get('/api', this.withApiKey({
        mode: 'history',
        name: 'delete',
        value: nzoId,
        del_files: deleteFiles ? '1' : '0',
        output: 'json',
      }));
    }
    await this.cacheService.delByPattern(this.serviceName);
  }

  async moveItem(nzoId: string, position: number): Promise<void> {
    // SABnzbd uses 'switch' mode to move items
    // position is the target index (0-based)
    await this.client.get('/api', this.withApiKey({
      mode: 'switch',
      value: nzoId,
      value2: position.toString(),
      output: 'json',
    }));
    await this.cacheService.delByPattern(this.serviceName);
  }

  async getHistory(params?: { limit?: number; start?: number }): Promise<any[]> {
    return this.withCache(
      this.getCacheKey('history', params?.limit, params?.start),
      60,
      async () => {
        const response = await this.client.get<any>('/api', this.withApiKey({
          mode: 'history',
          limit: params?.limit || 50,
          start: params?.start || 0,
          output: 'json',
        }));

        const history = response.history || {};
        return history.slots || [];
      }
    );
  }
}
