import axios, { AxiosInstance } from 'axios';
import { ServiceConfig } from '../config/services.config';
import { logger } from '../utils/logger';
import {
  QBittorrentTorrent,
  QBittorrentServerState,
  QBittorrentPreferences,
} from '../types/qbittorrent.types';

export class QBittorrentClient {
  private axiosInstance: AxiosInstance;
  private serviceName: string = 'qbittorrent';
  private cookie?: string;
  private username: string;
  private password: string;

  constructor(config: ServiceConfig) {
    this.username = config.username || '';
    this.password = config.password || '';

    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor to add cookie
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        // Ensure we're authenticated before making requests
        if (!this.cookie) {
          await this.login();
        }

        if (this.cookie) {
          config.headers['Cookie'] = this.cookie;
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

        // If we get a 403, try to re-authenticate once
        if (
          error.response?.status === 403 &&
          !originalRequest._retry
        ) {
          originalRequest._retry = true;
          this.cookie = undefined; // Clear cookie to force re-auth
          await this.login();
          return this.axiosInstance(originalRequest);
        }

        return Promise.reject(error);
      }
    );
  }

  async login(): Promise<void> {
    try {
      const params = new URLSearchParams();
      params.append('username', this.username);
      params.append('password', this.password);

      const response = await axios.post(
        `${this.axiosInstance.defaults.baseURL}/api/v2/auth/login`,
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      // Extract cookie from response
      const setCookie = response.headers['set-cookie'];
      if (setCookie && setCookie.length > 0) {
        this.cookie = setCookie[0].split(';')[0];
        logger.info(`[${this.serviceName}] Authenticated successfully`);
      }
    } catch (error) {
      logger.error(`[${this.serviceName}] Authentication failed:`, error);
      throw new Error('qBittorrent authentication failed');
    }
  }

  async getTorrents(filter?: string, category?: string): Promise<QBittorrentTorrent[]> {
    const params: any = {};
    if (filter) params.filter = filter;
    if (category) params.category = category;

    const response = await this.axiosInstance.get<QBittorrentTorrent[]>(
      '/api/v2/torrents/info',
      { params }
    );
    return response.data;
  }

  async getTorrentProperties(hash: string): Promise<any> {
    const response = await this.axiosInstance.get(
      `/api/v2/torrents/properties`,
      { params: { hash } }
    );
    return response.data;
  }

  async getServerState(): Promise<QBittorrentServerState> {
    const response = await this.axiosInstance.get<QBittorrentServerState>(
      '/api/v2/transfer/info'
    );
    return response.data;
  }

  async getPreferences(): Promise<QBittorrentPreferences> {
    const response = await this.axiosInstance.get<QBittorrentPreferences>(
      '/api/v2/app/preferences'
    );
    return response.data;
  }

  async pauseTorrent(hash: string): Promise<void> {
    const params = new URLSearchParams();
    params.append('hashes', hash);
    await this.axiosInstance.post('/api/v2/torrents/pause', params);
  }

  async resumeTorrent(hash: string): Promise<void> {
    const params = new URLSearchParams();
    params.append('hashes', hash);
    await this.axiosInstance.post('/api/v2/torrents/resume', params);
  }

  async deleteTorrent(hash: string, deleteFiles: boolean = false): Promise<void> {
    const params = new URLSearchParams();
    params.append('hashes', hash);
    params.append('deleteFiles', deleteFiles.toString());
    await this.axiosInstance.post('/api/v2/torrents/delete', params);
  }

  async recheckTorrent(hash: string): Promise<void> {
    const params = new URLSearchParams();
    params.append('hashes', hash);
    await this.axiosInstance.post('/api/v2/torrents/recheck', params);
  }

  async setTorrentPriority(hash: string, priority: 'increase' | 'decrease' | 'top' | 'bottom'): Promise<void> {
    const params = new URLSearchParams();
    params.append('hashes', hash);
    await this.axiosInstance.post(`/api/v2/torrents/${priority}Prio`, params);
  }

  async getCategories(): Promise<Record<string, any>> {
    const response = await this.axiosInstance.get('/api/v2/torrents/categories');
    return response.data;
  }

  /**
   * Add a torrent from a magnet link
   */
  async addMagnetLink(
    magnetUrl: string,
    options?: {
      category?: string;
      savepath?: string;
      paused?: boolean;
    }
  ): Promise<string> {
    try {
      // Create category if it doesn't exist
      if (options?.category) {
        try {
          const categories = await this.getCategories();
          if (!categories[options.category]) {
            logger.info(`[${this.serviceName}] Creating category: ${options.category}`);
            await this.axiosInstance.post('/api/v2/torrents/createCategory',
              new URLSearchParams({ category: options.category, savePath: options.savepath || '' })
            );
          }
        } catch (error) {
          logger.warn(`[${this.serviceName}] Failed to create category: ${error}`);
          // Continue anyway - qBittorrent might auto-create or ignore
        }
      }

      const params = new URLSearchParams();
      params.append('urls', magnetUrl);

      if (options?.category) {
        params.append('category', options.category);
      }
      if (options?.savepath) {
        params.append('savepath', options.savepath);
      }
      if (options?.paused !== undefined) {
        params.append('paused', options.paused.toString());
      }

      const response = await this.axiosInstance.post('/api/v2/torrents/add', params);

      // qBittorrent returns "Ok." on success, otherwise throws
      if (response.data !== 'Ok.' && response.status !== 200) {
        throw new Error(`qBittorrent returned unexpected response: ${response.data}`);
      }

      // Extract hash from magnet link for tracking
      const hashMatch = magnetUrl.match(/btih:([a-fA-F0-9]{40})/i);
      const hash = hashMatch ? hashMatch[1].toLowerCase() : '';

      if (!hash) {
        logger.warn(`[${this.serviceName}] Could not extract hash from magnet URL`);
      }

      logger.info(`[${this.serviceName}] Successfully added magnet link, hash: ${hash}`);
      return hash;
    } catch (error: any) {
      logger.error(`[${this.serviceName}] Failed to add magnet link:`, {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw new Error(`Failed to add torrent to qBittorrent: ${error.response?.data || error.message}`);
    }
  }

  /**
   * Add a torrent from a torrent file URL
   */
  async addTorrentUrl(
    torrentUrl: string,
    options?: {
      category?: string;
      savepath?: string;
      paused?: boolean;
    }
  ): Promise<void> {
    // Download the torrent file first
    const torrentResponse = await axios.get(torrentUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const formData = new FormData();
    const blob = new Blob([torrentResponse.data], { type: 'application/x-bittorrent' });
    formData.append('torrents', blob, 'torrent.torrent');

    if (options?.category) {
      formData.append('category', options.category);
    }
    if (options?.savepath) {
      formData.append('savepath', options.savepath);
    }
    if (options?.paused !== undefined) {
      formData.append('paused', options.paused.toString());
    }

    await this.axiosInstance.post('/api/v2/torrents/add', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    logger.info(`[${this.serviceName}] Added torrent from URL: ${torrentUrl}`);
  }
}
