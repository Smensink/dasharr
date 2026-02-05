import axios, { AxiosInstance } from 'axios';
import { ServiceConfig } from '../config/services.config';
import { logger } from '../utils/logger';
import {
  TautulliResponse,
  TautulliActivity,
  TautulliHistory,
  TautulliLibraryWatchStats,
  TautulliHomeStat,
} from '../types/tautulli.types';

export class TautulliClient {
  private axiosInstance: AxiosInstance;
  private serviceName: string = 'tautulli';
  private apiKey: string;

  constructor(config: ServiceConfig) {
    this.apiKey = config.apiKey || '';

    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Accept': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor to add API key and logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Add apikey to query params
        if (!config.params) {
          config.params = {};
        }
        config.params.apikey = this.apiKey;

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

    // Response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        // Check if Tautulli returned an error in the response
        if (response.data?.response?.result === 'error') {
          const errorMsg = response.data.response.message || 'Unknown error';
          logger.error(`[${this.serviceName}] API error: ${errorMsg}`);
          throw new Error(errorMsg);
        }
        return response;
      },
      (error) => {
        if (error.response) {
          logger.error(
            `[${this.serviceName}] Response error: ${error.response.status} - ${error.response.statusText}`
          );
        } else if (error.request) {
          logger.error(`[${this.serviceName}] No response received`);
        } else {
          logger.error(`[${this.serviceName}] Error:`, error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  async getActivity(): Promise<TautulliActivity> {
    const response = await this.axiosInstance.get<TautulliResponse<TautulliActivity>>(
      '/api/v2',
      {
        params: {
          cmd: 'get_activity',
        },
      }
    );
    return response.data.response.data;
  }

  async getHistory(limit?: number): Promise<TautulliHistory> {
    const response = await this.axiosInstance.get<TautulliResponse<TautulliHistory>>(
      '/api/v2',
      {
        params: {
          cmd: 'get_history',
          length: limit || 25,
        },
      }
    );
    return response.data.response.data;
  }

  async getLibraryWatchStats(libraryId?: string): Promise<TautulliLibraryWatchStats> {
    const params: any = {
      cmd: 'get_library_watch_time_stats',
      query_days: 30,
    };

    if (libraryId) {
      params.section_id = libraryId;
    }

    const response = await this.axiosInstance.get<TautulliResponse<TautulliLibraryWatchStats>>(
      '/api/v2',
      { params }
    );
    return response.data.response.data;
  }

  async getHomeStats(): Promise<TautulliHomeStat[]> {
    const response = await this.axiosInstance.get<TautulliResponse<TautulliHomeStat[]>>(
      '/api/v2',
      {
        params: {
          cmd: 'get_home_stats',
          time_range: 30,
          stats_count: 10,
        },
      }
    );
    return response.data.response.data;
  }
}
