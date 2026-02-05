import axios, { AxiosInstance } from 'axios';
import { ServiceConfig } from '../config/services.config';
import { logger } from '../utils/logger';
import {
  PlexSessionsResponse,
  PlexLibrariesResponse,
  PlexLibraryItemsResponse,
  PlexSearchResponse,
  PlexServerInfoResponse,
  PlexSession,
  PlexLibrary,
  PlexLibraryItem,
  PlexServerInfo,
} from '../types/plex.types';

export class PlexClient {
  private axiosInstance: AxiosInstance;
  private serviceName: string = 'plex';
  private token: string;

  constructor(config: ServiceConfig) {
    this.token = config.apiKey || '';

    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Accept': 'application/json',
        'X-Plex-Token': this.token,
        'X-Plex-Client-Identifier': 'dasharr',
        'X-Plex-Product': 'Dasharr',
        'X-Plex-Version': '1.0.0',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
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
      (response) => response,
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

  async getSessions(): Promise<PlexSession[]> {
    const response = await this.axiosInstance.get<PlexSessionsResponse>(
      '/status/sessions'
    );
    return response.data.MediaContainer.Metadata || [];
  }

  async getLibraries(): Promise<PlexLibrary[]> {
    const response = await this.axiosInstance.get<PlexLibrariesResponse>(
      '/library/sections'
    );
    return response.data.MediaContainer.Directory || [];
  }

  async getLibraryItems(libraryKey: string): Promise<PlexLibraryItem[]> {
    const response = await this.axiosInstance.get<PlexLibraryItemsResponse>(
      `/library/sections/${libraryKey}/all`
    );
    return response.data.MediaContainer.Metadata || [];
  }

  async getAllLeaves(ratingKey: string): Promise<PlexLibraryItem[]> {
    // Get all episodes for a series using the allLeaves endpoint
    const response = await this.axiosInstance.get<PlexLibraryItemsResponse>(
      `/library/metadata/${ratingKey}/allLeaves`
    );
    return response.data.MediaContainer.Metadata || [];
  }

  async searchMedia(query: string): Promise<PlexLibraryItem[]> {
    console.log(`[PlexClient] searchMedia called with query: "${query}"`);
    const response = await this.axiosInstance.get<PlexSearchResponse>(
      '/library/search',
      {
        params: {
          query,
        },
      }
    );
    const results = response.data.MediaContainer.Metadata || [];
    console.log(`[PlexClient] searchMedia returned ${results.length} results:`, results.map(r => ({ title: r.title, type: r.type })));
    return results;
  }

  async getMediaByGuid(guid: string): Promise<PlexLibraryItem[]> {
    // Search across all libraries for items matching the GUID
    const response = await this.axiosInstance.get<PlexSearchResponse>(
      '/library/all',
      {
        params: {
          guid,
        },
      }
    );
    return response.data.MediaContainer.Metadata || [];
  }

  async getMediaByIdentifier(identifier: string): Promise<PlexLibraryItem[]> {
    const response = await this.axiosInstance.get<PlexSearchResponse>(
      '/library/all',
      {
        params: {
          identifier,
        },
      }
    );
    return response.data.MediaContainer.Metadata || [];
  }

  async getServerInfo(): Promise<PlexServerInfo> {
    const response = await this.axiosInstance.get<PlexServerInfoResponse>('/');
    return response.data.MediaContainer;
  }
}
