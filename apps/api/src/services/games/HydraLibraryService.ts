import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import {
  HydraSource,
  HydraRepackEntry,
  HydraLibraryData,
  HydraSourceTrustLevel,
  HydraSearchSettings,
  DEFAULT_HYDRA_SEARCH_SETTINGS,
} from '@dasharr/shared-types';
import { logger } from '../../utils/logger';
import { CacheService } from '../cache.service';

const HYDRA_LIBRARY_BASE_URL = 'https://hydralinks.cloud/sources';
const HYDRA_API_URL = 'https://api.hydralibrary.com';
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const SOURCES_CACHE_KEY = 'hydra:available-sources';
const SOURCES_CACHE_TTL_SECONDS = 3600; // 1 hour
const SOURCES_FILE_NAME = 'hydra-sources.json';

// Fallback sources in case API fails
const FALLBACK_HYDRA_SOURCES: Omit<HydraSource, 'enabled'>[] = [
  {
    id: 'fitgirl',
    name: 'FitGirl Repacks',
    url: 'https://hydralinks.pages.dev/sources/fitgirl.json',
    trustLevel: 'trusted',
    description: 'Highly compressed game repacks',
    author: 'FitGirl',
  },
  {
    id: 'dodi',
    name: 'DODI Repacks',
    url: 'https://hydralinks.pages.dev/sources/dodi.json',
    trustLevel: 'trusted',
    description: 'Quality game repacks',
    author: 'DODI',
  },
  {
    id: 'steamrip',
    name: 'SteamRip',
    url: 'https://hydralinks.pages.dev/sources/steamrip.json',
    trustLevel: 'safe',
    description: 'Direct download games from Steam',
    author: 'SteamRip',
  },
  {
    id: 'onlinefix',
    name: 'OnlineFix',
    url: 'https://hydralinks.pages.dev/sources/onlinefix.json',
    trustLevel: 'safe',
    description: 'Online multiplayer fixes for games',
    author: 'OnlineFix',
  },
  {
    id: 'kaoskrew',
    name: 'KaOsKrew',
    url: 'https://hydralinks.pages.dev/sources/kaoskrew.json',
    trustLevel: 'safe',
    description: 'Game repacks and releases',
    author: 'KaOsKrew',
  },
];

/**
 * Raw source data from Hydra API
 */
interface HydraApiSource {
  id: number;
  title: string;
  description: string | null;
  url: string;
  gamesCount: number;
  status: string[];
  addedDate: string;
  stats?: {
    installs: number;
    copies: number;
    recentActivity: number;
  };
  rating?: {
    avg: number;
    total: number;
  };
}

/**
 * Service for managing Hydra Library sources
 * Fetches game download links from community-maintained JSON sources
 */
export class HydraLibraryService {
  private cacheService: CacheService;
  private settings: HydraSearchSettings;
  private cachedSources: Map<string, HydraLibraryData> = new Map();
  private availableSources: HydraSource[] = [];
  private sourcesLastFetched: number = 0;
  private readonly serviceName = 'hydra-library';

  constructor(cacheService: CacheService, settings?: HydraSearchSettings) {
    this.cacheService = cacheService;
    this.settings = settings || DEFAULT_HYDRA_SEARCH_SETTINGS;
    
    // Initialize sources on startup
    this.initializeSources().catch(err => {
      logger.warn('[HydraLibrary] Failed to initialize sources:', err);
    });
  }

  /**
   * Get the path to the persistent sources file
   */
  private getSourcesFilePath(): string {
    const dataDir = process.env.DASHARR_DATA_DIR || path.join(process.cwd(), 'data');
    return path.join(dataDir, SOURCES_FILE_NAME);
  }

