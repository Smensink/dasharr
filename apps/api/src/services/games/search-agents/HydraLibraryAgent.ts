import { GameDownloadCandidate } from '@dasharr/shared-types';
import {
  BaseGameSearchAgent,
  SearchAgentResult,
  EnhancedMatchOptions,
} from './BaseGameSearchAgent';
import { HydraLibraryService } from '../HydraLibraryService';
import { logger } from '../../../utils/logger';
// ML filtering is handled by BaseGameSearchAgent.applyMLFilter()

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
    return this.hydraService.getSettings().enabled;
  }

  async isReady(): Promise<boolean> {
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
            sourceTrustLevel: result.source.trustLevel,
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
          const sanitizedTitle = this.sanitizeHydraTitle(repack.title);
          // Use enhanced matching from base class
          const baseMatch = this.matchWithIGDB(
            sanitizedTitle,
            options,
            undefined // Hydra sources don't provide descriptions
          );
          const matchResult = this.applyHydraPenalties(
            repack.title,
            sanitizedTitle,
            baseMatch,
            options
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
            sourceTrustLevel: result.source.trustLevel,
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

  private applyHydraPenalties(
    title: string,
    sanitizedTitle: string,
    baseMatch: { matches: boolean; score: number; reasons: string[] },
    options: EnhancedMatchOptions
  ): { matches: boolean; score: number; reasons: string[] } {
    const result = {
      matches: baseMatch.matches,
      score: baseMatch.score,
      reasons: [...baseMatch.reasons],
    };

    const settings = this.hydraService.getSettings();
    const classification = this.classifyTitleTokens(title, options);
    if ((settings as any).penalizeBundles) {
      const categoryFlags = this.getCategoryFlags(options.igdbGame);

      if (
        (classification.hasFullBundleIndicator || classification.hasMultiGameIndicator) &&
        categoryFlags.isMainLike &&
        !categoryFlags.allowsDlc
      ) {
        result.score -= 25;
        result.reasons.push('bundle/collection penalty');
      }
    }

    const extraTokens = this.getHydraExtraTokens(sanitizedTitle, options);
    if (extraTokens.length > 0) {
      const basePenalty = Math.min(45, 15 + extraTokens.length * 10);
      const penalty = classification.hasEmulatorToken
        ? Math.max(0, basePenalty - 15)
        : basePenalty;
      result.score -= penalty;
      result.reasons.push(
        `hydra extra tokens (${extraTokens.slice(0, 3).join(', ')})`
      );
    }

    if (this.hasHydraSpinoffToken(extraTokens)) {
      const isEditionVariant = this.isEditionVariant(title, options.igdbGame.name);
      if (!isEditionVariant) {
        result.score -= 25;
        result.reasons.push('hydra spinoff token');
      }
    }

    const minMatchScore = options.minMatchScore ?? 70;
    result.score = Math.max(0, Math.min(150, result.score));
    result.matches = result.score >= minMatchScore;

    // ML filtering is now handled by BaseGameSearchAgent.applyMLFilter()
    this.applyMLFilter(result);

    return result;
  }

  private sanitizeHydraTitle(title: string): string {
    let result = title;

    // Strip bracketed metadata blocks
    result = result.replace(/\[[^\]]*\]/g, ' ');
    result = result.replace(/\([^)]*\)/g, ' ');

    // Remove obvious metadata phrases
    result = result.replace(/\bfree\s+download\b/gi, ' ');
    result = result.replace(/\b(selective\s+download|direct\s+download)\b/gi, ' ');
    result = result.replace(/\b(repack|fitgirl|dodi|steamrip|gog)\b/gi, ' ');
    result = result.replace(/\b(multi\s*\d+|multilang|multilanguage)\b/gi, ' ');
    result = result.replace(/\b(v|ver|version)\s*\d+(?:\.\d+)*[a-z]?\b/gi, ' ');
    result = result.replace(/\b(build|bld)\s*\d+\b/gi, ' ');
    result = result.replace(/\b(crackfix|crack|fix)\b/gi, ' ');

    result = result.replace(/\s+/g, ' ').trim();
    return result;
  }

  private getHydraExtraTokens(
    title: string,
    options: EnhancedMatchOptions
  ): string[] {
    const normalizedTitle = this.normalizeGameName(title);
    const normalizedGame = this.normalizeGameName(options.igdbGame.name);
    const titleWords = normalizedTitle.split(/\s+/).filter(Boolean);
    const gameWords = normalizedGame.split(/\s+/).filter(Boolean);
    const editionQualifiers = this.getEditionQualifierTokens(normalizedTitle);

    const ignored = new Set([
      'pc', 'windows', 'win', 'linux', 'mac', 'macos',
      'steam', 'gog', 'epic',
      'x64', 'x86', '64bit', '32bit',
      'multi', 'multilang', 'multilanguage', 'english', 'eng', 'en',
      'russian', 'rus', 'ru', 'french', 'fr', 'german', 'de', 'spanish', 'es',
      'italian', 'it', 'portuguese', 'pt', 'polish', 'pl', 'japanese', 'jpn',
      'korean', 'kor', 'chinese', 'chs', 'cht',
      'switch', 'nsw', 'ps4', 'ps5', 'xbox', 'wii', 'wiiu', '3ds', 'vita',
      'emu', 'emulator', 'emulators', 'yuzu', 'ryujinx', 'rpcs3', 'xenia',
      'edition', 'ultimate', 'deluxe', 'complete', 'definitive', 'remastered',
      'remaster', 'remake', 'expanded', 'director', 'cut', 'goty', 'gold',
      'platinum', 'anniversary', 'collection', 'bundle', 'pack', 'plus',
      'collector', 'collectors', 'limited', 'special', 'digital', 'twin',
      'mod', 'mods', 'modded', 'multiplayer', 'online', 'coop', 'co-op',
      'dlc', 'dlcs', 'all', 'bonus', 'content', 'ost', 'soundtrack',
      'update', 'patch', 'hotfix', 'build', 'version', 'v',
    ]);

    return titleWords.filter((word) => {
      if (ignored.has(word)) return false;
      if (editionQualifiers.has(word)) return false;
      if (gameWords.includes(word)) return false;
      if (/^\d+$/.test(word)) return false;
      if (/^v?\d+(?:\.\d+)*$/i.test(word)) return false;
      return word.length > 2;
    });
  }

  private hasHydraSpinoffToken(tokens: string[]): boolean {
    const spinoffTokens = new Set([
      'tactica',
      'nightreign',
      'origins',
      'stories',
      'story',
      'chronicles',
      'adventure',
      'adventures',
      'expedition',
      'odyssey',
      'fury',
      'plus',
      'collection',
      'trilogy',
      'legends',
      'tales',
    ]);

    return tokens.some((token) => spinoffTokens.has(token));
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
