import { IGDBClient, IGDBConfig } from '../../clients/IGDBClient';
import { FitGirlAgent } from './search-agents/FitGirlAgent';
import { DODIAgent, DODIConfig } from './search-agents/DODIAgent';
import { SteamRipAgent } from './search-agents/SteamRipAgent';
import { ProwlarrGameAgent, ProwlarrConfig } from './search-agents/ProwlarrGameAgent';
import { HydraLibraryAgent } from './search-agents/HydraLibraryAgent';
import { ReziAgent, ReziConfig } from './search-agents/ReziAgent';
import { BaseGameSearchAgent, SearchAgentResult } from './search-agents/BaseGameSearchAgent';
import { extractSteamAppId } from '../../utils/steam';
import { QBittorrentService } from '../qbittorrent.service';
import { FitGirlRssMonitor } from './FitGirlRssMonitor';
import { ProwlarrRssMonitor } from './ProwlarrRssMonitor';
import { HydraLibraryService } from './HydraLibraryService';
import { SequelDetector, SequelPatterns } from '../../utils/SequelDetector';
import { 
  IGDBGame, 
  GameSearchResult, 
  MonitoredGame, 
  GameStatus,
  GameDownloadCandidate,
  GameStats,
  HydraSearchSettings
} from '@dasharr/shared-types';
import { CacheService } from '../cache.service';
import { logger } from '../../utils/logger';

export interface GamesServiceConfig {
  igdb: IGDBConfig;
  prowlarr?: ProwlarrConfig;
  qbittorrent?: QBittorrentService;
  dodi?: DODIConfig;
  rezi?: ReziConfig;
  searchAgents?: {
    fitgirl: boolean;
    dodi: boolean;
    steamrip: boolean;
    prowlarr: boolean;
    rezi: boolean;
  };
  searchAgentOrder?: Array<'hydra' | 'fitgirl' | 'dodi' | 'steamrip' | 'rezi' | 'prowlarr'>;
  enableRssMonitor?: boolean;
  hydra?: HydraSearchSettings;
}

export class GamesService {
  private igdbClient: IGDBClient;
  private searchAgents: BaseGameSearchAgent[] = [];
  private cacheService: CacheService;
  private qbittorrentService?: QBittorrentService;
  private rssMonitor?: FitGirlRssMonitor;
  private prowlarrRssMonitor?: ProwlarrRssMonitor;
  private hydraService?: HydraLibraryService;
  private monitoredGames: Map<string, MonitoredGame> = new Map();
  private serviceName = 'games';
  private periodicSearchInterval?: NodeJS.Timeout;
  private readonly PERIODIC_SEARCH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  private config: GamesServiceConfig;
  private sequelDetector: SequelDetector;

  constructor(config: GamesServiceConfig, cacheService: CacheService) {
    this.config = config;
    this.igdbClient = new IGDBClient(config.igdb);
    this.cacheService = cacheService;
    this.qbittorrentService = config.qbittorrent;
    this.sequelDetector = new SequelDetector(this.igdbClient);
    
    // Initialize search agents
    this.initializeSearchAgents();
    
    // Initialize RSS monitor if enabled
    this.initializeRssMonitors();

    // Start periodic search for monitored games
    this.startPeriodicSearch();
  }

  /**
   * Start periodic search for monitored games
   */
  private startPeriodicSearch(): void {
    logger.info('[GamesService] Starting periodic search (every 30 minutes)');
    
    this.periodicSearchInterval = setInterval(() => {
      this.checkMonitoredGames().catch(error => {
        logger.error('[GamesService] Periodic search failed:', error);
      });
    }, this.PERIODIC_SEARCH_INTERVAL_MS);
  }

  /**
   * Stop periodic search
   */
  stopPeriodicSearch(): void {
    if (this.periodicSearchInterval) {
      clearInterval(this.periodicSearchInterval);
      this.periodicSearchInterval = undefined;
      logger.info('[GamesService] Stopped periodic search');
    }
    
    this.stopRssMonitors();
  }

