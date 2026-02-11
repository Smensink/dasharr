import axios from 'axios';
import { BaseGameSearchAgent, SearchAgentResult, EnhancedMatchOptions } from './BaseGameSearchAgent';
import { GameDownloadCandidate } from '@dasharr/shared-types';
import { logger } from '../../../utils/logger';
import { SequelPatterns } from '../../../utils/SequelDetector';
import { PlatformDetector, GamePlatform } from '../../../utils/PlatformDetector';

export interface ProwlarrConfig {
  baseUrl: string;
  apiKey: string;
}

interface ProwlarrSearchResult {
  id: number;
  guid: string;
  title: string;
  releaseTitle?: string;
  indexer: string;
  indexerId: number;
  size: number;
  publishDate: string;
  magnetUrl?: string;
  downloadUrl?: string;
  infoUrl?: string;
  seeders?: number;
  leechers?: number;
  grabs?: number;
  categories?: { id: number; name: string }[];
  protocol?: string;
  // Additional fields that Prowlarr returns
  uploader?: string;
  uploaderName?: string;
}

/**
 * Prowlarr-based Game Search Agent
 * 
 * Uses Prowlarr to search regular torrent sites (1337x, RARBG alternatives, etc.)
 * This agent searches specifically for games using Prowlarr's search API.
 */
export class ProwlarrGameAgent extends BaseGameSearchAgent {
  readonly name = 'Prowlarr';
  readonly baseUrl: string;
  readonly requiresAuth = true;
  readonly priority = 70;
  readonly releaseTypes: ('repack' | 'rip' | 'scene' | 'p2p')[] = ['scene', 'p2p'];

  private axiosInstance: ReturnType<typeof axios.create>;
  private apiKey: string;

  // Trusted game uploaders whitelist
  private readonly trustedUploaders = [
    'anadius', 'DODI', 'FitGirl', 'JohnCena141', 'KaOsKrew', 's7on3r', 'TinyRepacks',
    '0xEMPRESS', 'CODEX', 'CPY', 'SKIDROW', 'PLAZA', 'HOODLUM', 'RAZOR1911', 'FLT',
    'TENOKE', 'RUNNE', 'ELAMIGOS', 'DARKSiDERS', 'DARKSIDERS', 'IGG', 'IGG-GAMES',
    'GOG', 'GOG-Games', 'GOG Games', 'GOG-Games',
    // cs.rin.ru variations
    'cs.rin.ru', 'cs rin ru', 'csrinru', 'online-fix', 'onlinefix',
    // Common uploaders
    'MrDeadpool', 'dauphong', 'M4CK', 'J4F', 'blithe', 'Merlin', 'VickNet',
    'SENPAI', 'InsaneRamZes', 'xatab', 'Masquerade', 'DARKSiDERS', 'Darksiders',
    'FGT', 'G4U', 'G4U+RIP', 'Razor1911', 'Reloaded', 'RLD',
  ];

  // Scene groups for release type detection
  private readonly sceneGroups = [
    'CODEX', 'CPY', 'SKIDROW', 'PLAZA', 'HOODLUM',
    'RAZOR1911', 'FLT', 'TENOKE', 'RUNNE', 'DARKSiDERS',
    'RELOADED', 'RLD', 'FAIRLIGHT', 'PROPHET', 'OUTLAWS', 'RELOADED',
  ];

  // Known sequel patterns for false positive prevention
  private readonly knownSequels: Record<string, string[]> = {
    'Hollow Knight': ['Hollow Knight: Silksong', 'Silksong'],
    'Hades': ['Hades II', 'Hades 2'],
    'Cyberpunk 2077': ['Cyberpunk 2077: Edgerunners', 'Edgerunners'],
    'The Witcher': ['The Witcher 2', 'The Witcher 3'],
    'Red Dead Redemption': ['Red Dead Redemption 2'],
    'Portal': ['Portal 2'],
    'Left 4 Dead': ['Left 4 Dead 2'],
    'Half-Life': ['Half-Life 2'],
    'Team Fortress': ['Team Fortress 2'],
    'Payday': ['Payday 2', 'Payday 3'],
    'Dying Light': ['Dying Light 2'],
    'Watch Dogs': ['Watch Dogs 2', 'Watch Dogs: Legion'],
    'Borderlands': ['Borderlands 2', 'Borderlands 3'],
    'Mass Effect': ['Mass Effect 2', 'Mass Effect 3', 'Mass Effect: Andromeda'],
    'Dragon Age': ['Dragon Age II', 'Dragon Age: Inquisition'],
    'Dark Souls': ['Dark Souls II', 'Dark Souls III'],
  };