  /**
   * Load sources from persistent storage
   */
  private loadPersistedSources(): HydraSource[] | null {
    try {
      const filePath = this.getSourcesFilePath();
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        const sources = JSON.parse(data) as HydraSource[];
        logger.info(`[HydraLibrary] Loaded ${sources.length} persisted sources from ${filePath}`);
        return sources;
      }
    } catch (error) {
      logger.warn('[HydraLibrary] Failed to load persisted sources:', error);
    }
    return null;
  }

  /**
   * Save sources to persistent storage
   */
  private savePersistedSources(sources: HydraSource[]): void {
    try {
      const filePath = this.getSourcesFilePath();
      const dir = path.dirname(filePath);
      
      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, JSON.stringify(sources, null, 2), 'utf-8');
      logger.info(`[HydraLibrary] Saved ${sources.length} sources to ${filePath}`);
    } catch (error) {
      logger.error('[HydraLibrary] Failed to save persisted sources:', error);
    }
  }

  /**
   * Initialize sources on startup
   * Tries persisted sources first, then API, then fallback
   */
  private async initializeSources(): Promise<void> {
    // First, try to load persisted sources (fast, works offline)
    const persisted = this.loadPersistedSources();
    if (persisted && persisted.length > 0) {
      this.availableSources = persisted.map(s => ({
        ...s,
        enabled: this.settings.enabledSources.includes(s.id),
      }));
      this.sourcesLastFetched = Date.now();
      logger.info(`[HydraLibrary] Using ${persisted.length} persisted sources`);
    }

    // Then, try to refresh from API (async, updates if successful)
    try {
      await this.refreshSources();
    } catch (error) {
      logger.warn('[HydraLibrary] Failed to refresh sources from API:', error);
      
      // If we have no sources at all (no persisted data), use fallback
      if (this.availableSources.length === 0) {
        logger.warn('[HydraLibrary] No persisted sources, using fallback');
        this.availableSources = FALLBACK_HYDRA_SOURCES.map(s => ({
          ...s,
          enabled: this.settings.enabledSources.includes(s.id),
        }));
      }
    }
  }

  /**
   * Update service settings
   */
  updateSettings(settings: HydraSearchSettings): void {
    this.settings = settings;
    logger.info('[HydraLibrary] Settings updated');
  }

  /**
   * Get current settings
   */
  getSettings(): HydraSearchSettings {
    return { ...this.settings };
  }

  /**
   * Fetch available sources from Hydra API
   */
  async refreshSources(): Promise<HydraSource[]> {
    try {
      logger.info('[HydraLibrary] Fetching sources from Hydra API...');
      
      const response = await axios.get(`${HYDRA_API_URL}/sources`, {
        params: { page: 1, limit: 100 },
        timeout: DEFAULT_REQUEST_TIMEOUT_MS,
      });

      const apiSources: HydraApiSource[] = response.data?.sources || [];
      
      if (apiSources.length === 0) {
        logger.warn('[HydraLibrary] API returned no sources, using fallback');
        this.availableSources = FALLBACK_HYDRA_SOURCES.map(s => ({ ...s, enabled: this.settings.enabledSources.includes(s.id) }));
        return this.availableSources;
      }

      // Map API sources to our format
      this.availableSources = apiSources.map(apiSource => {
        const id = this.normalizeSourceId(apiSource.title);
        const trustLevel = this.mapTrustLevel(apiSource.status);
        
        return {
          id,
          name: apiSource.title,
          url: apiSource.url,
          trustLevel,
          description: apiSource.description || `${apiSource.gamesCount.toLocaleString()} games`,
          author: apiSource.title.split(' ')[0],
          enabled: this.settings.enabledSources.includes(id),
          // Additional metadata
          gamesCount: apiSource.gamesCount,
          rating: apiSource.rating?.avg,
          addedDate: apiSource.addedDate,
        };
      });

      this.sourcesLastFetched = Date.now();
      
      // Cache the sources in memory cache
      await this.cacheService.set(
        SOURCES_CACHE_KEY,
        this.availableSources,
        SOURCES_CACHE_TTL_SECONDS
      );

      // Persist sources to disk for offline use
      this.savePersistedSources(this.availableSources);

      logger.info(`[HydraLibrary] Fetched ${this.availableSources.length} sources from API`);
      return this.availableSources;
    } catch (error) {
      logger.error('[HydraLibrary] Failed to fetch sources from API:', error);
      
      // Try to load from cache
      const cached = await this.cacheService.get<HydraSource[]>(SOURCES_CACHE_KEY);
      if (cached && cached.length > 0) {
        logger.info('[HydraLibrary] Using cached sources');
        this.availableSources = cached;
        return this.availableSources;
      }
      
      // Use fallback
      logger.warn('[HydraLibrary] Using fallback sources');
      this.availableSources = FALLBACK_HYDRA_SOURCES.map(s => ({ ...s, enabled: this.settings.enabledSources.includes(s.id) }));
      return this.availableSources;
    }
  }

  /**
   * Get all available Hydra sources with their metadata
   */
  async getAvailableSources(): Promise<HydraSource[]> {
    // Refresh if not fetched or cache expired (1 hour)
    const cacheExpired = Date.now() - this.sourcesLastFetched > SOURCES_CACHE_TTL_SECONDS * 1000;
    
    if (this.availableSources.length === 0 || cacheExpired) {
      return this.refreshSources();
    }
    
    return this.availableSources;
  }

  /**
   * Get sources filtered by trust level
   */
  async getSourcesByTrustLevel(
    levels: HydraSourceTrustLevel[]
  ): Promise<HydraSource[]> {
    const sources = await this.getAvailableSources();
    return sources.filter((source) =>
      levels.includes(source.trustLevel)
    );
  }

  /**
   * Fetch library data from a specific source
   */
  async fetchSourceData(sourceId: string): Promise<HydraLibraryData | null> {
    const cacheKey = `${this.serviceName}:source:${sourceId}`;
    const cacheTtlSeconds = Math.max(
      60,
      (this.settings.cacheDurationMinutes || 60) * 60
    );

    // Check memory cache first
    if (this.cachedSources.has(sourceId)) {
      return this.cachedSources.get(sourceId)!;
    }

    // Check persistent cache
    const cached = await this.cacheService.get<HydraLibraryData>(cacheKey);
    if (cached) {
      this.cachedSources.set(sourceId, cached);
      return cached;
    }

    // Get source URL from available sources
    const sources = await this.getAvailableSources();
    const source = sources.find(s => s.id === sourceId);
    const sourceUrl = source?.url || `${HYDRA_LIBRARY_BASE_URL}/${sourceId}.json`;

    try {
      const response = await axios.get(sourceUrl, {
        timeout: DEFAULT_REQUEST_TIMEOUT_MS,
      });

      const normalized = this.normalizeSourceData(response.data, sourceId);
      if (!normalized) {
        logger.warn(
          `[HydraLibrary] Unsupported source format for ${sourceId} from ${sourceUrl}`
        );
        return null;
      }

      await this.cacheService.set(cacheKey, normalized, cacheTtlSeconds);
      this.cachedSources.set(sourceId, normalized);
      return normalized;
    } catch (error) {
      logger.warn(
        `[HydraLibrary] Failed to fetch ${sourceId} from ${sourceUrl}:`
      );
      return null;
    }
  }

  /**
   * Search for a game across all enabled sources
   */
  async searchGame(
    gameName: string,
    options?: {
      exactMatch?: boolean;
      maxResults?: number;
    }
  ): Promise<
    Array<{
      source: HydraSource;
      repacks: HydraRepackEntry[];
    }>
  > {
    if (!this.settings.enabled) {
      logger.info('[HydraLibrary] Hydra search is disabled');
      return [];
    }

    const results: Array<{
      source: HydraSource;
      repacks: HydraRepackEntry[];
    }> = [];

    const sources = await this.getAvailableSources();
    const enabledSources = sources.filter(
      (s) => s.enabled && this.settings.allowedTrustLevels.includes(s.trustLevel)
    );

    logger.info(
      `[HydraLibrary] Searching for "${gameName}" in ${enabledSources.length} enabled sources`
    );

    for (const source of enabledSources) {
      try {
        const sourceData = await this.fetchSourceData(source.id);
        if (!sourceData || !sourceData.games) {
          continue;
        }

        const matchingRepacks = this.findMatchingRepacks(
          gameName,
          sourceData,
          options
        );

        if (matchingRepacks.length > 0) {
          results.push({
            source,
            repacks: matchingRepacks.slice(
              0,
              this.settings.maxResultsPerSource
            ),
          });
        }
      } catch (error) {
        logger.error(
          `[HydraLibrary] Error searching source ${source.id}:`
        );
      }
    }

    logger.info(
      `[HydraLibrary] Found matches in ${results.length} sources for "${gameName}"`
    );
    return results;
  }

  /**
   * Find matching repacks for a game name
   */
  private findMatchingRepacks(
    gameName: string,
    sourceData: HydraLibraryData,
    options?: {
      exactMatch?: boolean;
      maxResults?: number;
    }
  ): HydraRepackEntry[] {
    const normalizedSearch = this.normalizeGameName(gameName);
    const matches: HydraRepackEntry[] = [];

    for (const [title, repacks] of Object.entries(sourceData.games)) {
      const normalizedTitle = this.normalizeGameName(title);

      if (options?.exactMatch) {
        if (normalizedTitle === normalizedSearch) {
          matches.push(...repacks);
        }
      } else {
        // Fuzzy matching
        const similarity = this.calculateSimilarity(
          normalizedTitle,
          normalizedSearch
        );
        if (similarity >= 0.7 || normalizedTitle.includes(normalizedSearch)) {
          matches.push(...repacks);
        }
      }
    }

    return matches;
  }

  /**
   * Normalize game name for comparison
   */
  private normalizeGameName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate similarity between two strings (0-1)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Clear cached source data
   */
  clearCache(): void {
    this.cachedSources.clear();
    logger.info('[HydraLibrary] Cache cleared');
  }

  /**
   * Check if Hydra search is available (enabled and has sources)
   */
  async isAvailable(): Promise<boolean> {
    if (!this.settings.enabled) return false;
    const sources = await this.getAvailableSources();
    return sources.length > 0;
  }

  /**
   * Get sources info including last updated time
   */
  getSourcesInfo(): {
    count: number;
    lastFetched: number | null;
    persistedFilePath: string;
  } {
    return {
      count: this.availableSources.length,
      lastFetched: this.sourcesLastFetched,
      persistedFilePath: this.getSourcesFilePath(),
    };
  }

  /**
   * Normalize source ID from title
   */
  private normalizeSourceId(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/\s+/g, '');
  }

  /**
   * Map API trust status to our trust levels
   */
  private mapTrustLevel(status: string[]): HydraSourceTrustLevel {
    if (status.includes('Trusted')) return 'trusted';
    if (status.includes('Unsafe')) return 'unsafe';
    if (status.includes('NSFW')) return 'nsfw';
    return 'safe';
  }

  private normalizeSourceData(
    data: unknown,
    sourceId: string
  ): HydraLibraryData | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const asRecord = data as Record<string, unknown>;

    if (asRecord.games && typeof asRecord.games === 'object') {
      return {
        games: asRecord.games as Record<string, HydraRepackEntry[]>,
        lastUpdated: (asRecord.lastUpdated ||
          asRecord.updatedAt ||
          asRecord.updateDate) as string | undefined,
        sourceName: (asRecord.sourceName || asRecord.name) as string | undefined,
        sourceId,
      };
    }

    if (Array.isArray(asRecord.downloads)) {
      const games: Record<string, HydraRepackEntry[]> = {};

      for (const entry of asRecord.downloads as Array<Record<string, unknown>>) {
        const title = typeof entry.title === 'string' ? entry.title.trim() : '';
        if (!title) continue;

        const urisRaw = entry.uris;
        const uris = Array.isArray(urisRaw)
          ? urisRaw.filter((uri) => typeof uri === 'string') as string[]
          : typeof urisRaw === 'string'
            ? [urisRaw]
            : [];

        if (uris.length === 0) continue;

        const repack: HydraRepackEntry = {
          title,
          fileSize:
            typeof entry.fileSize === 'string' || entry.fileSize === null
              ? (entry.fileSize as string | null)
              : null,
          uris,
          uploadDate:
            typeof entry.uploadDate === 'string' || entry.uploadDate === null
              ? (entry.uploadDate as string | null)
              : null,
        };

        if (!games[title]) {
          games[title] = [];
        }
        games[title].push(repack);
      }

      return {
        games,
        lastUpdated: (asRecord.lastUpdated ||
          asRecord.updatedAt ||
          asRecord.updateDate) as string | undefined,
        sourceName: (asRecord.name as string) || sourceId,
        sourceId,
      };
    }

    return null;
  }
}
