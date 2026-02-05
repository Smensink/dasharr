import axios from 'axios';
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

// Known Hydra library sources
// These are the community-maintained sources that Hydra launcher uses
const KNOWN_HYDRA_SOURCES: Omit<HydraSource, 'enabled'>[] = [
  {
    id: 'fitgirl',
    name: 'FitGirl Repacks',
    url: 'https://fitgirl-repacks.site',
    trustLevel: 'trusted',
    description: 'Highly compressed game repacks',
    author: 'FitGirl',
  },
  {
    id: 'dodi',
    name: 'DODI Repacks',
    url: 'https://dodi-repacks.site',
    trustLevel: 'trusted',
    description: 'Quality game repacks',
    author: 'DODI',
  },
  {
    id: 'steamrip',
    name: 'SteamRip',
    url: 'https://steamrip.com',
    trustLevel: 'safe',
    description: 'Direct download games from Steam',
    author: 'SteamRip',
  },
  {
    id: 'onlinefix',
    name: 'OnlineFix',
    url: 'https://onlinefix.me',
    trustLevel: 'safe',
    description: 'Online multiplayer fixes for games',
    author: 'OnlineFix',
  },
  {
    id: 'kaoskrew',
    name: 'KaOsKrew',
    url: 'https://kaoskrew.org',
    trustLevel: 'safe',
    description: 'Game repacks and releases',
    author: 'KaOsKrew',
  },
  {
    id: 'masquerade',
    name: 'Masquerade Repacks',
    url: 'https://masquerade-repacks.site',
    trustLevel: 'safe',
    description: 'Game repacks',
    author: 'Masquerade',
  },
  {
    id: 'armgddn',
    name: 'ARMGDDN',
    url: 'https://armgddn.com',
    trustLevel: 'safe',
    description: 'Game releases and repacks',
    author: 'ARMGDDN',
  },
];

/**
 * Service for managing Hydra Library sources
 * Fetches game download links from community-maintained JSON sources
 */
export class HydraLibraryService {
  private cacheService: CacheService;
  private settings: HydraSearchSettings;
  private cachedSources: Map<string, HydraLibraryData> = new Map();
  private readonly serviceName = 'hydra-library';

  constructor(cacheService: CacheService, settings?: HydraSearchSettings) {
    this.cacheService = cacheService;
    this.settings = settings || DEFAULT_HYDRA_SEARCH_SETTINGS;
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
   * Get all available Hydra sources with their metadata
   */
  getAvailableSources(): HydraSource[] {
    return KNOWN_HYDRA_SOURCES.map((source) => ({
      ...source,
      enabled: this.settings.enabledSources.includes(source.id),
    }));
  }

  /**
   * Get sources filtered by trust level
   */
  getSourcesByTrustLevel(
    levels: HydraSourceTrustLevel[]
  ): HydraSource[] {
    return this.getAvailableSources().filter((source) =>
      levels.includes(source.trustLevel)
    );
  }

  /**
   * Fetch library data from a specific source
   * This would normally fetch from the actual Hydra wiki JSON endpoints
   * For now, we return cached data or empty
   */
  async fetchSourceData(sourceId: string): Promise<HydraLibraryData | null> {
    const cacheKey = `${this.serviceName}:source:${sourceId}`;

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

    // In a full implementation, this would fetch from the Hydra wiki API
    // For example: https://library.hydra.wiki/sources/{sourceId}.json
    // Currently we return null as the actual endpoints need to be discovered
    logger.warn(
      `[HydraLibrary] No cached data for source ${sourceId}. ` +
        'Direct Hydra wiki fetching not yet implemented.'
    );

    return null;
  }

  /**
   * Search for a game across all enabled sources
   * This searches through cached library data
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

    const enabledSources = this.getAvailableSources().filter(
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
          `[HydraLibrary] Error searching source ${source.id}:`,
          error
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
  isAvailable(): boolean {
    return (
      this.settings.enabled && this.settings.enabledSources.length > 0
    );
  }
}
