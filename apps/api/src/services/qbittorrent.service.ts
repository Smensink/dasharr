import { QBittorrentClient } from '../clients/QBittorrentClient';
import { CacheService } from './cache.service';
import { ServiceConfig } from '../config/services.config';
import { QBittorrentTorrent, QBittorrentServerState } from '../types/qbittorrent.types';
import { QueueItem, DownloadStatus } from '@dasharr/shared-types';

export class QBittorrentService {
  private client: QBittorrentClient;
  private cacheService: CacheService;
  private serviceName = 'qbittorrent';

  constructor(config: ServiceConfig, cacheService: CacheService) {
    this.client = new QBittorrentClient(config);
    this.cacheService = cacheService;
  }

  async getTorrents(filter?: string, category?: string): Promise<QBittorrentTorrent[]> {
    return this.client.getTorrents(filter, category);
  }

  async getQueue(): Promise<QueueItem[]> {
    // Include queued/paused items so unclaimed client downloads still show
    const torrents = await this.client.getTorrents();
    return torrents
      .map((torrent) => this.transformToQueueItem(torrent))
      .filter((item) => item.status !== 'completed');
  }

  async getTorrentProperties(hash: string): Promise<any> {
    return this.client.getTorrentProperties(hash);
  }

  async getServerState(): Promise<QBittorrentServerState> {
    return this.client.getServerState();
  }

  async pauseTorrent(hash: string): Promise<void> {
    await this.client.pauseTorrent(hash);
  }

  async resumeTorrent(hash: string): Promise<void> {
    await this.client.resumeTorrent(hash);
  }

  async deleteTorrent(hash: string, deleteFiles: boolean = false): Promise<void> {
    await this.client.deleteTorrent(hash, deleteFiles);
  }

  async recheckTorrent(hash: string): Promise<void> {
    await this.client.recheckTorrent(hash);
  }

  async getCategories(): Promise<Record<string, any>> {
    return this.client.getCategories();
  }

  async addMagnetLink(
    magnetUrl: string,
    options?: {
      category?: string;
      savepath?: string;
    }
  ): Promise<string> {
    return this.client.addMagnetLink(magnetUrl, {
      ...options,
      paused: false,
    });
  }

  async getHealth(): Promise<{ healthy: boolean; message?: string }> {
    try {
      await this.client.getServerState();
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: 'Failed to connect to qBittorrent',
      };
    }
  }

  // Transform qBittorrent torrent to unified queue item
  private transformToQueueItem(torrent: QBittorrentTorrent): QueueItem {
    const statusMap: Record<string, DownloadStatus> = {
      downloading: 'downloading',
      stalledDL: 'downloading',
      pausedDL: 'paused',
      queuedDL: 'queued',
      uploading: 'completed',
      stalledUP: 'completed',
      pausedUP: 'completed',
      queuedUP: 'completed',
      checkingDL: 'downloading',
      checkingUP: 'completed',
      error: 'failed',
      missingFiles: 'failed',
    };

    const status = statusMap[torrent.state] || 'queued';

    return {
      id: `qbittorrent:${torrent.hash}`,
      title: torrent.name,
      status,
      size: torrent.size,
      sizeleft: torrent.amount_left,
      timeleft: torrent.eta > 0 ? `${Math.floor(torrent.eta / 60)} min` : undefined,
      downloadId: torrent.hash,
      downloadClient: 'qBittorrent',
      category: torrent.category,
      protocol: 'torrent',
      errorMessage: status === 'failed' ? 'Torrent error or missing files' : undefined,
    };
  }
}
