import { GameDownloadCandidate } from '@dasharr/shared-types';
import {
  BaseGameSearchAgent,
  SearchAgentResult,
  EnhancedMatchOptions,
} from './BaseGameSearchAgent';
import { HydraLibraryService } from '../HydraLibraryService';
import { logger } from '../../../utils/logger';

/**
 * Hydra Library Search Agent
 *
 * Searches for game downloads using the Hydra Library wiki sources.
 * These are community-maintained JSON files with download links.
 */
export class HydraLibraryAgent extends BaseGameSearchAgent {
  readonly name = 'Hydra Library';
  readonly baseUrl = 'https://library.hydra.wiki';
  readonly requiresAuth = false;
  readonly priority = 90; // High priority - curated sources
  readonly releaseTypes: ('repack' | 'rip' | 'scene' | 'p2p')[] = [
    'repack',
    'rip',
    'scene',
    'p2p',
  ];

  private hydraService: HydraLibraryService;

  constructor(hydraService: HydraLibraryService) {
    super();
    this.hydraService = hydraService;
  }

  isAvailable(): boolean {
    return this.hydraService.isAvailable();
  }

  /**
   * Get download links from a result URL
   * Hydra sources provide URIs directly, so this just returns the info
   */
  async getDownloadLinks(resultUrl: string): Promise<Partial<GameDownloadCandidate>[]> {
    // Hydra sources provide download URIs directly in the search results
    // This method is not typically used but is required by the base class
    return [{
      infoUrl: resultUrl,
    }];
  }

  async search(gameName: string): Promise<SearchAgentResult> {
    try {
      logger.info(`[HydraLibrary] Searching for: ${gameName}`);

      const searchResults = await this.hydraService.searchGame(gameName, {
        exactMatch: false,
      });

      const candidates: GameDownloadCandidate[] = [];

      for (const result of searchResults) {
        for (const repack of result.repacks) {
          // Extract size info
          const sizeInfo = repack.fileSize
            ? this.extractSize(repack.fileSize)
            : undefined;

          // Get the first available URI as magnet/torrent URL
          const magnetUrl = repack.uris.find((uri) =>
            uri.startsWith('magnet:')
          );
          const torrentUrl = repack.uris.find(
            (uri) =>
              uri.endsWith('.torrent') && !uri.startsWith('magnet:')
          );
          const infoUrl = repack.uris.find(
            (uri) =>
              !uri.startsWith('magnet:') && !uri.endsWith('.torrent')
          );

          const candidate: GameDownloadCandidate = {
            title: repack.title,
            source: `${this.name} (${result.source.name})`,
            releaseType: this.detectReleaseType(repack.title),
            size: sizeInfo?.size || repack.fileSize || undefined,
            sizeBytes: sizeInfo?.bytes,
            magnetUrl,
            torrentUrl,
            infoUrl,
            platform: 'PC',
          };

          candidates.push(candidate);
        }
      }

      logger.info(`[HydraLibrary] Found ${candidates.length} candidates`);

      return {
        success: true,
        candidates,
      };
    } catch (error) {
      logger.error('[HydraLibrary] Search error:', error);
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Enhanced search with IGDB game info for better matching
   */
  async searchEnhanced(
    gameName: string,
    options: EnhancedMatchOptions
  ): Promise<SearchAgentResult> {
    try {
      logger.info(
        `[HydraLibrary] Enhanced search for: ${gameName} (${options.igdbGame.name})`
      );

      const searchResults = await this.hydraService.searchGame(
        options.igdbGame.name,
        {
          exactMatch: false,
        }
      );

      const candidates: GameDownloadCandidate[] = [];

      for (const result of searchResults) {
        for (const repack of result.repacks) {
          // Use enhanced matching from base class
          const matchResult = this.matchWithIGDB(
            repack.title,
            options,
            undefined // Hydra sources don't provide descriptions
          );

          if (!matchResult.matches) {
            logger.debug(
              `[HydraLibrary] Filtered out: "${repack.title}" - score ${matchResult.score}`
            );
            continue;
          }

          // Extract size info
          const sizeInfo = repack.fileSize
            ? this.extractSize(repack.fileSize)
            : undefined;

          // Get the first available URI
          const magnetUrl = repack.uris.find((uri) =>
            uri.startsWith('magnet:')
          );
          const torrentUrl = repack.uris.find(
            (uri) =>
              uri.endsWith('.torrent') && !uri.startsWith('magnet:')
          );
          const infoUrl = repack.uris.find(
            (uri) =>
              !uri.startsWith('magnet:') && !uri.endsWith('.torrent')
          );

          const candidate: GameDownloadCandidate = {
            title: repack.title,
            source: `${this.name} (${result.source.name})`,
            releaseType: this.detectReleaseType(repack.title),
            size: sizeInfo?.size || repack.fileSize || undefined,
            sizeBytes: sizeInfo?.bytes,
            magnetUrl,
            torrentUrl,
            infoUrl,
            platform: this.detectPlatform(repack.title),
            matchScore: matchResult.score,
            matchReasons: matchResult.reasons,
          };

          candidates.push(candidate);
        }
      }

      // Sort by match score
      candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

      logger.info(
        `[HydraLibrary] Enhanced search found ${candidates.length} candidates`
      );

      return {
        success: true,
        candidates,
      };
    } catch (error) {
      logger.error('[HydraLibrary] Enhanced search error:', error);
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Detect platform from title
   */
  private detectPlatform(title: string): string {
    const lower = title.toLowerCase();
    if (lower.includes('switch') || lower.includes('nintendo')) return 'Switch';
    if (lower.includes('ps4') || lower.includes('playstation 4')) return 'PS4';
    if (lower.includes('ps5') || lower.includes('playstation 5')) return 'PS5';
    if (lower.includes('xbox')) return 'Xbox';
    return 'PC';
  }
}