  private initializeSearchAgents(): void {
    this.searchAgents = [];

    const agentSettings = this.config.searchAgents || {
      fitgirl: true,
      dodi: true,
      steamrip: true,
      prowlarr: true,
      rezi: true,
    };

    const order = this.config.searchAgentOrder || [
      'hydra',
      'fitgirl',
      'dodi',
      'steamrip',
      'rezi',
      'prowlarr',
    ];

    for (const key of order) {
      if (key === 'hydra') {
        if (!this.config.hydra?.enabled) continue;
        this.hydraService =
          this.hydraService || new HydraLibraryService(this.cacheService, this.config.hydra);
        this.searchAgents.push(new HydraLibraryAgent(this.hydraService));
        continue;
      }

      if (key === 'fitgirl' && agentSettings.fitgirl) {
        this.searchAgents.push(new FitGirlAgent());
        continue;
      }
      if (key === 'dodi' && agentSettings.dodi) {
        this.searchAgents.push(new DODIAgent(this.config.dodi));
        continue;
      }
      if (key === 'steamrip' && agentSettings.steamrip) {
        this.searchAgents.push(new SteamRipAgent());
        continue;
      }
      if (
        key === 'rezi' &&
        agentSettings.rezi &&
        this.config.rezi?.baseUrl &&
        this.config.rezi?.apiKey
      ) {
        this.searchAgents.push(new ReziAgent(this.config.rezi));
        continue;
      }
      if (
        key === 'prowlarr' &&
        agentSettings.prowlarr &&
        this.config.prowlarr?.baseUrl &&
        this.config.prowlarr?.apiKey
      ) {
        this.searchAgents.push(new ProwlarrGameAgent(this.config.prowlarr));
        continue;
      }
    }

    // Sort by priority
    this.searchAgents.sort((a, b) => b.priority - a.priority);

    logger.info(
      `[GamesService] Initialized ${this.searchAgents.length} search agents:`,
      this.searchAgents.map((a) => a.name).join(', ')
    );
  }

  /**
   * Update Hydra settings dynamically
   */
  updateHydraSettings(settings: HydraSearchSettings): void {
    const wasHydraEnabled = !!this.config.hydra?.enabled;
    this.config.hydra = settings;

    if (settings.enabled) {
      if (!this.hydraService) {
        this.hydraService = new HydraLibraryService(this.cacheService, settings);
      } else {
        this.hydraService.updateSettings(settings);
      }
    } else if (this.hydraService) {
      this.hydraService = undefined;
    }

    this.initializeSearchAgents();

    if (settings.enabled && !wasHydraEnabled) {
      logger.info('[GamesService] Hydra Library search enabled');
    } else if (!settings.enabled && wasHydraEnabled) {
      logger.info('[GamesService] Hydra Library search disabled');
    }
  }

  private initializeRssMonitors(): void {
    if (this.config.enableRssMonitor !== false && !this.rssMonitor) {
      this.rssMonitor = new FitGirlRssMonitor(this);
      this.rssMonitor.start();
    }

    if (
      this.config.prowlarr?.baseUrl &&
      this.config.prowlarr?.apiKey &&
      !this.prowlarrRssMonitor
    ) {
      this.prowlarrRssMonitor = new ProwlarrRssMonitor(
        this.config.prowlarr,
        this,
        this.igdbClient
      );
      this.prowlarrRssMonitor.start();
    }
  }

  private stopRssMonitors(): void {
    if (this.rssMonitor) {
      this.rssMonitor.stop();
      this.rssMonitor = undefined;
    }

    if (this.prowlarrRssMonitor) {
      this.prowlarrRssMonitor.stop();
      this.prowlarrRssMonitor = undefined;
    }
  }

  private async getSequelPatterns(game: IGDBGame): Promise<SequelPatterns | undefined> {
    try {
      return await this.sequelDetector.getSequelPatterns(game.id, game.name);
    } catch (error) {
      logger.debug(`[GamesService] Sequel pattern fetch failed for ${game.name}:`, error);
      return undefined;
    }
  }

  private async getEditionTitles(game: IGDBGame): Promise<string[] | undefined> {
    try {
      const baseId = game.version_parent ?? game.id;
      const cacheKey = `${this.serviceName}:edition-titles:${baseId}`;
      const cached = await this.cacheService.get<string[]>(cacheKey);
      if (cached && cached.length > 0) {
        return cached;
      }

      let baseGame = game;
      if (baseId !== game.id) {
        const fetched = await this.igdbClient.getGameById(baseId);
        if (fetched) {
          baseGame = fetched;
        }
      }

      const titles: string[] = [];
      if (game.version_title) titles.push(game.version_title);
      if (baseGame.version_title) titles.push(baseGame.version_title);

      const versions = await this.igdbClient.getGameVersionsByGameId(baseId);
      for (const version of versions) {
        if (version.version_title) {
          titles.push(version.version_title);
        }
      }

      const unique = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
      if (unique.length > 0) {
        await this.cacheService.set(cacheKey, unique, 12 * 60 * 60);
        return unique;
      }

      return undefined;
    } catch (error) {
      logger.debug(`[GamesService] Edition title fetch failed for ${game.name}:`, error);
      return undefined;
    }
  }

  async getSequelPatternsForGame(igdbId: number): Promise<{
    game: IGDBGame | null;
    patterns?: SequelPatterns;
    editionTitles?: string[];
  }> {
    const game = await this.igdbClient.getGameById(igdbId);
    if (!game) {
      return { game: null };
    }

    const patterns = await this.getSequelPatterns(game);
    const editionTitles = await this.getEditionTitles(game);
    return { game, patterns, editionTitles };
  }

