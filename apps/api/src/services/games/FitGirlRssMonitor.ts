import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { logger } from '../../utils/logger';
import { GamesService } from './GamesService';
import { BaseGameSearchAgent } from './search-agents/BaseGameSearchAgent';

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  guid: string;
}

interface FitGirlRssEntry {
  title: string;
  link: string;
  pubDate: Date;
  description: string;
  guid: string;
}

/**
 * FitGirl RSS Feed Monitor
 * 
 * Monitors the FitGirl RSS feed for new repacks and checks them against
 * monitored games. Automatically triggers downloads for matching games.
 */
export class FitGirlRssMonitor {
  private readonly rssUrl = 'https://fitgirl-repacks.site/feed/';
  private readonly checkIntervalMs = 30 * 60 * 1000; // 30 minutes
  private intervalId?: NodeJS.Timeout;
  private gamesService: GamesService;
  private lastCheckedGuid?: string;
  private isRunning = false;

  constructor(gamesService: GamesService) {
    this.gamesService = gamesService;
  }

  /**
   * Start monitoring the RSS feed
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('[FitGirlRssMonitor] Already running');
      return;
    }

    this.isRunning = true;
    logger.info('[FitGirlRssMonitor] Starting RSS feed monitor');

    // Initial check
    this.checkFeed();

    // Schedule regular checks
    this.intervalId = setInterval(() => {
      this.checkFeed();
    }, this.checkIntervalMs);
  }

  /**
   * Stop monitoring the RSS feed
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    logger.info('[FitGirlRssMonitor] Stopped RSS feed monitor');
  }

  /**
   * Check the RSS feed for new entries
   */
  async checkFeed(): Promise<void> {
    try {
      logger.info('[FitGirlRssMonitor] Checking RSS feed...');

      const response = await axios.get(this.rssUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
      });

      const entries = this.parseRssFeed(response.data);
      
      if (entries.length === 0) {
        logger.info('[FitGirlRssMonitor] No entries found in RSS feed');
        return;
      }

      logger.info(`[FitGirlRssMonitor] Found ${entries.length} entries in RSS feed`);

      // Process new entries (those published since last check)
      const newEntries = this.getNewEntries(entries);
      
      if (newEntries.length === 0) {
        logger.info('[FitGirlRssMonitor] No new entries since last check');
        return;
      }

      logger.info(`[FitGirlRssMonitor] Processing ${newEntries.length} new entries`);

      // Check against monitored games
      await this.processNewEntries(newEntries);

      // Update last checked GUID
      this.lastCheckedGuid = entries[0]?.guid;

    } catch (error) {
      logger.error('[FitGirlRssMonitor] Error checking RSS feed:', error);
    }
  }

  /**
   * Parse RSS feed XML into entries
   */
  private parseRssFeed(xmlData: string): FitGirlRssEntry[] {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: false,
      parseTagValue: false,
      trimValues: true,
    });

    const parsed = parser.parse(xmlData);
    const items: RssItem[] = parsed.rss?.channel?.item || [];

    return items.map((item: RssItem) => ({
      title: item.title || '',
      link: item.link || '',
      pubDate: new Date(item.pubDate || Date.now()),
      description: item.content || '',
      guid: item.guid || item.link || '',
    })).filter((entry: FitGirlRssEntry) => entry.title && entry.link);
  }

  /**
   * Get entries that are newer than the last check
   */
  private getNewEntries(entries: FitGirlRssEntry[]): FitGirlRssEntry[] {
    if (!this.lastCheckedGuid) {
      // First run - return all entries from last 24 hours
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return entries.filter(e => e.pubDate > cutoff);
    }

    // Find the index of the last checked entry
    const lastIndex = entries.findIndex(e => e.guid === this.lastCheckedGuid);
    
    if (lastIndex === -1) {
      // Last checked entry not found, return all recent entries
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return entries.filter(e => e.pubDate > cutoff);
    }

    // Return entries before the last checked one (newer entries)
    return entries.slice(0, lastIndex);
  }

  /**
   * Process new RSS entries against monitored games
   */
  private async processNewEntries(entries: FitGirlRssEntry[]): Promise<void> {
    // Get all monitored games
    const monitoredGames = await this.gamesService.getMonitoredGames();
    
    if (monitoredGames.length === 0) {
      logger.info('[FitGirlRssMonitor] No monitored games to check');
      return;
    }

    logger.info(`[FitGirlRssMonitor] Checking ${entries.length} entries against ${monitoredGames.length} monitored games`);

    for (const entry of entries) {
      // Skip non-game entries
      if (!this.isGameEntry(entry.title)) {
        logger.debug(`[FitGirlRssMonitor] Skipping non-game entry: "${entry.title}"`);
        continue;
      }

      logger.info(`[FitGirlRssMonitor] Checking entry: "${entry.title}"`);

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

        // Use the matching algorithm to check if this entry matches the game
        const matchResult = await this.checkMatch(entry, game);
        
        if (matchResult.isMatch && matchResult.score >= 70) {
          logger.info(`[FitGirlRssMonitor] ✓ Match found! "${entry.title}" matches "${game.name}" (score: ${matchResult.score})`);
          
          // Create candidate from RSS entry
          const candidate = await this.createCandidateFromEntry(entry);
          
          if (candidate.magnetUrl || candidate.torrentUrl) {
            // Start download
            try {
              await this.gamesService.startDownload(game.igdbId, candidate, 'qbittorrent');
              logger.info(`[FitGirlRssMonitor] Started download for "${game.name}"`);
            } catch (error) {
              logger.error(`[FitGirlRssMonitor] Failed to start download for "${game.name}":`, error);
            }
          }
        }
      }
    }
  }

  /**
   * Check if an RSS entry matches a monitored game
   */
  private async checkMatch(
    entry: FitGirlRssEntry, 
    game: { igdbId: number; name: string; alternativeNames?: string[] }
  ): Promise<{ isMatch: boolean; score: number }> {
    // Get full game details for better matching
    const gameDetails = await this.gamesService.getGameDetails(game.igdbId);
    
    if (!gameDetails) {
      // Fallback to basic matching
      const cleanEntry = this.cleanGameName(entry.title);
      const cleanGame = this.cleanGameName(game.name);
      
      const isMatch = cleanEntry.includes(cleanGame) || cleanGame.includes(cleanEntry);
      return { isMatch, score: isMatch ? 50 : 0 };
    }

    // Use enhanced matching by creating a temporary agent instance
    class TempMatchAgent extends BaseGameSearchAgent {
      name = 'TempMatcher';
      baseUrl = '';
      requiresAuth = false;
      priority = 0;
      releaseTypes = ['repack' as const];
      isAvailable(): boolean { return true; }
      async search(): Promise<any> { return { success: false, candidates: [] }; }
      async getDownloadLinks(): Promise<any[]> { return []; }
    }
    const matchAgent = new TempMatchAgent();
    const matchResult = matchAgent.matchWithIGDB(entry.title, {
      igdbGame: gameDetails,
      minMatchScore: 70,
    });

    return { isMatch: matchResult.matches, score: matchResult.score };
  }

  /**
   * Create a download candidate from an RSS entry
   */
  private async createCandidateFromEntry(entry: FitGirlRssEntry): Promise<{
    title: string;
    source: string;
    releaseType: 'repack' | 'rip' | 'scene' | 'p2p';
    magnetUrl?: string;
    torrentUrl?: string;
    size?: string;
    sizeBytes?: number;
  }> {
    // Extract size from title
    const sizeMatch = entry.title.match(/(\d+\.?\d*)\s*(GB|MB|TB)/i);
    const size = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : undefined;
    
    // Try to fetch the full page to get magnet links
    let magnetUrl: string | undefined;
    
    try {
      const { FitGirlAgent } = await import('./search-agents/FitGirlAgent');
      const agent = new FitGirlAgent();
      const links = await agent.getDownloadLinks(entry.link);
      
      if (links.length > 0 && links[0].magnetUrl) {
        magnetUrl = links[0].magnetUrl;
      }
    } catch (error) {
      logger.warn(`[FitGirlRssMonitor] Failed to get download links for "${entry.title}":`, error);
    }

    return {
      title: entry.title,
      source: 'FitGirl (RSS)',
      releaseType: 'repack',
      magnetUrl,
      size,
    };
  }

  /**
   * Check if an RSS entry is a game release
   */
  private isGameEntry(title: string): boolean {
    const lower = title.toLowerCase();
    
    // Skip update lists and non-game entries
    if (lower.includes('updates list') || 
        lower.includes('updates digest') ||
        lower.includes('changelog') ||
        lower.includes('announcement')) {
      return false;
    }

    // Must contain repack indicator
    return lower.includes('repack') || lower.includes('fitgirl');
  }

  /**
   * Clean game name for comparison
   */
  private cleanGameName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Test RSS parsing - fetches and parses feed, checks against monitored games
   */
  async testRssParsing(): Promise<{
    totalEntries: number;
    gameEntries: number;
    nonGameEntries: string[];
    monitoredGamesCount: number;
    matches: Array<{
      entryTitle: string;
      gameName: string;
      score: number;
      willDownload: boolean;
      reason: string;
    }>;
  }> {
    logger.info('[FitGirlRssMonitor] Testing RSS parsing');

    // Fetch RSS feed
    const response = await axios.get(this.rssUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    // Parse entries
    const entries = this.parseRssFeed(response.data);
    logger.info(`[FitGirlRssMonitor] Parsed ${entries.length} entries from RSS feed`);

    // Categorize entries
    const gameEntries: FitGirlRssEntry[] = [];
    const nonGameEntries: string[] = [];

    for (const entry of entries) {
      if (this.isGameEntry(entry.title)) {
        gameEntries.push(entry);
      } else {
        nonGameEntries.push(entry.title);
      }
    }

    logger.info(`[FitGirlRssMonitor] ${gameEntries.length} game entries, ${nonGameEntries.length} non-game entries`);

    // Get monitored games
    const monitoredGames = await this.gamesService.getMonitoredGames();
    logger.info(`[FitGirlRssMonitor] Checking against ${monitoredGames.length} monitored games`);

    // Check matches
    const matches: Array<{
      entryTitle: string;
      gameName: string;
      score: number;
      willDownload: boolean;
      reason: string;
    }> = [];

    for (const entry of gameEntries.slice(0, 10)) { // Limit to first 10 for performance
      for (const game of monitoredGames) {
        // Check if already downloaded/downloading/installed
        const isAlreadyDownloaded =
          game.status === 'downloaded' ||
          game.status === 'downloading' ||
          game.status === 'installed';

        const matchResult = await this.checkMatch(entry, game);

        if (matchResult.isMatch || matchResult.score > 0) {
          const willDownload = matchResult.score >= 70 && !isAlreadyDownloaded;
          const reason = isAlreadyDownloaded
            ? 'Already downloaded/downloading/installed'
            : matchResult.score >= 70
              ? 'Would trigger download'
              : `Score too low (threshold: 70)`;

          matches.push({
            entryTitle: entry.title,
            gameName: game.name,
            score: matchResult.score,
            willDownload,
            reason,
          });

          logger.info(
            `[FitGirlRssMonitor] Match: "${entry.title}" <-> "${game.name}" (score: ${matchResult.score}, willDownload: ${willDownload})`
          );
        }
      }
    }

    return {
      totalEntries: entries.length,
      gameEntries: gameEntries.length,
      nonGameEntries: nonGameEntries.slice(0, 10), // Limit to first 10
      monitoredGamesCount: monitoredGames.length,
      matches,
    };
  }
}
