import axios, { AxiosInstance } from 'axios';
import { CacheService } from './cache.service';
import { ServiceConfig } from '../config/services.config';
import { HealthStatus, QueueItem, DownloadStatus } from '@dasharr/shared-types';
import { logger } from '../utils/logger';

interface RdtTorrent {
  torrentId?: string;
  hash?: string;
  category?: string;
  added?: string;
  completed?: string | null;
  error?: string | null;
  downloads?: any[];
  fileOrMagnet?: string;
  rdId?: string;
  rdName?: string;
  rdSize?: number;
  rdProgress?: number;
  rdSpeed?: number;
  rdStatusRaw?: string;
  rdStatus?: number;
  filename?: string;
  originalFilename?: string;
  status?: string;
  progress?: number;
  speed?: number;
  bytesTotal?: number;
  bytesDownloaded?: number;
  bytesDone?: number;
}

export class RdtClientService {
  private axiosInstance: AxiosInstance;
  private cacheService: CacheService;
  private serviceName = 'rdtclient';
  private username: string;
  private password: string;
  private sessionCookie?: string;

  constructor(config: ServiceConfig, cacheService: CacheService) {
    this.username = config.username || '';
    this.password = config.password || '';

    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.cacheService = cacheService;
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor to add auth cookie
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        // Skip auth for login endpoint
        if (config.url?.includes('/Authentication/login')) {
          return config;
        }

        // Ensure we're authenticated before making requests
        if (!this.sessionCookie) {
          await this.login();
        }

        if (this.sessionCookie) {
          config.headers['Cookie'] = this.sessionCookie;
        }

        logger.debug(
          `[${this.serviceName}] ${config.method?.toUpperCase()} ${config.url}`
        );
        return config;
      },
      (error) => {
        logger.error(`[${this.serviceName}] Request error:`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle authentication failures
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // If we get a 401/403, try to re-authenticate once
        if (
          (error.response?.status === 401 || error.response?.status === 403) &&
          !originalRequest._retry &&
          !originalRequest.url?.includes('/Authentication/login')
        ) {
          originalRequest._retry = true;
          this.sessionCookie = undefined; // Clear cookie to force re-auth
          await this.login();
          return this.axiosInstance(originalRequest);
        }

        return Promise.reject(error);
      }
    );
  }

  async login(): Promise<void> {
    try {
      const response = await axios.post(
        `${this.axiosInstance.defaults.baseURL}/Api/Authentication/login`,
        {
          userName: this.username,
          password: this.password,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const setCookie = response.headers['set-cookie'];
      const cookieValue = Array.isArray(setCookie) ? setCookie[0] : setCookie;

      if (cookieValue) {
        this.sessionCookie = cookieValue.split(';')[0];
        logger.info(`[${this.serviceName}] Authenticated successfully`);
        return;
      }

      throw new Error('Missing session cookie');
    } catch (error) {
      logger.error(`[${this.serviceName}] Authentication failed:`, error);
      throw new Error('RDTClient authentication failed');
    }
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
      // Try to authenticate and get torrents
      await this.getTorrents();
      return {
        healthy: true,
        message: 'RDTClient connected',
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getTorrents(): Promise<RdtTorrent[]> {
    const result = await this.withCache(this.getCacheKey('torrents'), 10, async () => {
      const response = await this.axiosInstance.get<RdtTorrent[]>('/Api/Torrents');
      return response.data || [];
    });
    // Ensure we always return an array
    return result || [];
  }

  private async getTorrentsFresh(): Promise<RdtTorrent[]> {
    const response = await this.axiosInstance.get<RdtTorrent[]>('/Api/Torrents');
    return response.data || [];
  }

  async getQueue(): Promise<QueueItem[]> {
    const torrents = await this.getTorrents();

    const activeTorrents = torrents.filter((torrent) => {
      const statusRaw = (torrent.rdStatusRaw || torrent.status || '').toLowerCase();
      if (statusRaw.includes('downloaded') || statusRaw.includes('finished') || statusRaw.includes('completed')) {
        return false;
      }
      return true;
    });

    return activeTorrents.map((torrent) => this.transformToQueueItem(torrent));
  }

  async getStats(): Promise<any> {
    const torrents = await this.getTorrents();

    const activeTorrents = torrents.filter((torrent) => {
      const statusRaw = (torrent.rdStatusRaw || torrent.status || '').toLowerCase();
      return !(statusRaw.includes('downloaded') || statusRaw.includes('finished') || statusRaw.includes('completed'));
    });

    const totalSpeed = activeTorrents.reduce((sum, t) => sum + (t.rdSpeed || t.speed || 0), 0);

    return {
      downloadSpeed: totalSpeed,
      isAvailable: true,
      totalDownloading: activeTorrents.length,
    };
  }

  private async resolveTorrentId(identifier: string, attempts: number = 0): Promise<string> {
    const normalized = identifier.toLowerCase();
    const findMatch = (torrents: RdtTorrent[]) =>
      torrents.find((torrent) =>
        torrent.torrentId?.toLowerCase() === normalized ||
        torrent.hash?.toLowerCase() === normalized ||
        torrent.rdId?.toLowerCase() === normalized
      );

    let torrents = await this.getTorrents();
    let match = findMatch(torrents);

    if (!match && attempts === 0) {
      await this.cacheService.delByPattern(this.serviceName);
      torrents = await this.getTorrentsFresh();
      match = findMatch(torrents);
    }

    if (!match) {
      if (attempts === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return this.resolveTorrentId(identifier, 1);
      }
      throw new Error('RDTClient torrent not found');
    }

    return match.torrentId || identifier;
  }

  async deleteTorrent(id: string, deleteFiles: boolean = false): Promise<void> {
    const resolvedId = await this.resolveTorrentId(id);
    await this.axiosInstance.post(`/Api/Torrents/Delete/${resolvedId}`, {
      deleteData: deleteFiles,
      deleteRdTorrent: deleteFiles,
      deleteLocalFiles: deleteFiles,
    });
    await this.cacheService.delByPattern(this.serviceName);
  }

  async retryTorrent(id: string): Promise<void> {
    const resolvedId = await this.resolveTorrentId(id);
    await this.axiosInstance.post(`/Api/Torrents/Retry/${resolvedId}`, {});
    await this.cacheService.delByPattern(this.serviceName);
  }

  async updateTorrent(id: string): Promise<void> {
    const resolvedId = await this.resolveTorrentId(id);
    const torrent = await this.axiosInstance.get<RdtTorrent>(
      `/Api/Torrents/Get/${resolvedId}`
    );
    await this.axiosInstance.put('/Api/Torrents/Update', torrent);
    await this.cacheService.delByPattern(this.serviceName);
  }

  private transformToQueueItem(torrent: RdtTorrent): QueueItem {
    const statusRaw = (torrent.rdStatusRaw || torrent.status || '').toLowerCase();
    const statusMap: Record<string, DownloadStatus> = {
      waitingfordownload: 'queued',
      downloadqueued: 'queued',
      queued: 'queued',
      downloading: 'downloading',
      processing: 'downloading',
      paused: 'paused',
      downloaded: 'completed',
      finished: 'completed',
      completed: 'completed',
      error: 'failed',
      failed: 'failed',
    };

    let status = statusMap[statusRaw] || 'queued';
    if (!statusRaw && torrent.error) {
      status = 'failed';
    }

    const rawProgress = torrent.rdProgress ?? torrent.progress ?? 0;
    const progress = rawProgress > 1 ? rawProgress : rawProgress * 100;
    const size = torrent.rdSize || torrent.bytesTotal || 0;
    const sizeleft = size > 0 ? size * (1 - Math.min(progress, 100) / 100) : 0;

    const queueId = torrent.hash || torrent.torrentId || 'unknown';

    return {
      id: `rdtclient:${queueId}`,
      title: torrent.rdName || torrent.filename || torrent.originalFilename || torrent.fileOrMagnet || 'Unknown',
      status,
      size,
      sizeleft,
      progress,
      downloadId: torrent.hash || torrent.torrentId,
      downloadClient: 'RDTClient',
      category: torrent.category,
      protocol: 'torrent',
      errorMessage: torrent.error || undefined,
    };
  }
}