  /**
   * Search for games by name (using IGDB)
   */
  async searchGames(query: string, limit: number = 20): Promise<GameSearchResult[]> {
    const cacheKey = `${this.serviceName}:search:${query}:${limit}`;
    
    // Check cache first
    const cached = await this.cacheService.get<GameSearchResult[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    
    // Search IGDB
    const igdbGames = await this.igdbClient.searchGames(query, limit);
    
    // Map to search results
    const results: GameSearchResult[] = igdbGames.map(game => {
      const monitored = this.monitoredGames.get(`igdb-${game.id}`);
      
      // Extract Steam App ID from websites
      // Note: IGDB returns website objects with id and url only (no category/type)
      // We detect Steam by checking for store.steampowered.com in the URL
      const steamSite = game.websites?.find(w => w.url?.includes('store.steampowered.com'));
      const steamAppId = steamSite ? extractSteamAppId(steamSite.url) : undefined;
      
      return {
        igdbId: game.id,
        name: game.name,
        slug: game.slug,
        coverUrl: this.igdbClient.getCoverUrl(game.cover, 'cover'),
        releaseDate: this.igdbClient.formatReleaseDate(game.first_release_date),
        platforms: game.platforms?.map(p => p.name) || [],
        rating: game.aggregated_rating || game.rating,
        isMonitored: !!monitored,
        status: monitored?.status,
        // Include alternative names for better matching (e.g., "Baldur's Gate 3" vs "Baldur's Gate III")
        alternativeNames: game.alternative_names?.map(a => a.name) || [],
        steamAppId: steamAppId,
      };
    });
    
    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, results, 300);
    
    return results;
  }

