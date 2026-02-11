import axios from 'axios';
import { GamesService } from './GamesService';
import { GameDownloadCandidate } from '@dasharr/shared-types';
import { logger } from '../../utils/logger';
import { ProwlarrConfig } from './search-agents/ProwlarrGameAgent';
import { XMLParser } from 'fast-xml-parser';
import { SequelDetector, createSequelDetector } from '../../utils/SequelDetector';
import { IGDBClient } from '../../clients/IGDBClient';

interface ProwlarrIndexer {
  id: number;
  name: string;
  protocol: 'torrent' | 'usenet';
  supportsRss: boolean;
  enable: boolean;
}

interface RssRelease {
  guid: string;
  title: string;
  size: number;
  publishDate: string;
  downloadUrl?: string;
  magnetUrl?: string;
  infoUrl?: string;
  indexer: string;
  seeders?: number;
  leechers?: number;
  category?: string;
}

/**
 * Prowlarr RSS Feed Monitor
 *
 * Monitors Prowlarr indexers' RSS feeds for new game releases.
 * Uses the Torznab RSS endpoint: /{indexerId}/api?apikey={key}&extended=1&t=search
 */
export class ProwlarrRssMonitor {
  private readonly config: ProwlarrConfig;
  private readonly gamesService: GamesService;
  private intervalId?: NodeJS.Timeout;
  private isRunning = false;
  private readonly CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  private readonly REQUEST_DELAY_MS = 5000; // 5 seconds between requests (avoid rate limits)
  private processedGuids: Set<string> = new Set();
  private maxProcessedGuids = 2000;

  // Game categories in Torznab/Newznab format
  // 1000 = Console, 4000 = PC, 4050 = PC Games
  private readonly GAME_CATEGORIES = [1000, 4000, 4050];

  // Known game titles that may be misclassified by indexers
  // These are whitelisted even if in non-game categories (Audio, etc.)
  private readonly KNOWN_GAMES = [
    'stardew valley', 'hades', 'celeste', 'hollow knight', 'factorio',
    'baldur\'s gate 3', 'cyberpunk 2077', 'the witcher 3', 'witcher 3',
    'red dead redemption', 'elden ring', 'helldivers 2', 'starfield',
    'lethal company', 'palworld', 'hollow knight silksong'
  ];