  constructor(config: ProwlarrConfig) {
    super();
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000,
      headers: {
        'X-Api-Key': this.apiKey,
        'Accept': 'application/json',
      },
    });

    logger.info(`[ProwlarrGame] Initialized with ${this.trustedUploaders.length} trusted uploaders`);
  }

  isAvailable(): boolean {
    return !!(this.baseUrl && this.apiKey);
  }

  async search(gameName: string, options?: { platform?: string }): Promise<SearchAgentResult> {
    try {
      logger.info(`[ProwlarrGame] Searching for: ${gameName} (platform: ${options?.platform || 'PC (default)'})`);

      const results = await this.fetchSearchResults(gameName, options?.platform as GamePlatform);
      const candidates = this.parseResults(results, gameName, options?.platform as GamePlatform);

      logger.info(`[ProwlarrGame] Found ${candidates.length} candidates`);

      return {
        success: true,
        candidates,
      };
    } catch (error) {
      logger.error('[ProwlarrGame] Search error:', error);
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Enhanced search with IGDB matching to filter results
   */
  async searchEnhanced(
    gameName: string,
    options: EnhancedMatchOptions
  ): Promise<SearchAgentResult> {
    try {
      logger.info(`[ProwlarrGame] Enhanced search for: ${gameName} (${options.igdbGame.name})`);

      const results = await this.fetchSearchResults(this.cleanGameName(options.igdbGame.name), options.platform as GamePlatform);
      const candidates = await this.parseResultsEnhanced(results, options);

      // Sort by match score (highest first), then platform score
      candidates.sort((a, b) => {
        const matchDiff = (b.matchScore || 0) - (a.matchScore || 0);
        if (matchDiff !== 0) return matchDiff;
        return (b.platformScore || 0) - (a.platformScore || 0);
      });

      logger.info(`[ProwlarrGame] Enhanced search found ${candidates.length} candidates (filtered from ${results.length} results)`);

      return {
        success: true,
        candidates,
      };
    } catch (error) {
      logger.error('[ProwlarrGame] Enhanced search error:', error);
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch raw search results from Prowlarr
   *
   * Uses Torznab category filtering to only search game categories:
   * - 4050: PC/Games (PC Games specifically)
   * - 1000: Console (all console games)
   * - 1040: Console/Xbox
   * - 1050: Console/Xbox 360
   * - 1080: Console/PS3
   * - 1140: Console/Xbox One
   * - 1150: Console/PS4
   * - 1160: Console/Switch
   */
  public async fetchSearchResults(query: string, preferredPlatform?: GamePlatform): Promise<ProwlarrSearchResult[]> {
    // Define category sets for different platforms
    const categoryMap: Record<string, number[]> = {
      PC: [4000, 4050], // PC Games (some indexers only expose 4000)
      PS5: [1000, 1150], // Console + PS4/PS5
      PS4: [1000, 1150], // Console + PS4
      PS3: [1000, 1080], // Console + PS3
      Xbox: [1000, 1040, 1140], // Console + Xbox One/Series
      Xbox360: [1000, 1010, 1050], // Console + Xbox 360
      Switch: [1000, 1160], // Console + Switch
      Wii: [1000, 1060], // Console + Wii
      WiiU: [1000, 1190], // Console + WiiU
      PSVita: [1000, 1130, 1180], // Console + PS Vita
    };

    let gameCategories: number[];
    
    if (preferredPlatform && preferredPlatform !== 'PC' && categoryMap[preferredPlatform]) {
      // Search specific platform categories
      gameCategories = categoryMap[preferredPlatform];
      logger.info(`[ProwlarrGame] Searching for ${preferredPlatform} with categories: ${gameCategories.join(',')}`);
    } else {
      // Default: search all game categories
      const pcCategories = [4000, 4050];
      const consoleCategories = [1000, 1040, 1050, 1080, 1140, 1150, 1160, 1010, 1060, 1130, 1180, 1190];
      gameCategories = [...pcCategories, ...consoleCategories];
      logger.info(`[ProwlarrGame] Searching all platforms with categories: ${gameCategories.join(',')}`);
    }

    const params = new URLSearchParams({
      query: query,
      type: 'search',
      limit: '100',
    });

    // Add multiple categories parameters (Prowlarr requires separate params, not comma-separated)
    // https://github.com/Prowlarr/Prowlarr/issues/2440
    gameCategories.forEach(cat => {
      params.append('categories', cat.toString());
    });

    const searchUrl = `/api/v1/search?${params.toString()}`;
    const fullUrl = `${this.baseUrl}${searchUrl}`;
    logger.info(`[ProwlarrGame] Search query: "${query}"`);
    logger.info(`[ProwlarrGame] Searching with categories: ${gameCategories.join(',')}`);
    logger.info(`[ProwlarrGame] Full URL: ${searchUrl}`);
    logger.info(`[ProwlarrGame] Complete URL with base: ${fullUrl}`);

    const response = await this.axiosInstance.get<ProwlarrSearchResult[]>(searchUrl);

    logger.info(`[ProwlarrGame] Prowlarr returned ${response.data?.length || 0} results`);

    // Log first 10 result titles to see what we're getting
    if (response.data && response.data.length > 0) {
      const titles = response.data.slice(0, 10).map(r => r.title || r.releaseTitle || 'NO_TITLE');
      logger.info(`[ProwlarrGame] First 10 result titles: ${JSON.stringify(titles)}`);
      this.logResultBreakdown(response.data);
    }

    return response.data || [];
  }

  /**
   * Parse Prowlarr results into candidates
   */
  private parseResults(
    results: ProwlarrSearchResult[],
    gameName: string,
    preferredPlatform?: GamePlatform
  ): GameDownloadCandidate[] {
    const candidates: GameDownloadCandidate[] = [];
    const platformDetector = new PlatformDetector(preferredPlatform);

    for (const result of results) {
      const title = this.extractTitle(result);
      if (!title) continue;

      // Filter for game-related releases
      if (!this.isGameRelease(title)) {
        logger.debug(`[ProwlarrGame] Skipping non-game: "${title}"`);
        continue;
      }

      // Filter out updates/patches/trainers - we want the full game
      if (this.isGameUpdate(title)) {
        logger.debug(`[ProwlarrGame] Skipping update/trainer: "${title}"`);
        continue;
      }

      // Filter by trusted uploaders
      const uploader = result.uploaderName || result.uploader;
      if (uploader) {
        logger.info(`[ProwlarrGame] Found uploader: "${uploader}" from ${result.indexer}`);
      }
      if (!this.isTrustedUploader(uploader)) {
        logger.info(`[ProwlarrGame] Skipping untrusted uploader: "${uploader || 'No uploader info'}" from ${result.indexer}`);
        continue;
      }

      // Check if it matches our game
      if (!this.isMatch(title, gameName)) {
        logger.debug(`[ProwlarrGame] No match: "${title}"`);
        continue;
      }

      // Detect platform
      const primaryCategory = result.categories?.[0]?.id;
      const platformMatch = platformDetector.detectPlatform(title, primaryCategory);
      
      // Filter by platform
      if (preferredPlatform) {
        if (platformMatch.platform !== preferredPlatform) {
          logger.debug(`[ProwlarrGame] Skipping wrong platform: "${title}" (${platformMatch.platform} vs ${preferredPlatform})`);
          continue;
        }
      }

      const candidate = this.createCandidate(result, title, undefined, undefined, platformMatch.platform);
      if (candidate) {
        candidate.platformScore = platformDetector.getPlatformScore(platformMatch.platform);
        candidates.push(candidate);
      }
    }

    // Sort by platform score (preferred platforms first)
    candidates.sort((a, b) => (b.platformScore || 0) - (a.platformScore || 0));

    return candidates;
  }

  /**
   * Parse results with enhanced IGDB matching
   */
  private async parseResultsEnhanced(
    results: ProwlarrSearchResult[],
    options: EnhancedMatchOptions
  ): Promise<GameDownloadCandidate[]> {
    const candidates: GameDownloadCandidate[] = [];
    let gameRelatedCount = 0;
    let trustedUploaderCount = 0;
    
    // Initialize platform detector with preferred platform
    const platformDetector = new PlatformDetector(options.platform as GamePlatform);

    for (const result of results) {
      const title = this.extractTitle(result);
      if (!title) continue;

      // Filter for game-related releases (belt and suspenders - Prowlarr categories should handle most filtering)
      if (!this.isGameRelease(title)) {
        continue;
      }

      // Filter out updates/patches/trainers - we want the full game
      if (this.isGameUpdate(title)) {
        logger.debug(`[ProwlarrGame] Skipping update/trainer: "${title}"`);
        continue;
      }

      // Extra-word guard for single-word titles (filters fan games/mods/ports)
      if (this.hasDisallowedExtraWords(title, options.igdbGame.name)) {
        logger.debug(`[ProwlarrGame] Skipping extra-word mismatch: "${title}"`);
        continue;
      }
      
      gameRelatedCount++;

      // Filter by trusted uploaders
      const uploader = result.uploaderName || result.uploader;
      if (uploader) {
        logger.info(`[ProwlarrGame] Found uploader: "${uploader}" from ${result.indexer}`);
      }
      if (!this.isTrustedUploader(uploader)) {
        logger.info(`[ProwlarrGame] Skipping untrusted uploader: "${uploader || 'No uploader info'}" from ${result.indexer}`);
        continue;
      }
      trustedUploaderCount++;
      
      // Detect platform
      const primaryCategory = result.categories?.[0]?.id;
      const platformMatch = platformDetector.detectPlatform(title, primaryCategory);
      
      // Filter by platform if specified
      if (options.platform) {
        if (platformMatch.platform !== options.platform) {
          logger.debug(`[ProwlarrGame] Skipping wrong platform: "${title}" (${platformMatch.platform} vs ${options.platform})`);
          continue;
        }
      }

      // Use enhanced matching with IGDB data
      // Lower the threshold for Prowlarr since it already searched by query
      const matchOptions = {
        ...options,
        minMatchScore: 30, // Lower threshold for Prowlarr
        candidateSizeBytes: result.size, // Pass size for validation
        seeders: result.seeders,
        leechers: result.leechers,
        grabs: result.grabs,
        sourceTrustLevel: 'unknown' as const, // Prowlarr results are from mixed indexers
        sourceKey: `prowlarr:${result.indexer || 'unknown'}`,
      };
      const matchResult = this.matchWithIGDB(title, matchOptions);

      // Log matches for debugging
      if (trustedUploaderCount <= 30) {
        logger.info(`[ProwlarrGame] Match #${trustedUploaderCount}: "${title}" score=${matchResult.score}`);
      }

      if (!matchResult.matches) {
        continue;
      } else {
        // Log successful matches
        logger.info(`[ProwlarrGame] ✓ MATCH FOUND: "${title}" score=${matchResult.score}, reasons=[${matchResult.reasons.join(', ')}]`);
      }

      // Check if this is actually a sequel (false positive)
      if (this.isSequel(title, options.igdbGame.name)) {
        logger.debug(`[ProwlarrGame] Rejected sequel match: "${title}" for "${options.igdbGame.name}"`);
        continue;
      }

      const candidate = this.createCandidate(result, title, matchResult.score, matchResult.reasons, platformMatch.platform);
      if (candidate) {
        candidate.platformScore = platformDetector.getPlatformScore(platformMatch.platform);
        candidates.push(candidate);
      }
    }

    logger.info(`[ProwlarrGame] Filter stats: ${results.length} total -> ${gameRelatedCount} game-related -> ${trustedUploaderCount} trusted uploaders -> ${candidates.length} final candidates`);

    // Optional cross-encoder reranker (batch) for sorting/triage.
    const reranked = await this.maybeApplyReranker(options.igdbGame.name, candidates);

    return reranked;
  }

  /**
   * Extract the best title from a Prowlarr result
   */
  private extractTitle(result: ProwlarrSearchResult): string {
    // Prefer releaseTitle if available (cleaner)
    if (result.releaseTitle && result.releaseTitle.trim()) {
      return result.releaseTitle.trim();
    }
    
    // Fall back to regular title
    if (result.title && result.title.trim()) {
      return result.title.trim();
    }

    return '';
  }

  /**
   * Create a candidate from a Prowlarr result
   */
  private createCandidate(
    result: ProwlarrSearchResult,
    title: string,
    matchScore?: number,
    matchReasons?: string[],
    platform?: string
  ): GameDownloadCandidate | null {
    const releaseType = this.detectReleaseType(title);

    // Get the best download URL
    const { magnetUrl, torrentUrl } = this.extractDownloadUrls(result);

    // Skip if no download URL available
    if (!magnetUrl && !torrentUrl) {
      logger.debug(`[ProwlarrGame] No download URL for: "${title}"`);
      return null;
    }

    // Extract uploader name
    const uploader = result.uploaderName || result.uploader;

    return {
      title,
      source: `${this.name} (${result.indexer || 'Unknown'})`,
      releaseType: releaseType === 'unknown' ? 'p2p' : releaseType,
      size: result.size ? this.formatBytes(result.size) : undefined,
      sizeBytes: result.size,
      seeders: result.seeders,
      leechers: result.leechers,
      magnetUrl,
      torrentUrl,
      uploader,
      platform,
      matchScore,
      matchReasons,
    };
  }

  /**
   * Extract download URLs from result
   */
  private extractDownloadUrls(result: ProwlarrSearchResult): {
    magnetUrl?: string;
    torrentUrl?: string;
  } {
    let magnetUrl: string | undefined;
    let torrentUrl: string | undefined;

    // Check magnetUrl field
    if (result.magnetUrl) {
      if (result.magnetUrl.startsWith('magnet:')) {
        magnetUrl = result.magnetUrl;
      } else if (result.magnetUrl.startsWith('http')) {
        // Some indexers return HTTP links that redirect to magnets
        torrentUrl = result.magnetUrl;
      }
    }

    // Check downloadUrl field
    if (result.downloadUrl) {
      if (result.downloadUrl.startsWith('magnet:')) {
        magnetUrl = result.downloadUrl;
      } else if (result.downloadUrl.startsWith('http')) {
        torrentUrl = result.downloadUrl;
      }
    }

    // If infoUrl contains a magnet, use it
    if (result.infoUrl && result.infoUrl.startsWith('magnet:')) {
      magnetUrl = result.infoUrl;
    }

    return { magnetUrl, torrentUrl };
  }

  /**
   * Check if a release is game-related
   *
   * NOTE: Prowlarr category filtering (4000-4040 for PC, 1000+ for console) handles
   * most filtering. This is a secondary filter for edge cases that slip through.
   */
  private isGameRelease(title: string): boolean {
    const lower = title.toLowerCase();

    // Strong indicators this is NOT a game (audiobooks, movies with video encoding)
    const definitelyNotGamePatterns = [
      /\[m4b\]/i, // Audiobook format
      /\b(epub|mobi|pdf|audiobook|comic|cbr|cbz)\b/i, // Book formats
      /\b(x264|x265|hevc|h264|h265|avc|xvid)\b.*\b(1080p|720p|2160p)\b/i, // Video with resolution
      /\b(mp3|flac|aac)\b.*\b(album|discography)\b/i, // Music releases
      /\bs\d{2}e\d{2}\b/i, // TV show episodes (S01E01 format)
    ];

    // If it has strong non-game indicators, reject it
    if (definitelyNotGamePatterns.some(p => p.test(lower))) {
      return false;
    }

    return true;
  }

  /**
   * Check if this is a game update/patch rather than the full game
   * 
   * Refined to reduce false negatives:
   * - Allow "Game Update vX.X.X-GROUP" (legitimate game updates)
   * - Only filter "Update Only" patches that require base game
   */
  private isGameUpdate(title: string): boolean {
    const lower = title.toLowerCase();
    
    // Scene and repack group names - strong indicators this is a game release
    const sceneGroups = /\b(codex|cpy|skidrow|plaza|hoodlum|razor1911|flt|tenoke|dodi|fitgirl|dinobytes|elamigos|simplex|gog|venom|suxxors)\b/i;
    const hasSceneGroup = sceneGroups.test(lower);
    
    // Known game platforms
    const gamePlatforms = /\b(nsw|switch|ps4|ps5|xbox|pc|windows|win|gog|steam)\b/i;
    const hasGamePlatform = gamePlatforms.test(lower);
    
    // Patterns that definitely indicate this is NOT the full game
    const definiteUpdatePatterns = [
      /\bupdate\s+only\b/i,              // "Update Only" - explicitly just an update
      /\bpatch\s+only\b/i,               // "Patch Only"
      /\bupdate\s+v?\d+.*\brequire\b/i,  // "Update v1.x (Require...)"
      /\btrainer\b/i,                    // Trainers/cheats
      /\bplus\s*\d+\s*trainer\b/i,       // "Plus 11 Trainer"
      /\bcrack\s*only\b/i,               // Just a crack
      /\bfix\s*only\b/i,                 // Just a fix
      /\blanguage\s*pack\b/i,            // Language Pack
      /\bread\s+by\b/i,                  // "Read by" - audiobook
    ];

    if (definiteUpdatePatterns.some(p => p.test(lower))) {
      return true;
    }
    // If title contains update/patch/hotfix, treat as update unless it's clearly a full game release
    const updatePattern = /\b(update|patch|hotfix)\b/i;
    if (updatePattern.test(lower)) {
      // Allow if it has a version number (e.g., "Game v1.2.3 Update 4" = full game with updates)
      const hasVersionNumber = /\bv?\d+\.\d+/i.test(lower);
      // Allow if it has bundle/edition/repack indicators
      const fullBundleIndicators = /\b(repack|complete|edition|bundle|collection|goty|definitive|ultimate|deluxe|full|fitgirl|dodi)\b/i;
      // Allow if it has a scene group tag (e.g., "-TENOKE", "-CODEX")
      const hasSceneTag = /-(codex|cpy|skidrow|plaza|hoodlum|razor1911|flt|tenoke|runne|elamigos|dodi|fitgirl|gog|p2p|rune|simplex)\b/i.test(lower);
      if (!hasVersionNumber && !fullBundleIndicators.test(lower) && !hasSceneTag) {
        return true;
      }
    }

    // If it has FitGirl/Repack, allow it
    if (/\b(fitgirl|repack)\b/i.test(lower)) {
      return false;
    }

    // Check for soundtrack - but allow if it's a bundle
    if (/\b(ost|soundtrack)\b/i.test(lower)) {
      // Bundle indicators
      const bundleIndicators = [
        /\+.*\bsoundtrack\b/i,
        /\b(incl|including|with).*\bsoundtrack\b/i,
        /\bv\d+\.\d+.*\bsoundtrack\b/i,
        /\b(goty|deluxe|ultimate|complete).*\bsoundtrack\b/i,
      ];
      
      // If it has scene group or platform with soundtrack, likely a bundle
      if ((hasSceneGroup || hasGamePlatform) && bundleIndicators.some(p => p.test(lower))) {
        return false; // Allow bundle
      }
      
      // If title looks like "Game Name Soundtrack" without bundle indicators, it's likely just the soundtrack
      // But if it has version numbers and platforms, it might be a game
      if (/\bv\d+\.\d+/i.test(lower) && (hasSceneGroup || hasGamePlatform)) {
        return false; // Allow - likely game with soundtrack
      }
      
      return true; // Filter as standalone soundtrack
    }

    return false;
  }

  /**
   * Reject single-word matches that include disallowed extra words
   */
  private hasDisallowedExtraWords(title: string, gameName: string): boolean {
    const cleanGame = this.normalizeGameName(gameName);
    const gameWords = cleanGame.split(/\s+/).filter(Boolean);
    if (gameWords.length !== 1) return false;

    const gameWord = gameWords[0];
    const cleanTitle = this.normalizeGameName(title);
    const titleWords = cleanTitle.split(/\s+/).filter(Boolean);

    if (!titleWords.includes(gameWord)) return false;

    const allowedWords = new Set([
      'pc', 'windows', 'win', 'linux', 'mac', 'macos',
      'steam', 'gog', 'epic',
      'x64', 'x86', '64bit', '32bit',
      'multi', 'multilang', 'multilanguage', 'english', 'eng', 'en',
      'russian', 'rus', 'ru', 'french', 'fr', 'german', 'de', 'spanish', 'es',
      'italian', 'it', 'portuguese', 'pt', 'polish', 'pl', 'japanese', 'jpn',
      'korean', 'kor', 'chinese', 'chs', 'cht',
      'setup', 'installer', 'portable', 'exe', 'msi', 'dmg', 'pkg', 'sh',
      'edition', 'deluxe', 'ultimate', 'definitive', 'remastered', 'enhanced',
      'standard', 'gold', 'platinum', 'goty', 'scholarship',
      'repack', 'fitgirl', 'dodi',
      'build', 'v', 'version'
    ]);

    const extraWords = titleWords.filter((word) => word !== gameWord);
    for (const word of extraWords) {
      if (allowedWords.has(word)) continue;
      if (/^v?\d+(?:\.\d+)*$/i.test(word)) continue;
      if (/^\d{4}$/.test(word)) continue;
      if (/^build\d+$/i.test(word)) continue;
      return true;
    }

    return false;
  }


  /**
   * Check if a release title matches a known sequel (false positive)
   */
  private isSequel(title: string, gameName: string): boolean {
    const lower = title.toLowerCase();
    const lowerGameName = gameName.toLowerCase();
    
    // Check direct sequel matches
    const sequels = this.knownSequels[gameName] || [];
    for (const sequel of sequels) {
      const lowerSequel = sequel.toLowerCase();
      // Skip if the "sequel" is actually the game we're looking for
      if (lowerSequel === lowerGameName || lowerGameName.includes(lowerSequel)) {
        continue;
      }
      if (lower.includes(lowerSequel)) {
        return true;
      }
    }
    
    // Check for partial name matches
    for (const [baseName, sequelList] of Object.entries(this.knownSequels)) {
      if (gameName.toLowerCase().includes(baseName.toLowerCase()) || 
          baseName.toLowerCase().includes(gameName.toLowerCase())) {
        for (const sequel of sequelList) {
          const lowerSequel = sequel.toLowerCase();
          // Skip if the "sequel" is actually the game we're looking for
          if (lowerSequel === lowerGameName || lowerGameName.includes(lowerSequel)) {
            continue;
          }
          if (lower.includes(lowerSequel)) {
            return true;
          }
        }
      }
    }
    
    // Check for subtitle pattern that indicates a different game
    // e.g., "Hollow Knight" matching "Hollow Knight: Silksong"
    const baseNameNoSuffix = gameName.split(':')[0].trim();
    const subtitlePattern = new RegExp(`\\b${this.escapeRegex(baseNameNoSuffix)}\\s*:\\s*`, 'i');
    if (subtitlePattern.test(title) && !title.toLowerCase().includes(gameName.toLowerCase())) {
      // Title has "Base Name: Something" but not the full game name
      // This could be a sequel/spinoff
      const afterColon = title.split(':')[1]?.trim().toLowerCase() || '';
      // If the part after colon isn't in the original game name, it's likely a sequel
      if (afterColon && !gameName.toLowerCase().includes(afterColon)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Check if uploader is in the trusted whitelist
   */
  private isTrustedUploader(uploader?: string): boolean {
    if (!uploader) {
      // If no uploader info, allow it (some indexers don't provide uploader)
      return true;
    }

    const uploaderLower = uploader.toLowerCase().trim();

    // Check if uploader matches any trusted uploader (case-insensitive)
    return this.trustedUploaders.some(trusted =>
      uploaderLower === trusted.toLowerCase() ||
      uploaderLower.includes(trusted.toLowerCase())
    );
  }

  async getDownloadLinks(resultUrl: string): Promise<Partial<GameDownloadCandidate>[]> {
    // Prowlarr already returns direct links, so this isn't needed
    return [];
  }

  private formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  protected detectReleaseType(title: string): 'repack' | 'rip' | 'scene' | 'unknown' {
    const lower = title.toLowerCase();
    if (lower.includes('repack') || lower.includes('fitgirl') || lower.includes('dodi') || lower.includes('kaos')) {
      return 'repack';
    }
    if (lower.includes('rip') || lower.includes('steamrip') || lower.includes('gog')) {
      return 'rip';
    }

    const scenePattern = new RegExp(`\\b(${this.sceneGroups.join('|')})\\b`, 'i');
    if (scenePattern.test(title)) {
      return 'scene';
    }

    return super.detectReleaseType(title);
  }

  private logResultBreakdown(results: ProwlarrSearchResult[]): void {
    const indexerCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();

    for (const result of results) {
      if (result.indexer) {
        indexerCounts.set(result.indexer, (indexerCounts.get(result.indexer) || 0) + 1);
      }
      if (result.categories && result.categories.length > 0) {
        for (const category of result.categories) {
          const key = `${category.id}:${category.name}`;
          categoryCounts.set(key, (categoryCounts.get(key) || 0) + 1);
        }
      }
    }

    const topIndexers = [...indexerCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => `${name}(${count})`);
    const topCategories = [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => `${name}(${count})`);

    if (topIndexers.length > 0) {
      logger.info(`[ProwlarrGame] Indexer breakdown: ${topIndexers.join(', ')}`);
    }
    if (topCategories.length > 0) {
      logger.info(`[ProwlarrGame] Category breakdown: ${topCategories.join(', ')}`);
    }
  }
}