  /**
   * Get upcoming games
   */
  async getUpcomingGames(limit: number = 20): Promise<GameSearchResult[]> {
    const cacheKey = `${this.serviceName}:upcoming:${limit}`;
    
    const cached = await this.cacheService.get<GameSearchResult[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    
    const igdbGames = await this.igdbClient.getUpcomingGames(limit);
    
    const results: GameSearchResult[] = igdbGames.map(game => {
      const monitored = this.monitoredGames.get(`igdb-${game.id}`);
      
      return {
        igdbId: game.id,
        name: game.name,
        slug: game.slug,
        coverUrl: this.igdbClient.getCoverUrl(game.cover, 'cover'),
        releaseDate: this.igdbClient.formatReleaseDate(game.first_release_date),
        platforms: game.platforms?.map(p => p.name) || [],
        rating: game.aggregated_rating || game.rating,
        isMonitored: !!monitored,
        status: monitored?.status,
      };
    });
    
    await this.cacheService.set(cacheKey, results, 300);
    
    return results;
  }

  /**
   * Get popular games
   */
  async getPopularGames(limit: number = 20, offset: number = 0): Promise<GameSearchResult[]> {
    const cacheKey = `${this.serviceName}:popular:${limit}:${offset}`;
    
    const cached = await this.cacheService.get<GameSearchResult[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    
    const igdbGames = offset > 0
      ? await this.igdbClient.getPopularGamesPage(limit, offset)
      : await this.igdbClient.getPopularGames(limit);
    
    const results: GameSearchResult[] = igdbGames.map(game => {
      const monitored = this.monitoredGames.get(`igdb-${game.id}`);
      
      return {
        igdbId: game.id,
        name: game.name,
        slug: game.slug,
        coverUrl: this.igdbClient.getCoverUrl(game.cover, 'cover'),
        releaseDate: this.igdbClient.formatReleaseDate(game.first_release_date),
        platforms: game.platforms?.map(p => p.name) || [],
        rating: game.aggregated_rating || game.rating,
        isMonitored: !!monitored,
        status: monitored?.status,
      };
    });
    
    await this.cacheService.set(cacheKey, results, 300);
    
    return results;
  }

  /**
   * Get highly anticipated games (filtered to exclude monitored/downloaded)
   */
  async getAnticipatedGames(limit: number = 20): Promise<GameSearchResult[]> {
    const cacheKey = `${this.serviceName}:anticipated:${limit}`;

    const cached = await this.cacheService.get<GameSearchResult[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // Fetch more than needed to account for filtering
    const igdbGames = await this.igdbClient.getAnticipatedGames(limit * 2);
    logger.info(`[GamesService] IGDB returned ${igdbGames.length} anticipated games before filtering`);

    const allResults: GameSearchResult[] = igdbGames.map(game => {
      const monitored = this.monitoredGames.get(`igdb-${game.id}`);

      return {
        igdbId: game.id,
        name: game.name,
        slug: game.slug,
        coverUrl: this.igdbClient.getCoverUrl(game.cover, 'cover'),
        releaseDate: this.igdbClient.formatReleaseDate(game.first_release_date),
        platforms: game.platforms?.map(p => p.name) || [],
        rating: game.aggregated_rating || game.rating,
        isMonitored: !!monitored,
        status: monitored?.status,
      };
    });

    // Filter out monitored/downloaded games for discover page
    const results = allResults
      .filter(game => !game.isMonitored && game.status !== 'downloaded')
      .slice(0, limit);

    await this.cacheService.set(cacheKey, results, 300);

    return results;
  }

  /**
   * Get top rated games of all time (filtered to exclude monitored/downloaded)
   */
  async getTopRatedGames(limit: number = 20): Promise<GameSearchResult[]> {
    const cacheKey = `${this.serviceName}:topRated:${limit}`;

    const cached = await this.cacheService.get<GameSearchResult[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // Fetch more than needed to account for filtering
    const igdbGames = await this.igdbClient.getTopRatedGames(limit * 2);
    logger.info(`[GamesService] IGDB returned ${igdbGames.length} top-rated games before filtering`);

    const allResults: GameSearchResult[] = igdbGames.map(game => {
      const monitored = this.monitoredGames.get(`igdb-${game.id}`);

      return {
        igdbId: game.id,
        name: game.name,
        slug: game.slug,
        coverUrl: this.igdbClient.getCoverUrl(game.cover, 'cover'),
        releaseDate: this.igdbClient.formatReleaseDate(game.first_release_date),
        platforms: game.platforms?.map(p => p.name) || [],
        rating: game.aggregated_rating || game.rating,
        isMonitored: !!monitored,
        status: monitored?.status,
      };
    });

    // Filter out monitored/downloaded games for discover page
    const results = allResults
      .filter(game => !game.isMonitored && game.status !== 'downloaded')
      .slice(0, limit);

    await this.cacheService.set(cacheKey, results, 300);

    return results;
  }

  /**
   * Get trending/popular games (filtered to exclude monitored/downloaded)
   */
  async getTrendingGames(limit: number = 20): Promise<GameSearchResult[]> {
    const cacheKey = `${this.serviceName}:trending:${limit}`;

    const cached = await this.cacheService.get<GameSearchResult[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // Fetch more than needed to account for filtering
    const igdbGames = await this.igdbClient.getTrendingGames(limit * 2);

    const allResults: GameSearchResult[] = igdbGames.map(game => {
      const monitored = this.monitoredGames.get(`igdb-${game.id}`);

      return {
        igdbId: game.id,
        name: game.name,
        slug: game.slug,
        coverUrl: this.igdbClient.getCoverUrl(game.cover, 'cover'),
        releaseDate: this.igdbClient.formatReleaseDate(game.first_release_date),
        platforms: game.platforms?.map(p => p.name) || [],
        rating: game.aggregated_rating || game.rating,
        isMonitored: !!monitored,
        status: monitored?.status,
      };
    });

    // Filter out monitored/downloaded games for discover page
    const results = allResults
      .filter(game => !game.isMonitored && game.status !== 'downloaded')
      .slice(0, limit);

    await this.cacheService.set(cacheKey, results, 300);

    return results;
  }

  /**
   * Get game details by ID
   */
  async getGameDetails(igdbId: number): Promise<IGDBGame | null> {
    return this.igdbClient.getGameById(igdbId);
  }

  /**
   * Start monitoring a game
   */
  async monitorGame(
    igdbId: number, 
    options: {
      preferredReleaseType?: 'scene' | 'p2p' | 'repack' | 'any';
      preferredPlatforms?: string[];
    } = {}
  ): Promise<MonitoredGame> {
    // Get game details from IGDB
    const game = await this.igdbClient.getGameById(igdbId);
    if (!game) {
      throw new Error(`Game with ID ${igdbId} not found`);
    }
    
    const id = `igdb-${igdbId}`;
    
    // Check if already monitored
    if (this.monitoredGames.has(id)) {
      return this.monitoredGames.get(id)!;
    }
    
    const monitoredGame: MonitoredGame = {
      id,
      igdbId,
      name: game.name,
      slug: game.slug,
      summary: game.summary,
      coverUrl: this.igdbClient.getCoverUrl(game.cover, 'cover'),
      platforms: game.platforms?.map(p => p.name) || [],
      genres: game.genres?.map(g => g.name) || [],
      releaseDate: this.igdbClient.formatReleaseDate(game.first_release_date),
      rating: game.aggregated_rating || game.rating,
      status: this.igdbClient.isReleased(game) ? 'wanted' : 'monitored',
      monitoredSince: new Date().toISOString(),
      preferredReleaseType: options.preferredReleaseType || 'any',
      preferredPlatforms: options.preferredPlatforms,
      searchCount: 0,
    };
    
    this.monitoredGames.set(id, monitoredGame);

    logger.info(`[GamesService] Started monitoring game: ${game.name}`);

    // Perform initial search for download candidates
    this.performInitialSearch(igdbId, monitoredGame).catch(error => {
      logger.error(`[GamesService] Initial search failed for ${game.name}:`, error);
    });

    return monitoredGame;
  }

  /**
   * Perform initial search when a game is first monitored
   * Downloads automatically if suitable release is found
   */
  private async performInitialSearch(igdbId: number, monitoredGame: MonitoredGame): Promise<void> {
    try {
      logger.info(`[GamesService] Performing initial search for: ${monitoredGame.name}`);

      // Search across all agents
      const candidates: GameDownloadCandidate[] = [];

      for (const agent of this.searchAgents) {
        if (!agent.isAvailable()) {
          continue;
        }

        try {
          const gameDetails = await this.igdbClient.getGameById(igdbId);
          if (!gameDetails) {
            continue;
          }
          const sequelPatterns = await this.getSequelPatterns(gameDetails);
          const editionTitles = await this.getEditionTitles(gameDetails);

          const result = await agent.searchEnhanced(gameDetails.name, {
            igdbGame: gameDetails,
            minMatchScore: 70,
            sequelPatterns,
            editionTitles,
          });

          if (result.success && result.candidates.length > 0) {
            candidates.push(...result.candidates);
            logger.info(`[GamesService] ${agent.name} found ${result.candidates.length} candidates`);
          }
        } catch (error) {
          logger.error(`[GamesService] ${agent.name} search failed:`, error);
        }
      }

      if (candidates.length === 0) {
        logger.info(`[GamesService] No candidates found for ${monitoredGame.name}, will continue monitoring`);
        return;
      }

      logger.info(`[GamesService] Found ${candidates.length} total candidates for ${monitoredGame.name}`);

      // Filter by preferred release type if specified
      let filteredCandidates = candidates;
      if (monitoredGame.preferredReleaseType && monitoredGame.preferredReleaseType !== 'any') {
        filteredCandidates = candidates.filter(c => c.releaseType === monitoredGame.preferredReleaseType);
        if (filteredCandidates.length === 0) {
          logger.info(`[GamesService] No ${monitoredGame.preferredReleaseType} releases found, using all candidates`);
          filteredCandidates = candidates;
        }
      }

      // Sort by priority: repacks first, then by size (smaller is better)
      filteredCandidates.sort((a, b) => {
        const typeOrder = { repack: 1, rip: 2, scene: 3, p2p: 4 };
        const aOrder = typeOrder[a.releaseType] || 99;
        const bOrder = typeOrder[b.releaseType] || 99;

        if (aOrder !== bOrder) return aOrder - bOrder;

        // If same type, prefer smaller size
        if (a.sizeBytes && b.sizeBytes) {
          return a.sizeBytes - b.sizeBytes;
        }

        return 0;
      });

      // Take the best candidate
      const bestCandidate = filteredCandidates[0];
      logger.info(`[GamesService] Best candidate for ${monitoredGame.name}: ${bestCandidate.title} (${bestCandidate.source})`);

      // Auto-download the best candidate
      if (bestCandidate.magnetUrl || bestCandidate.torrentUrl) {
        await this.startDownload(igdbId, bestCandidate, 'qbittorrent');
        logger.info(`[GamesService] Auto-downloaded ${monitoredGame.name} from initial search`);
      } else {
        logger.warn(`[GamesService] Best candidate has no download URL, will continue monitoring`);
      }
    } catch (error) {
      logger.error(`[GamesService] Initial search failed for ${monitoredGame.name}:`, error);
      // Don't throw - game is still monitored and will be checked by RSS/periodic searches
    }
  }

  /**
   * Stop monitoring a game
   */
  async unmonitorGame(igdbId: number): Promise<void> {
    const id = `igdb-${igdbId}`;
    const game = this.monitoredGames.get(id);
    
    if (game) {
      this.monitoredGames.delete(id);
      logger.info(`[GamesService] Stopped monitoring game: ${game.name}`);
    }
  }

  /**
   * Get all monitored games
   */
  getMonitoredGames(): MonitoredGame[] {
    return Array.from(this.monitoredGames.values()).sort(
      (a, b) => new Date(b.monitoredSince).getTime() - new Date(a.monitoredSince).getTime()
    );
  }

  /**
   * Get monitored game by ID
   */
  getMonitoredGame(igdbId: number): MonitoredGame | undefined {
    return this.monitoredGames.get(`igdb-${igdbId}`);
  }

  /**
   * Get game stats
   */
  getStats(): GameStats {
    const games = Array.from(this.monitoredGames.values());
    
    return {
      monitored: games.filter(g => g.status === 'monitored').length,
      downloading: games.filter(g => g.status === 'downloading').length,
      downloaded: games.filter(g => g.status === 'downloaded').length,
      wanted: games.filter(g => g.status === 'wanted').length,
    };
  }

  /**
   * Search download candidates for a game (parallel with streaming)
   */
  async searchDownloadCandidatesStreaming(
    igdbId: number,
    options: {
      releaseType?: 'repack' | 'rip' | 'scene' | 'p2p' | 'any';
      platform?: string;
      strictPlatform?: boolean;
      onAgentStart?: (agentName: string) => void;
      onAgentResult?: (agentName: string, candidates: GameDownloadCandidate[]) => void;
      onAgentError?: (agentName: string, error: string) => void;
      onAgentComplete?: (agentName: string) => void;
    } = {}
  ): Promise<GameDownloadCandidate[]> {
    const game = await this.getGameDetails(igdbId);
    if (!game) {
      throw new Error(`Game with ID ${igdbId} not found`);
    }

    logger.info(`[GamesService] Parallel searching download candidates for: ${game.name}`);
    logger.info(`[GamesService] Game has ${game.alternative_names?.length || 0} alternative names, ${game.websites?.length || 0} websites`);

    const sequelPatterns = await this.getSequelPatterns(game);
    const editionTitles = await this.getEditionTitles(game);

    const allCandidates: GameDownloadCandidate[] = [];
    const availableAgents = this.searchAgents.filter(agent => agent.isAvailable());

    // Search all agents in parallel
    const searchPromises = availableAgents.map(async (agent) => {
      try {
        // Notify that agent is starting
        options.onAgentStart?.(agent.name);

        // Use searchEnhanced for better matching with IGDB data
        const result = await agent.searchEnhanced(game.name, {
          igdbGame: game,
          platform: options.platform,
          strictPlatform: options.strictPlatform,
          sequelPatterns,
          editionTitles,
        });

        if (result.success && result.candidates.length > 0) {
          // Filter by release type if specified
          let candidates = result.candidates;
          if (options?.releaseType && options.releaseType !== 'any') {
            candidates = candidates.filter(c => c.releaseType === options.releaseType);
          }

          // Notify with results
          options.onAgentResult?.(agent.name, candidates);

          return candidates;
        }

        // Agent found nothing
        options.onAgentResult?.(agent.name, []);
        return [];
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[GamesService] Search agent ${agent.name} failed:`, error);
        options.onAgentError?.(agent.name, errorMsg);
        return [];
      } finally {
        // Notify that agent completed
        options.onAgentComplete?.(agent.name);
      }
    });

    // Wait for all agents to complete
    const results = await Promise.all(searchPromises);

    // Flatten all results
    allCandidates.push(...results.flat());

    // Sort by match score first, then platform score, then by release type priority
    allCandidates.sort((a, b) => {
      // Primary sort: match score (higher is better)
      const scoreA = a.matchScore || 0;
      const scoreB = b.matchScore || 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }

      // Secondary sort: platform score (preferred platforms first)
      const platformScoreA = a.platformScore || 0;
      const platformScoreB = b.platformScore || 0;
      if (platformScoreB !== platformScoreA) {
        return platformScoreB - platformScoreA;
      }

      // Tertiary sort: release type priority (repacks preferred)
      const typePriority = { repack: 3, rip: 2, scene: 1, p2p: 1, unknown: 0 };
      return (typePriority[b.releaseType] || 0) - (typePriority[a.releaseType] || 0);
    });

    logger.info(`[GamesService] Found ${allCandidates.length} total candidates`);

    return allCandidates;
  }

  /**
   * Search download candidates for a game (legacy non-streaming)
   */
  async searchDownloadCandidates(
    igdbId: number,
    options?: {
      releaseType?: 'repack' | 'rip' | 'scene' | 'p2p' | 'any';
      platform?: string;
      strictPlatform?: boolean;
    }
  ): Promise<GameDownloadCandidate[]> {
    return this.searchDownloadCandidatesStreaming(igdbId, options);
  }

  /**
   * Check monitored games for available downloads
   * This should be called periodically
   * Auto-downloads the best candidate if found and not already downloading
   */
  async checkMonitoredGames(): Promise<void> {
    logger.info(`[GamesService] Checking ${this.monitoredGames.size} monitored games`);
    
    const now = new Date();
    const MIN_SEARCH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes between searches for same game
    
    for (const game of this.monitoredGames.values()) {
      // Skip if already downloaded or downloading
      if (game.status === 'downloaded' || game.status === 'downloading') {
        continue;
      }
      
      // Skip if not yet released
      if (game.status === 'monitored' && game.releaseDate) {
        const releaseDate = new Date(game.releaseDate);
        if (releaseDate > now) {
          continue;
        }
      }
      
      // Skip if searched too recently
      if (game.lastSearchedAt) {
        const lastSearch = new Date(game.lastSearchedAt).getTime();
        const timeSinceLastSearch = now.getTime() - lastSearch;
        if (timeSinceLastSearch < MIN_SEARCH_INTERVAL_MS) {
          logger.debug(`[GamesService] Skipping ${game.name} - searched recently (${Math.round(timeSinceLastSearch / 60000)}m ago)`);
          continue;
        }
      }
      
      try {
        game.searchCount++;
        game.lastSearchedAt = now.toISOString();
        
        logger.info(`[GamesService] Searching for: ${game.name}`);
        
        const candidates = await this.searchDownloadCandidates(game.igdbId, {
          releaseType: game.preferredReleaseType === 'any' ? undefined : game.preferredReleaseType,
        });
        
        if (candidates.length === 0) {
          logger.info(`[GamesService] No candidates found for ${game.name}`);
          continue;
        }
        
        game.lastFoundAt = now.toISOString();
        game.status = 'wanted';
        
        logger.info(`[GamesService] Found ${candidates.length} candidates for ${game.name}`);
        
        // Auto-download the best candidate
        const bestCandidate = candidates[0];
        if (bestCandidate.magnetUrl || bestCandidate.torrentUrl) {
          try {
            await this.startDownload(game.igdbId, bestCandidate, 'qbittorrent');
            logger.info(`[GamesService] Auto-downloaded ${game.name} from periodic search (${bestCandidate.source})`);
          } catch (error) {
            logger.error(`[GamesService] Auto-download failed for ${game.name}:`, error);
            // Continue monitoring - will retry on next periodic check
          }
        } else {
          logger.warn(`[GamesService] Best candidate for ${game.name} has no download URL, continuing to monitor`);
        }
      } catch (error) {
        logger.error(`[GamesService] Failed to check game ${game.name}:`, error);
      }
    }
  }

  /**
   * Start downloading a game
   */
  async startDownload(
    igdbId: number,
    candidate: GameDownloadCandidate,
    downloadClient: 'qbittorrent' | 'rdtclient' = 'qbittorrent'
  ): Promise<void> {
    const game = this.monitoredGames.get(`igdb-${igdbId}`);
    if (!game) {
      throw new Error(`Game ${igdbId} is not monitored`);
    }
    
    // Check if we have a magnet URL or torrent URL
    const magnetUrl = candidate.magnetUrl;
    const torrentUrl = candidate.torrentUrl;
    
    if (!magnetUrl && !torrentUrl) {
      throw new Error('No download URL available for this candidate');
    }
    
    let downloadHash: string | undefined;
    
    // Add to download client
    if (downloadClient === 'qbittorrent' && this.qbittorrentService) {
      try {
        if (magnetUrl) {
          logger.info(`[GamesService] Adding magnet link to qBittorrent: ${candidate.title}`);
          downloadHash = await this.qbittorrentService.addMagnetLink(magnetUrl, {
            category: 'games',
          });
        } else if (torrentUrl) {
          logger.info(`[GamesService] Adding torrent URL to qBittorrent: ${candidate.title}`);
          // For torrent URLs, we'd need to download and add the file
          // For now, throw an error indicating magnet is preferred
          throw new Error('Torrent file URLs not yet supported. Please use magnet links.');
        }
        
        logger.info(`[GamesService] Successfully added to qBittorrent, hash: ${downloadHash}`);
      } catch (error) {
        logger.error(`[GamesService] Failed to add to qBittorrent:`, error);
        throw new Error(`Failed to add to qBittorrent: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      throw new Error(`Download client ${downloadClient} not available`);
    }
    
    // Update game status
    game.status = 'downloading';
    game.currentDownload = {
      status: 'downloading',
      progress: 0,
      source: candidate.source,
      title: candidate.title,
      client: downloadClient,
      hash: downloadHash,
    };
    
    logger.info(`[GamesService] Started download for ${game.name} from ${candidate.source}`);
  }

  /**
   * Test search agents with enhanced IGDB-based matching
   * This tests the accuracy of matching by fetching real IGDB data first
   */
  async testSearchAgentsEnhanced(igdbId: number): Promise<{
    game: IGDBGame | null;
    results: {
      agent: string;
      available: boolean;
      success: boolean;
      candidates: (GameDownloadCandidate & { matchScore?: number; matchReasons?: string[] })[];
      error?: string;
      duration: number;
    }[];
  }> {
    // Get game details from IGDB
    const game = await this.igdbClient.getGameById(igdbId);
    if (!game) {
      return { game: null, results: [] };
    }

    logger.info(`[GamesService] Testing enhanced search for: ${game.name} (ID: ${igdbId})`);
    
    const results = await Promise.all(
      this.searchAgents.map(async (agent) => {
        const startTime = Date.now();
        
        if (!agent.isAvailable()) {
          return {
            agent: agent.name,
            available: false,
            success: false,
            candidates: [],
            duration: 0,
          };
        }
        
        try {
          // All agents have searchEnhanced via BaseGameSearchAgent
          const sequelPatterns = await this.getSequelPatterns(game);
          const editionTitles = await this.getEditionTitles(game);
          const result = await agent.searchEnhanced(game.name, {
            igdbGame: game,
            sequelPatterns,
            editionTitles,
          });
          
          const duration = Date.now() - startTime;
          
          return {
            agent: agent.name,
            available: true,
            success: result.success,
            candidates: result.candidates,
            error: result.error,
            duration,
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          return {
            agent: agent.name,
            available: true,
            success: false,
            candidates: [],
            error: error instanceof Error ? error.message : 'Unknown error',
            duration,
          };
        }
      })
    );
    
    return { game, results };
  }

  /**
   * Test search with mock game data (no IGDB lookup required)
   */
  async testSearchWithMockData(
    gameName: string,
    gameYear?: number,
    alternativeNames?: string[],
    steamAppId?: number
  ): Promise<any> {
    const mockGame: IGDBGame = {
      id: 999999,
      name: gameName,
      slug: gameName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      first_release_date: gameYear ? new Date(`${gameYear}-01-01`).getTime() / 1000 : undefined,
      websites: steamAppId ? [
        {
          id: 1,
          url: `https://store.steampowered.com/app/${steamAppId}`,
          category: 13, // Steam
        }
      ] : undefined,
      alternative_names: alternativeNames?.map((name, idx) => ({
        id: 100000 + idx,
        name: name,
      })),
    };

    logger.info(`[GamesService] Testing with mock game: ${gameName} (${gameYear || 'no year'})`);

    const results = await Promise.all(
      this.searchAgents.map(async (agent) => {
        const startTime = Date.now();
        if (!agent.isAvailable()) {
          return { agent: agent.name, available: false, success: false, candidates: [], duration: 0 };
        }
        try {
          const result = await agent.searchEnhanced(gameName, { igdbGame: mockGame });
          return {
            agent: agent.name,
            available: true,
            success: result.success,
            candidates: result.candidates,
            error: result.error,
            duration: Date.now() - startTime,
          };
        } catch (error) {
          return {
            agent: agent.name,
            available: true,
            success: false,
            candidates: [],
            error: error instanceof Error ? error.message : 'Unknown error',
            duration: Date.now() - startTime,
          };
        }
      })
    );

    return { game: mockGame, results };
  }

  /**
   * Test search agents
   * Returns results from each agent separately for debugging
   */
  async testSearchAgents(query: string): Promise<{
    agent: string;
    available: boolean;
    success: boolean;
    candidates: GameDownloadCandidate[];
    error?: string;
    duration: number;
  }[]> {
    logger.info(`[GamesService] Testing search agents with query: ${query}`);
    
    const results = await Promise.all(
      this.searchAgents.map(async (agent) => {
        const startTime = Date.now();
        
        if (!agent.isAvailable()) {
          return {
            agent: agent.name,
            available: false,
            success: false,
            candidates: [] as GameDownloadCandidate[],
            duration: 0,
          };
        }
        
        try {
          const result = await agent.search(query);
          const duration = Date.now() - startTime;
          
          return {
            agent: agent.name,
            available: true,
            success: result.success,
            candidates: result.candidates,
            error: result.error,
            duration,
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          return {
            agent: agent.name,
            available: true,
            success: false,
            candidates: [] as GameDownloadCandidate[],
            error: error instanceof Error ? error.message : 'Unknown error',
            duration,
          };
        }
      })
    );
    
    return results;
  }

  /**
   * Test FitGirl RSS feed parsing
   * Returns detailed information about RSS entries and matches
   */
  async testFitGirlRss(): Promise<{
    rssAvailable: boolean;
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
    error?: string;
  }> {
    try {
      logger.info('[GamesService] Testing FitGirl RSS feed parsing');

      if (!this.rssMonitor) {
        return {
          rssAvailable: false,
          totalEntries: 0,
          gameEntries: 0,
          nonGameEntries: [],
          monitoredGamesCount: 0,
          matches: [],
          error: 'RSS monitor not initialized',
        };
      }

      // Call the public test method on RSS monitor
      const result = await this.rssMonitor.testRssParsing();

      return {
        rssAvailable: true,
        ...result,
      };
    } catch (error) {
      logger.error('[GamesService] Failed to test FitGirl RSS:', error);
      return {
        rssAvailable: false,
        totalEntries: 0,
        gameEntries: 0,
        nonGameEntries: [],
        monitoredGamesCount: 0,
        matches: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test Prowlarr RSS feed parsing
   * Returns detailed information about releases from enabled indexers
   */
  async testProwlarrRss(): Promise<{
    prowlarrAvailable: boolean;
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
      logger.info('[GamesService] Testing Prowlarr RSS feed parsing');

      if (!this.prowlarrRssMonitor) {
        return {
          prowlarrAvailable: false,
          indexersChecked: 0,
          totalReleases: 0,
          gameReleases: 0,
          monitoredGamesCount: 0,
          matches: [],
          error: 'Prowlarr RSS monitor not initialized (check Prowlarr config)',
        };
      }

      // Call the public test method on RSS monitor
      const result = await this.prowlarrRssMonitor.testRssParsing();

      return {
        prowlarrAvailable: true,
        ...result,
      };
    } catch (error) {
      logger.error('[GamesService] Failed to test Prowlarr RSS:', error);
      return {
        prowlarrAvailable: false,
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