  private xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
  });

  private sequelDetector?: SequelDetector;

  constructor(config: ProwlarrConfig, gamesService: GamesService, igdbClient?: IGDBClient) {
    this.config = config;
    this.gamesService = gamesService;
    
    // Initialize sequel detector if IGDB client is available
    if (igdbClient) {
      this.sequelDetector = createSequelDetector(igdbClient);
    }
  }

  /**
   * Set the sequel detector (for dependency injection)
   */
  setSequelDetector(detector: SequelDetector): void {
    this.sequelDetector = detector;
  }

  /**
   * Start monitoring RSS feeds
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('[ProwlarrRssMonitor] Already running');
      return;
    }

    this.isRunning = true;
    logger.info('[ProwlarrRssMonitor] Starting RSS feed monitor');

    // Run immediately
    this.checkFeeds();

    // Then schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkFeeds();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    logger.info('[ProwlarrRssMonitor] Stopped RSS feed monitor');
  }

  /**
   * Check RSS feeds from all enabled indexers
   */
  private async checkFeeds(): Promise<void> {
    try {
      logger.info('[ProwlarrRssMonitor] Checking RSS feeds...');

      // Get enabled torrent indexers that support RSS
      const indexers = await this.getEnabledRssIndexers();
      if (indexers.length === 0) {
        logger.warn('[ProwlarrRssMonitor] No enabled indexers with RSS support');
        return;
      }

      logger.info(`[ProwlarrRssMonitor] Checking ${indexers.length} indexers for new releases`);

      // Get monitored games
      const monitoredGames = this.gamesService.getMonitoredGames();
      if (monitoredGames.length === 0) {
        logger.debug('[ProwlarrRssMonitor] No monitored games to check');
        return;
      }

      // Check each indexer
      let totalNewReleases = 0;
      let successCount = 0;
      
      for (const indexer of indexers) {
        try {
          const releases = await this.fetchIndexerRss(indexer);
          
          if (releases.length > 0) {
            const newReleases = this.filterNewReleases(releases);
            
            if (newReleases.length > 0) {
              logger.info(`[ProwlarrRssMonitor] ${indexer.name}: ${newReleases.length} new releases (${releases.length} total)`);
              totalNewReleases += newReleases.length;
              await this.processReleases(newReleases, monitoredGames);
            } else {
              logger.debug(`[ProwlarrRssMonitor] ${indexer.name}: ${releases.length} releases, all previously seen`);
            }
            successCount++;
          } else {
            logger.debug(`[ProwlarrRssMonitor] ${indexer.name}: No releases`);
          }

          // Rate limit between indexers
          await this.sleep(this.REQUEST_DELAY_MS);
        } catch (error) {
          // Log at debug level to avoid spamming logs with indexer errors
          logger.debug(`[ProwlarrRssMonitor] Error checking indexer ${indexer.name}:`, error);
        }
      }

      logger.info(`[ProwlarrRssMonitor] Check complete. ${successCount}/${indexers.length} indexers responded, ${totalNewReleases} new releases`);
    } catch (error) {
      logger.error('[ProwlarrRssMonitor] Error checking RSS feeds:', error);
    }
  }

  /**
   * Get enabled torrent indexers that support RSS
   */
  private async getEnabledRssIndexers(): Promise<ProwlarrIndexer[]> {
    try {
      const response = await axios.get<ProwlarrIndexer[]>(`${this.config.baseUrl}/api/v1/indexer`, {
        headers: {
          'X-Api-Key': this.config.apiKey,
          'Accept': 'application/json',
        },
        timeout: 30000,
      });

      return response.data.filter(
        (indexer) => indexer.enable && indexer.supportsRss && indexer.protocol === 'torrent'
      );
    } catch (error) {
      logger.error('[ProwlarrRssMonitor] Failed to get indexers:', error);
      return [];
    }
  }

  /**
   * Fetch RSS feed from an indexer using Torznab endpoint
   * Format: {prowlarrUrl}/{indexerId}/api?apikey={key}&extended=1&t=search&cat=1000,4000
   */
  private async fetchIndexerRss(indexer: ProwlarrIndexer): Promise<RssRelease[]> {
    // Build RSS URL
    const rssUrl = `${this.config.baseUrl}/${indexer.id}/api`;
    
    const params = new URLSearchParams({
      apikey: this.config.apiKey,
      t: 'search',
      extended: '1',
      limit: '100',
    });

    // Note: Category filtering in RSS request often returns empty results
    // We fetch all and filter by category in code instead

    const fullUrl = `${rssUrl}?${params.toString()}`;
    logger.debug(`[ProwlarrRssMonitor] Fetching RSS from ${indexer.name}: ${fullUrl.replace(this.config.apiKey, '***')}`);

    try {
      const response = await axios.get(fullUrl, {
        timeout: 30000,
        headers: {
          'Accept': 'application/xml, text/xml, application/rss+xml',
        },
        responseType: 'text',
      });

      // Parse XML response
      const parsed = this.xmlParser.parse(response.data);
      const releases = this.parseRssItems(parsed, indexer.name);
      
      // Filter by category - skip releases with invalid categories
      // Pass title for known game whitelist check
      return releases.filter(r => this.isValidGameCategory(r.category, r.title));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          logger.debug(`[ProwlarrRssMonitor] Rate limited by ${indexer.name}`);
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          logger.debug(`[ProwlarrRssMonitor] Timeout fetching RSS from ${indexer.name}`);
        } else {
          logger.debug(`[ProwlarrRssMonitor] HTTP ${error.response?.status} from ${indexer.name}`);
        }
      }
      throw error;
    }
  }

  /**
   * Check if category is valid for games
   * Reject TV (5000), Books (7000), Movies (2000), and Audio (3000) categories
   * But allow known games through even if misclassified
   */
  private isValidGameCategory(
    categories?: Array<{id?: number; name?: string}> | string,
    title?: string
  ): boolean {
    // Check if this is a known game that might be misclassified
    const isKnownGame = title ? this.isKnownGame(title) : false;
    
    // Handle string input (from RSS parsing)
    if (typeof categories === 'string') {
      const catNum = parseInt(categories, 10);
      if (!isNaN(catNum)) {
        // Allow known games even in Audio/Book categories
        if (isKnownGame && (catNum >= 3000 && catNum < 4000)) {
          return true;
        }
        return this.isValidCategoryId(catNum);
      }
      return true; // Let unknown through for title filtering
    }
    
    // Handle array input (from Prowlarr API)
    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return true; // No category info, let through for title filtering
    }
    
    for (const cat of categories) {
      const catId = typeof cat === 'number' ? cat : cat.id;
      const catName = cat.name?.toLowerCase() || '';
      
      if (typeof catId === 'number') {
        // Allow known games even in Audio/Book categories
        if (isKnownGame && (catId >= 3000 && catId < 4000)) {
          continue;
        }
        if (!this.isValidCategoryId(catId)) return false;
      }
      
      // Also check category name for audiobook
      if (catName.includes('audiobook') && !isKnownGame) return false;
    }
    
    return true;
  }

  /**
   * Check if a category ID is valid for games
   */
  private isValidCategoryId(catId: number): boolean {
    // Reject category 0 (unknown/other)
    if (catId === 0) return false;
    
    // Reject Movies (2000-2999)
    if (catId >= 2000 && catId < 3000) return false;
    
    // Reject Audio (3000-3999) - includes audiobooks
    if (catId >= 3000 && catId < 4000) return false;
    
    // Reject TV categories (5000-5999)
    if (catId >= 5000 && catId < 6000) return false;
    
    // Reject Books categories (7000-7999)
    if (catId >= 7000 && catId < 8000) return false;
    
    return true;
  }

  /**
   * Check if title matches a known game (for category override)
   */
  private isKnownGame(title: string): boolean {
    const cleanTitle = this.cleanTitle(title);
    return this.KNOWN_GAMES.some(game => {
      const cleanGame = this.cleanTitle(game);
      // Check if all words of the game name are in the title
      const gameWords = cleanGame.split(' ').filter(w => w.length > 1);
      if (gameWords.length === 0) return false;
      
      return gameWords.every(word => cleanTitle.includes(word));
    });
  }

  /**
   * Parse RSS items from parsed XML
   */
  private parseRssItems(parsed: any, indexerName: string): RssRelease[] {
    const items = parsed?.rss?.channel?.item;
    if (!items) return [];

    const itemArray = Array.isArray(items) ? items : [items];
    
    return itemArray.map((item: any): RssRelease | null => {
      if (!item.title) return null;

      // Parse enclosure for download info
      const enclosure = item.enclosure;
      const attributes = item['torznab:attr'] || [];
      const attrArray = Array.isArray(attributes) ? attributes : attributes ? [attributes] : [];
      
      // Extract attributes
      let magnetUrl: string | undefined;
      let downloadUrl: string | undefined;
      let seeders: number | undefined;
      let leechers: number | undefined;
      let size: number = 0;
      
      for (const attr of attrArray) {
        const name = attr['@_name'];
        const value = attr['@_value'];
        
        if (!name || !value) continue;
        
        switch (name.toLowerCase()) {
          case 'magneturl':
            magnetUrl = value;
            break;
          case 'downloadurl':
            downloadUrl = value;
            break;
          case 'seeders':
            seeders = parseInt(value, 10) || undefined;
            break;
          case 'leechers':
          case 'peers':
            leechers = parseInt(value, 10) || undefined;
            break;
          case 'size':
            size = parseInt(value, 10) || 0;
            break;
        }
      }

      // Fallback to enclosure
      if (!downloadUrl && !magnetUrl && enclosure?.['@_url']) {
        const url = enclosure['@_url'];
        if (url.startsWith('magnet:')) {
          magnetUrl = url;
        } else {
          downloadUrl = url;
        }
      }

      if (size === 0 && enclosure?.['@_length']) {
        size = parseInt(enclosure['@_length'], 10) || 0;
      }

      // Extract category from attributes or item
      let category: string | undefined;
      for (const attr of attrArray) {
        if (attr['@_name'] === 'category' || attr['@_name'] === 'categoryid') {
          category = attr['@_value'];
          break;
        }
      }

      return {
        guid: item.guid || item.link || `${item.title}-${item.pubDate}`,
        title: item.title,
        size,
        publishDate: item.pubDate || new Date().toISOString(),
        downloadUrl,
        magnetUrl,
        infoUrl: item.link,
        indexer: indexerName,
        seeders,
        leechers,
        category,
      };
    }).filter((item: RssRelease | null): item is RssRelease => item !== null);
  }

  /**
   * Filter out already processed releases
   */
  private filterNewReleases(releases: RssRelease[]): RssRelease[] {
    const newReleases = releases.filter((release) => !this.processedGuids.has(release.guid));

    // Add new GUIDs to processed set
    newReleases.forEach((release) => this.processedGuids.add(release.guid));

    // Limit set size to prevent memory issues
    if (this.processedGuids.size > this.maxProcessedGuids) {
      const toRemove = this.processedGuids.size - this.maxProcessedGuids;
      const iterator = this.processedGuids.values();
      for (let i = 0; i < toRemove; i++) {
        const value = iterator.next().value;
        if (value) this.processedGuids.delete(value);
      }
    }

    return newReleases;
  }

  /**
   * Process new releases against monitored games
   */
  private async processReleases(
    releases: RssRelease[],
    monitoredGames: any[]
  ): Promise<void> {
    // Pre-fetch sequel patterns for all monitored games if sequel detector is available
    const sequelPatternsMap = new Map<number, any>();
    
    if (this.sequelDetector) {
      for (const game of monitoredGames) {
        try {
          const patterns = await this.sequelDetector.getSequelPatterns(game.igdbId, game.name);
          sequelPatternsMap.set(game.igdbId, patterns);
        } catch (error) {
          logger.debug(`[ProwlarrRssMonitor] Failed to get sequel patterns for ${game.name}:`, error);
        }
      }
    }

    for (const release of releases) {
      // Skip by category first (pass title for known game whitelist)
      if (!this.isValidGameCategory(release.category, release.title)) {
        continue;
      }

      // Skip non-game releases by title
      if (!this.isGameRelease(release.title)) {
        continue;
      }

      // Check against each monitored game
      for (const game of monitoredGames) {
        // Skip if already downloaded/downloading/installed
        if (
          game.status === 'downloaded' ||
          game.status === 'downloading' ||
          game.status === 'installed'
        ) {
          continue;
        }

        // Check if release matches game
        const matchResult = this.checkMatch(release.title, game.name);
        if (matchResult.isMatch) {
          // Check if this is actually a sequel (false positive)
          const sequelPatterns = sequelPatternsMap.get(game.igdbId);
          if (sequelPatterns && this.sequelDetector?.isSequel(release.title, sequelPatterns)) {
            logger.debug(
              `[ProwlarrRssMonitor] Rejected sequel match: "${release.title}" for "${game.name}"`
            );
            continue;
          }

          logger.info(
            `[ProwlarrRssMonitor] ✓ Match found! "${release.title}" matches "${game.name}" (score: ${matchResult.score})`
          );

          // Create candidate and start download
          const candidate = this.createCandidate(release);
          if (candidate.magnetUrl || candidate.torrentUrl) {
            try {
              await this.gamesService.startDownload(game.igdbId, candidate, 'qbittorrent');
              logger.info(`[ProwlarrRssMonitor] Started download for "${game.name}" from ${release.indexer}`);
            } catch (error) {
              logger.error(`[ProwlarrRssMonitor] Failed to start download for "${game.name}":`, error);
            }
          }
        }
      }
    }
  }

  /**
   * Check if a release title matches a game name
   * Uses strict matching to avoid false positives with TV shows/movies
   */
  private checkMatch(title: string, gameName: string): { isMatch: boolean; score: number } {
    const cleanTitle = this.cleanTitle(title);
    const cleanGameName = this.cleanTitle(gameName);

    // First, reject obvious non-game content
    if (this.isTvShowOrMovie(title)) {
      return { isMatch: false, score: 0 };
    }

    // Direct inclusion check (title contains full game name)
    if (cleanTitle.includes(cleanGameName)) {
      return { isMatch: true, score: 100 };
    }

    // Word-based matching with stricter requirements
    const titleWords = cleanTitle.split(/\s+/).filter(w => w.length > 1);
    const gameWords = cleanGameName.split(/\s+/).filter(w => w.length > 1);

    if (gameWords.length === 0) {
      return { isMatch: false, score: 0 };
    }

    // Require ALL game words to be present in title (exact or partial match)
    const allWordsMatch = gameWords.every((gameWord) =>
      titleWords.some((titleWord) => 
        titleWord === gameWord || 
        titleWord.startsWith(gameWord) || 
        gameWord.startsWith(titleWord)
      )
    );

    if (!allWordsMatch) {
      return { isMatch: false, score: 0 };
    }

    // Calculate score based on word coverage
    const matchedWords = gameWords.filter((gameWord) =>
      titleWords.some((titleWord) => 
        titleWord === gameWord || 
        titleWord.startsWith(gameWord) || 
        gameWord.startsWith(titleWord)
      )
    );

    const score = Math.round((matchedWords.length / gameWords.length) * 100);
    return { isMatch: score >= 90, score };
  }

  /**
   * Check if title is likely a TV show or movie (not a game)
   * Based on analysis of false positives from RSS feeds
   */
  private isTvShowOrMovie(title: string): boolean {
    const lower = title.toLowerCase();
    
    // TV show patterns
    const tvPatterns = [
      /\bs\d{2}e\d{2}\b/i,                // S01E01 format
      /\bseason\s+\d+\b/i,                // Season 1
      /\bepisode\s+\d+\b/i,               // Episode 1
      /\bhdtv\b/i,                        // HDTV
      /\bweb[-\s]?dl\b/i,                 // WEB-DL
      /\bamzn\b/i,                        // Amazon
      /\bhmax\b/i,                        // HBO Max
      /\bnetflix\b/i,                     // Netflix
      /\bdiscord\b/i,                     // Discord (not a game release)
      /\bcomplete\s+series\b/i,           // Complete series
      /\bseason\s+complete\b/i,           // Season complete
      /\[20\d{2}\].*s\d{2}/i,             // [2019] S02 format
      /\(20\d{2}\).*season/i,             // (2020) Season
      /\[20\d{2}\].*complete/i,           // [2020] Complete
      /20\d{2}[\.\s]+s\d{2}/i,            // 2019.S04 or 2019 S04
      /\(\d{4}\).*s\d{2}e\d{2}/i,         // (2019) S04E01
    ];

    if (tvPatterns.some(p => p.test(lower))) {
      return true;
    }

    // Book patterns - general content type indicators
    const bookPatterns = [
      /\bgraphic\s+novel\b/i,             // Graphic novel
      /\btrade\s+paperback\b/i,           // Trade paperback
    ];

    if (bookPatterns.some(p => p.test(lower))) {
      return true;
    }

    // Adult content patterns
    const adultPatterns = [
      /\bporn\b/i,
      /\bxxx\b/i,
      /\badult\b/i,
      /\bvrconk\b/i,
      /\bonlyfans\b/i,
      /\bmanyvids\b/i,
      /\bparody.*porn/i,
    ];

    if (adultPatterns.some(p => p.test(lower))) {
      return true;
    }

    // Video format indicators (common in movies/TV)
    const videoFormats = [
      /\b2160p\b/i,
      /\b1080p\b/i,
      /\b720p\b/i,
      /\bx265\b/i,
      /\bh264\b/i,
      /\bh\.265\b/i,
      /\bh\.264\b/i,
      /\bhevc\b/i,
      /\bdolby\s+vision\b/i,
      /\bdv\s+hdr\b/i,
      /\bhdr10\b/i,
    ];

    // If it has video format indicators AND TV-related terms, it's likely a TV show
    const hasVideoFormat = videoFormats.some(p => p.test(lower));
    const hasTvTerms = /\b(ita|eng)\s+(ita|eng)\b/i.test(lower) || 
                       /\bsub\b/i.test(lower) ||
                       /\bmulti\s*\d*\s*subs?\b/i.test(lower) ||
                       /\beac3\b/i.test(lower) ||
                       /\bdts\b/i.test(lower) ||
                       /\bdisc\s*\d+/i.test(lower);
    
    if (hasVideoFormat && hasTvTerms) {
      return true;
    }

    return false;
  }

  /**
   * Clean title for matching
   * Handles underscores, dots, and other separators as word boundaries
   */
  private cleanTitle(title: string): string {
    return title
      .toLowerCase()
      // Replace underscores, dots, and dashes with spaces for word separation
      .replace(/[_\.]/g, ' ')
      // Remove other non-word chars except spaces
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      // Remove common release tags but preserve update indicators for matching
      .replace(/\b(repack|rip|v\d+\.?\d*|build|version|goty|edition|multi\d+|crackonly|fixonly)\b/g, ' ')
      .replace(/\b(20\d{2}|19\d{2})\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if release is game-related
   * 
   * Refined logic to reduce false negatives:
   * - Allow game updates with version numbers and scene group names
   * - Allow soundtrack bundles (game + soundtrack)
   * - Filter only standalone updates/soundtracks
   */
  private isGameRelease(title: string): boolean {
    const lower = title.toLowerCase();

    // Scene and repack group names - strong indicators this is a game release
    const sceneGroups = /\b(codex|cpy|skidrow|plaza|hoodlum|razor1911|flt|tenoke|dodi|fitgirl|dinobytes|elamigos|simplex|gog|venom|suxxors)\b/i;
    const hasSceneGroup = sceneGroups.test(lower);

    // Known game platforms/versions
    const gamePlatforms = /\b(nsw|switch|ps4|ps5|xbox|pc|windows|win|gog|steam)\b/i;
    const hasGamePlatform = gamePlatforms.test(lower);

    // Skip patterns - things that are definitely NOT full game releases
    const definiteSkipPatterns = [
      /\bupdate\s+only\b/i,              // "Update Only" - explicitly just an update
      /\bpatch\s*only\b/i,               // "Patch Only"
      /\btrainer\b/i,                    // Trainers/cheats
      /\bcrack\s*only\b/i,               // Just a crack
      /\bfix\s*only\b/i,                 // Just a fix
      /\bdlc\s*only\b/i,                 // DLC only
      /\bread\s+by\b/i,                  // "Read by narrator" - audiobook
      /\b(m4b|epub|mobi|pdf|cbr|cbz)\b/i, // Book formats
      /\bsoundtrack\s+only\b/i,          // Soundtrack only
      /\bost\s+only\b/i,                 // OST only
      /\bofficial\s+soundtrack\s+only\b/i,
    ];

    if (definiteSkipPatterns.some((p) => p.test(lower))) {
      return false;
    }

    // Allow updates that appear to be legitimate game updates
    // Pattern: "Game Name Update vX.X.X-GROUP" or "Game Name Update vX.X.X"
    const legitimateUpdatePattern = /\bupdate\s+v?\d+\.\d+/i;
    if (legitimateUpdatePattern.test(lower)) {
      // If it has a scene group or game platform, it's likely a real game update
      if (hasSceneGroup || hasGamePlatform) {
        return true;
      }
      // If title contains "FitGirl" or "Repack", it's likely a repack with updates
      if (/\b(fitgirl|repack)\b/i.test(lower)) {
        return true;
      }
    }

    // Allow soundtrack if it appears to be a bundle (game + soundtrack)
    // Look for indicators that this is a game bundle, not just a soundtrack
    const soundtrackBundleIndicators = [
      /\+.*\bsoundtrack\b/i,             // "Game + Soundtrack"
      /\b(incl|including|with).*\bsoundtrack\b/i, // "Including Soundtrack"
      /\bsoundtrack\b.*\bdlc\b/i,        // "Soundtrack DLC"
      /\bv\d+\.\d+.*\bsoundtrack\b/i,    // Version number + soundtrack
      /\b(goty|deluxe|ultimate|complete).*\bsoundtrack\b/i, // Edition with soundtrack
    ];
    
    if (/\bsoundtrack\b/i.test(lower) || /\bost\b/i.test(lower)) {
      // Check if it's a bundle
      if (soundtrackBundleIndicators.some(p => p.test(lower))) {
        return true;
      }
      // If it has scene group or platform, might be a game bundle
      if ((hasSceneGroup || hasGamePlatform) && !/\bsoundtrack\s+edition\b/i.test(lower)) {
        return true;
      }
      // If it's a known game with soundtrack in title, allow it
      if (this.isKnownGame(title)) {
        return true;
      }
      // Otherwise filter as standalone soundtrack
      return false;
    }

    return true;
  }

  /**
   * Create download candidate from RSS release
   */
  private createCandidate(release: RssRelease): GameDownloadCandidate {
    const releaseType = this.detectReleaseType(release.title);

    return {
      title: release.title,
      source: `Prowlarr (${release.indexer})`,
      releaseType,
      size: this.formatBytes(release.size),
      sizeBytes: release.size,
      seeders: release.seeders,
      leechers: release.leechers,
      magnetUrl: release.magnetUrl,
      torrentUrl: release.downloadUrl,
      infoUrl: release.infoUrl,
    };
  }

  /**
   * Detect release type from title
   */
  private detectReleaseType(title: string): 'repack' | 'rip' | 'scene' | 'p2p' {
    const lower = title.toLowerCase();

    if (lower.includes('repack') || lower.includes('fitgirl') || lower.includes('dodi')) {
      return 'repack';
    }
    if (lower.includes('rip') || lower.includes('gog')) {
      return 'rip';
    }

    const sceneGroups = ['codex', 'cpy', 'skidrow', 'plaza', 'hoodlum', 'razor1911', 'flt', 'tenoke'];
    if (sceneGroups.some((g) => lower.includes(g))) {
      return 'scene';
    }

    return 'p2p';
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Test RSS parsing - returns detailed information
   */
  async testRssParsing(): Promise<{
    indexersChecked: number;
    totalReleases: number;
    gameReleases: number;
    monitoredGamesCount: number;
    matches: Array<{
      title: string;
      indexer: string;
      gameName: string;
      score: number;
      publishDate: string;
    }>;
    error?: string;
  }> {
    try {
      logger.info('[ProwlarrRssMonitor] Testing RSS parsing');

      const indexers = await this.getEnabledRssIndexers();
      const monitoredGames = this.gamesService.getMonitoredGames();

      let totalReleases = 0;
      let gameReleases = 0;
      let indexersChecked = 0;
      const matches: Array<{
        title: string;
        indexer: string;
        gameName: string;
        score: number;
        publishDate: string;
      }> = [];

      // Check first 5 indexers for testing
      for (const indexer of indexers.slice(0, 5)) {
        try {
          const releases = await this.fetchIndexerRss(indexer);
          indexersChecked++;
          totalReleases += releases.length;

          for (const release of releases) {
            if (this.isGameRelease(release.title)) {
              gameReleases++;

              // Check against monitored games (or test games if none monitored)
              const gamesToCheck = monitoredGames.length > 0 
                ? monitoredGames 
                : [{ name: "Baldur's Gate 3" }, { name: "Cyberpunk 2077" }, { name: "The Witcher 3" }];

              for (const game of gamesToCheck) {
                const matchResult = this.checkMatch(release.title, game.name);
                if (matchResult.isMatch) {
                  matches.push({
                    title: release.title,
                    indexer: release.indexer,
                    gameName: game.name,
                    score: matchResult.score,
                    publishDate: release.publishDate,
                  });
                }
              }
            }
          }
        } catch (error) {
          logger.debug(`[ProwlarrRssMonitor] Test failed for indexer ${indexer.name}:`, error);
        }
      }

      return {
        indexersChecked,
        totalReleases,
        gameReleases,
        monitoredGamesCount: monitoredGames.length,
        matches: matches.slice(0, 10),
      };
    } catch (error) {
      logger.error('[ProwlarrRssMonitor] RSS test failed:', error);
      return {
        indexersChecked: 0,
        totalReleases: 0,
        gameReleases: 0,
        monitoredGamesCount: 0,
        matches: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
