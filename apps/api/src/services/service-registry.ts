import { CacheService } from './cache.service';
import { RadarrService } from './radarr.service';
import { SonarrService } from './sonarr.service';
import { ReadarrService } from './readarr.service';
import { ProwlarrService } from './prowlarr.service';
import { QBittorrentService } from './qbittorrent.service';
import { SabnzbdService } from './sabnzbd.service';
import { RdtClientService } from './rdtclient.service';
import { PlexService } from './plex.service';
import { TautulliService } from './tautulli.service';
import { TdarrService } from './tdarr.service';
import { BazarrService } from './bazarr.service';
import { GamesService } from './games/GamesService';
import { RadarrController } from '../controllers/radarr.controller';
import { SonarrController } from '../controllers/sonarr.controller';
import { ReadarrController } from '../controllers/readarr.controller';
import { ProwlarrController } from '../controllers/prowlarr.controller';
import { PlexController } from '../controllers/plex.controller';
import { TautulliController } from '../controllers/tautulli.controller';
import { TdarrController } from '../controllers/tdarr.controller';
import { BazarrController } from '../controllers/bazarr.controller';
import { GamesController } from '../controllers/games.controller';
import { DownloadsController } from '../controllers/downloads.controller';
import { CalendarController } from '../controllers/calendar.controller';
import { SearchController } from '../controllers/search.controller';
import { ServiceControllers } from '../routes';
import { configService } from './config.service';
import { appSettingsService } from './app-settings.service';
import { logger } from '../utils/logger';
import { ServiceConfig } from '../config/services.config';
import { TMDBClient } from '../clients/TMDBClient';
import { TraktClient } from '../clients/TraktClient';
import { OMDbClient } from '../clients/OMDbClient';

/**
 * Service Registry - manages dynamic service initialization
 */
class ServiceRegistry {
  private cacheService: CacheService;
  private controllers: ServiceControllers = {};
  private services: any = {};
  private externalStatus: Record<string, { connected: boolean; message?: string }> = {};

  constructor() {
    this.cacheService = new CacheService();
  }

  async initializeAllServices(): Promise<ServiceControllers> {
    const config = configService.getConfig();

    // Initialize each service
    await this.initializeRadarr(config.services.radarr);
    await this.initializeSonarr(config.services.sonarr);
    await this.initializeReadarr(config.services.readarr);
    await this.initializeProwlarr(config.services.prowlarr);
    await this.initializeQBittorrent(config.services.qbittorrent);
    await this.initializeSabnzbd(config.services.sabnzbd);
    await this.initializeRdtClient(config.services.rdtclient);
    await this.initializePlex(config.services.plex);
    await this.initializeTautulli(config.services.tautulli);
    await this.initializeBazarr(config.services.bazarr);
    await this.initializeTdarr(config.services.tdarr);
    await this.initializeTmdb(config.services.tmdb);
    await this.initializeTrakt(config.services.trakt);
    await this.initializeOmdb(config.services.omdb);
    await this.initializeGames();

    // Initialize composite controllers
    this.updateCompositeControllers();

    return this.controllers;
  }

  async reinitializeService(serviceName: string): Promise<{ connected: boolean; message?: string }> {
    const config = configService.getServiceConfig(serviceName);
    if (!config) {
      logger.warn(`Cannot reinitialize unknown service: ${serviceName}`);
      return { connected: false, message: 'Unknown service' };
    }

    logger.info(`Reinitializing service: ${serviceName}`);

    let result: { connected: boolean; message?: string };

    switch (serviceName) {
      case 'radarr':
        result = await this.initializeRadarr(config);
        break;
      case 'sonarr':
        result = await this.initializeSonarr(config);
        break;
      case 'readarr':
        result = await this.initializeReadarr(config);
        break;
      case 'prowlarr':
        result = await this.initializeProwlarr(config);
        break;
      case 'qbittorrent':
        result = await this.initializeQBittorrent(config);
        break;
      case 'sabnzbd':
        result = await this.initializeSabnzbd(config);
        break;
      case 'rdtclient':
        result = await this.initializeRdtClient(config);
        break;
      case 'plex':
        result = await this.initializePlex(config);
        break;
      case 'tautulli':
        result = await this.initializeTautulli(config);
        break;
      case 'bazarr':
        result = await this.initializeBazarr(config);
        break;
      case 'tdarr':
        result = await this.initializeTdarr(config);
        break;
      case 'tmdb':
        result = await this.initializeTmdb(config);
        break;
      case 'trakt':
        result = await this.initializeTrakt(config);
        break;
      case 'omdb':
        result = await this.initializeOmdb(config);
        break;
      case 'igdb':
        result = await this.initializeGames();
        break;
      default:
        logger.warn(`Unknown service: ${serviceName}`);
        result = { connected: false, message: 'Unknown service' };
    }

    // Update composite controllers after reinitializing
    this.updateCompositeControllers();

    return result;
  }

  getControllers(): ServiceControllers {
    return this.controllers;
  }

  getServices(): {
    radarr?: RadarrService;
    sonarr?: SonarrService;
    readarr?: ReadarrService;
    prowlarr?: ProwlarrService;
    qbittorrent?: QBittorrentService;
    sabnzbd?: SabnzbdService;
    rdtclient?: RdtClientService;
    plex?: PlexService;
    tautulli?: TautulliService;
    bazarr?: BazarrService;
    tdarr?: TdarrService;
  } {
    return this.services;
  }

  getServiceStatus(): { [key: string]: boolean } {
    const tmdbEnabled = !!configService.getServiceConfig('tmdb')?.enabled;
    const traktEnabled = !!configService.getServiceConfig('trakt')?.enabled;
    const omdbEnabled = !!configService.getServiceConfig('omdb')?.enabled;
    const igdbEnabled = !!configService.getServiceConfig('igdb')?.enabled;
    const tmdbStatus = this.externalStatus.tmdb?.connected ?? tmdbEnabled;
    const traktStatus = this.externalStatus.trakt?.connected ?? traktEnabled;
    const omdbStatus = this.externalStatus.omdb?.connected ?? omdbEnabled;
    const igdbStatus = this.externalStatus.igdb?.connected ?? igdbEnabled;

    return {
      radarr: !!this.services.radarr,
      sonarr: !!this.services.sonarr,
      readarr: !!this.services.readarr,
      prowlarr: !!this.controllers.prowlarr,
      qbittorrent: !!this.services.qbittorrent,
      sabnzbd: !!this.services.sabnzbd,
      rdtclient: !!this.services.rdtclient,
      plex: !!this.controllers.plex,
      tautulli: !!this.controllers.tautulli,
      bazarr: !!this.controllers.bazarr,
      tdarr: !!this.controllers.tdarr,
      tmdb: tmdbStatus,
      trakt: traktStatus,
      omdb: omdbStatus,
      games: igdbStatus,
    };
  }

  private async initializeRadarr(config: any): Promise<{ connected: boolean; message?: string }> {
    if (config?.enabled) {
      try {
        const service = new RadarrService(config, this.cacheService);
        const health = await service.getHealth();

        this.controllers.radarr = new RadarrController(service);
        this.services.radarr = service;

        if (health.healthy) {
          logger.info('✓ Radarr connected successfully');
          return { connected: true, message: health.message || 'Connected successfully' };
        } else {
          logger.warn(`⚠ Radarr connected but has health warnings: ${health.message || 'Check Radarr health checks'}`);
          return { connected: true, message: health.message || 'Connected with warnings' };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('✗ Radarr failed to initialize:', error);
        delete this.controllers.radarr;
        delete this.services.radarr;
        return { connected: false, message: errorMsg };
      }
    } else {
      delete this.controllers.radarr;
      delete this.services.radarr;
      return { connected: false, message: 'Service disabled' };
    }
  }

  private async initializeSonarr(config: any): Promise<{ connected: boolean; message?: string }> {
    if (config?.enabled) {
      try {
        const service = new SonarrService(config, this.cacheService);
        const health = await service.getHealth();

        this.controllers.sonarr = new SonarrController(service);
        this.services.sonarr = service;

        if (health.healthy) {
          logger.info('✓ Sonarr connected successfully');
          return { connected: true, message: health.message || 'Connected successfully' };
        } else {
          logger.warn(`⚠ Sonarr connected but has health warnings: ${health.message || 'Check Sonarr health checks'}`);
          return { connected: true, message: health.message || 'Connected with warnings' };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('✗ Sonarr failed to initialize:', error);
        delete this.controllers.sonarr;
        delete this.services.sonarr;
        return { connected: false, message: errorMsg };
      }
    } else {
      delete this.controllers.sonarr;
      delete this.services.sonarr;
      return { connected: false, message: 'Service disabled' };
    }
  }

  private async initializeReadarr(config: any): Promise<{ connected: boolean; message?: string }> {
    if (config?.enabled) {
      try {
        const service = new ReadarrService(config, this.cacheService);
        const health = await service.getHealth();

        this.controllers.readarr = new ReadarrController(service);
        this.services.readarr = service;

        if (health.healthy) {
          logger.info('✓ Readarr connected successfully');
          return { connected: true, message: health.message || 'Connected successfully' };
        } else {
          logger.warn(`⚠ Readarr connected but has health warnings: ${health.message || 'Check Readarr health checks'}`);
          return { connected: true, message: health.message || 'Connected with warnings' };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('✗ Readarr failed to initialize:', error);
        delete this.controllers.readarr;
        delete this.services.readarr;
        return { connected: false, message: errorMsg };
      }
    } else {
      delete this.controllers.readarr;
      delete this.services.readarr;
      return { connected: false, message: 'Service disabled' };
    }
  }

  private async initializeProwlarr(config: any): Promise<{ connected: boolean; message?: string }> {
    if (config?.enabled) {
      try {
        const service = new ProwlarrService(config, this.cacheService);
        const health = await service.getHealth();

        this.controllers.prowlarr = new ProwlarrController(service);

        if (health.healthy) {
          logger.info('✓ Prowlarr connected successfully');
          return { connected: true, message: health.message || 'Connected successfully' };
        } else {
          logger.warn(`⚠ Prowlarr connected but has health warnings: ${health.message || 'Check Prowlarr health checks'}`);
          return { connected: true, message: health.message || 'Connected with warnings' };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('✗ Prowlarr failed to initialize:', error);
        delete this.controllers.prowlarr;
        return { connected: false, message: errorMsg };
      }
    } else {
      delete this.controllers.prowlarr;
      return { connected: false, message: 'Service disabled' };
    }
  }

  private async initializeQBittorrent(config: any): Promise<{ connected: boolean; message?: string }> {
    if (config?.enabled) {
      try {
        const service = new QBittorrentService(config, this.cacheService);
        const health = await service.getHealth();

        if (health.healthy) {
          this.services.qbittorrent = service;
          logger.info('✓ qBittorrent connected successfully');
          return { connected: true, message: 'Connected successfully' };
        } else {
          logger.warn(`✗ qBittorrent unhealthy: ${health.message}`);
          delete this.services.qbittorrent;
          return { connected: false, message: health.message || 'Connection failed' };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('✗ qBittorrent failed to initialize:', error);
        delete this.services.qbittorrent;
        return { connected: false, message: errorMsg };
      }
    } else {
      delete this.services.qbittorrent;
      return { connected: false, message: 'Service disabled' };
    }
  }

  private async initializeSabnzbd(config: any): Promise<{ connected: boolean; message?: string }> {
    if (config?.enabled) {
      try {
        const service = new SabnzbdService(config, this.cacheService);
        const health = await service.getHealth();

        if (health.healthy) {
          this.services.sabnzbd = service;
          logger.info('✓ SABnzbd connected successfully');
          return { connected: true, message: health.message || 'Connected successfully' };
        } else {
          logger.warn(`✗ SABnzbd unhealthy: ${health.message}`);
          delete this.services.sabnzbd;
          return { connected: false, message: health.message || 'Connection failed' };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('✗ SABnzbd failed to initialize:', error);
        delete this.services.sabnzbd;
        return { connected: false, message: errorMsg };
      }
    } else {
      delete this.services.sabnzbd;
      return { connected: false, message: 'Service disabled' };
    }
  }

  private async initializeRdtClient(config: any): Promise<{ connected: boolean; message?: string }> {
    if (config?.enabled) {
      try {
        const service = new RdtClientService(config, this.cacheService);
        const health = await service.getHealth();

        if (health.healthy) {
          this.services.rdtclient = service;
          logger.info('✓ RDTClient connected successfully');
          return { connected: true, message: health.message || 'Connected successfully' };
        } else {
          logger.warn(`✗ RDTClient unhealthy: ${health.message}`);
          delete this.services.rdtclient;
          return { connected: false, message: health.message || 'Connection failed' };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('✗ RDTClient failed to initialize:', error);
        delete this.services.rdtclient;
        return { connected: false, message: errorMsg };
      }
    } else {
      delete this.services.rdtclient;
      return { connected: false, message: 'Service disabled' };
    }
  }

  private async initializePlex(config: any): Promise<{ connected: boolean; message?: string }> {
    if (config?.enabled) {
      try {
        const service = new PlexService(config, this.cacheService);
        const health = await service.getHealth();

        if (health.healthy) {
          this.controllers.plex = new PlexController(service);
          this.services.plex = service;
          logger.info('✓ Plex connected successfully');
          return { connected: true, message: 'Connected successfully' };
        } else {
          logger.warn(`✗ Plex unhealthy: ${health.message}`);
          delete this.controllers.plex;
          delete this.services.plex;
          return { connected: false, message: health.message || 'Connection failed' };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('✗ Plex failed to initialize:', error);
        delete this.controllers.plex;
        delete this.services.plex;
        return { connected: false, message: errorMsg };
      }
    } else {
      delete this.controllers.plex;
      delete this.services.plex;
      return { connected: false, message: 'Service disabled' };
    }
  }

  private async initializeTautulli(config: any): Promise<{ connected: boolean; message?: string }> {
    if (config?.enabled) {
      try {
        const service = new TautulliService(config, this.cacheService);
        const health = await service.getHealth();

        if (health.healthy) {
          this.controllers.tautulli = new TautulliController(service);
          this.services.tautulli = service;
          logger.info('✓ Tautulli connected successfully');
          return { connected: true, message: 'Connected successfully' };
        } else {
          logger.warn(`✗ Tautulli unhealthy: ${health.message}`);
          delete this.controllers.tautulli;
          delete this.services.tautulli;
          return { connected: false, message: health.message || 'Connection failed' };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('✗ Tautulli failed to initialize:', error);
        delete this.controllers.tautulli;
        delete this.services.tautulli;
        return { connected: false, message: errorMsg };
      }
    } else {
      delete this.controllers.tautulli;
      delete this.services.tautulli;
      return { connected: false, message: 'Service disabled' };
    }
  }

  private async initializeBazarr(config: any): Promise<{ connected: boolean; message?: string }> {
    if (config?.enabled) {
      try {
        const service = new BazarrService(config, this.cacheService);
        const health = await service.getHealth();

        if (health.healthy) {
          this.controllers.bazarr = new BazarrController(service);
          this.services.bazarr = service;
          logger.info('✓ Bazarr connected successfully');
          return { connected: true, message: health.message || 'Connected successfully' };
        } else {
          logger.warn(`✗ Bazarr unhealthy: ${health.message}`);
          delete this.controllers.bazarr;
          delete this.services.bazarr;
          return { connected: false, message: health.message || 'Connection failed' };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('✗ Bazarr failed to initialize:', error);
        delete this.controllers.bazarr;
        delete this.services.bazarr;
        return { connected: false, message: errorMsg };
      }
    } else {
      delete this.controllers.bazarr;
      delete this.services.bazarr;
      return { connected: false, message: 'Service disabled' };
    }
  }

  private async initializeTdarr(config: any): Promise<{ connected: boolean; message?: string }> {
    const localDbPath = process.env.TDARR_LOCAL_DB_PATH;
    const allowLocal = !!localDbPath;
    if (config?.enabled || allowLocal) {
      try {
        const service = new TdarrService(config, this.cacheService);
        const health = await service.getHealth();

        this.controllers.tdarr = new TdarrController(service);
        this.services.tdarr = service;

        if (health.healthy) {
          logger.info('✓ Tdarr connected successfully');
          return { connected: true, message: 'Connected successfully' };
        } else {
          logger.warn(`✗ Tdarr unhealthy: ${health.message}`);
          delete this.controllers.tdarr;
          delete this.services.tdarr;
          return { connected: false, message: health.message || 'Connection failed' };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('✗ Tdarr failed to initialize:', error);
        delete this.controllers.tdarr;
        delete this.services.tdarr;
        return { connected: false, message: errorMsg };
      }
    } else {
      delete this.controllers.tdarr;
      delete this.services.tdarr;
      return { connected: false, message: 'Service disabled' };
    }
  }

  private async initializeTmdb(
    config?: ServiceConfig
  ): Promise<{ connected: boolean; message?: string }> {
    if (!config?.enabled) {
      this.externalStatus.tmdb = { connected: false, message: 'Service disabled' };
      return this.externalStatus.tmdb;
    }
    if (!config.baseUrl || !config.apiKey) {
      this.externalStatus.tmdb = {
        connected: false,
        message: 'TMDB_URL and TMDB_API_KEY are required',
      };
      return this.externalStatus.tmdb;
    }

    try {
      const client = new TMDBClient(config);
      await client.getConfiguration();
      this.externalStatus.tmdb = { connected: true, message: 'Connected successfully' };
      logger.info('✓ TMDB connected successfully');
      return this.externalStatus.tmdb;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.externalStatus.tmdb = { connected: false, message: errorMsg };
      logger.warn(`✗ TMDB failed to connect: ${errorMsg}`);
      return this.externalStatus.tmdb;
    }
  }

  private async initializeTrakt(
    config?: ServiceConfig
  ): Promise<{ connected: boolean; message?: string }> {
    if (!config?.enabled) {
      this.externalStatus.trakt = { connected: false, message: 'Service disabled' };
      return this.externalStatus.trakt;
    }
    if (!config.baseUrl || !config.apiKey) {
      this.externalStatus.trakt = {
        connected: false,
        message: 'TRAKT_URL and TRAKT_CLIENT_ID are required',
      };
      return this.externalStatus.trakt;
    }

    try {
      const client = new TraktClient(config);
      await client.getTrending('movies');
      this.externalStatus.trakt = { connected: true, message: 'Connected successfully' };
      logger.info('✓ Trakt connected successfully');
      return this.externalStatus.trakt;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.externalStatus.trakt = { connected: false, message: errorMsg };
      logger.warn(`✗ Trakt failed to connect: ${errorMsg}`);
      return this.externalStatus.trakt;
    }
  }

  private async initializeOmdb(
    config?: ServiceConfig
  ): Promise<{ connected: boolean; message?: string }> {
    if (!config?.enabled) {
      this.externalStatus.omdb = { connected: false, message: 'Service disabled' };
      return this.externalStatus.omdb;
    }
    if (!config.baseUrl || !config.apiKey) {
      this.externalStatus.omdb = {
        connected: false,
        message: 'OMDB_URL and OMDB_API_KEY are required',
      };
      return this.externalStatus.omdb;
    }

    try {
      const client = new OMDbClient(config);
      const result = await client.getByImdbId('tt0111161');
      if (result.Response === 'False') {
        throw new Error(result.Error || 'OMDb validation failed');
      }
      this.externalStatus.omdb = { connected: true, message: 'Connected successfully' };
      logger.info('✓ OMDb connected successfully');
      return this.externalStatus.omdb;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.externalStatus.omdb = { connected: false, message: errorMsg };
      logger.warn(`✗ OMDb failed to connect: ${errorMsg}`);
      return this.externalStatus.omdb;
    }
  }

  private async initializeGames(): Promise<{ connected: boolean; message?: string }> {
    const igdbConfig = configService.getServiceConfig('igdb');
    const prowlarrConfig = configService.getServiceConfig('prowlarr');
    const flareSolverrConfig = configService.getServiceConfig('flaresolverr');

    if (!igdbConfig?.enabled) {
      this.externalStatus.igdb = { connected: false, message: 'Service disabled' };
      return this.externalStatus.igdb;
    }
    if (!igdbConfig.clientId || !igdbConfig.clientSecret) {
      this.externalStatus.igdb = {
        connected: false,
        message: 'IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are required',
      };
      return this.externalStatus.igdb;
    }

    try {
      // Get Hydra settings from app settings
      const hydraSettings = appSettingsService.getHydraSettings();

      const gamesService = new GamesService(
        {
          igdb: {
            clientId: igdbConfig.clientId,
            clientSecret: igdbConfig.clientSecret,
          },
          prowlarr: prowlarrConfig?.enabled ? {
            baseUrl: prowlarrConfig.baseUrl,
            apiKey: prowlarrConfig.apiKey!,
          } : undefined,
          dodi: flareSolverrConfig?.enabled ? {
            flaresolverrUrl: flareSolverrConfig.baseUrl,
          } : undefined,
          qbittorrent: this.services.qbittorrent,
          enableRssMonitor: process.env.GAMES_RSS_MONITOR_ENABLED !== 'false',
          hydra: hydraSettings,
        },
        this.cacheService
      );

      // Test connection by searching for a popular game
      await gamesService.searchGames('The Witcher', 1);

      this.services.games = gamesService;
      this.controllers.games = new GamesController(gamesService);

      this.externalStatus.igdb = { connected: true, message: 'Connected successfully' };
      logger.info('✓ Games service (IGDB) connected successfully');
      return this.externalStatus.igdb;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.externalStatus.igdb = { connected: false, message: errorMsg };
      delete this.services.games;
      delete this.controllers.games;
      logger.warn(`✗ Games service failed to connect: ${errorMsg}`);
      return this.externalStatus.igdb;
    }
  }

  private updateCompositeControllers(): void {
    // Update downloads controller
    if (Object.keys(this.services).length > 0) {
      this.controllers.downloads = new DownloadsController(this.services);
    } else {
      delete this.controllers.downloads;
    }

    // Update calendar controller
    const calendarServices = {
      radarr: this.services.radarr,
      sonarr: this.services.sonarr,
      readarr: this.services.readarr,
    };
    if (Object.values(calendarServices).some((s) => s)) {
      this.controllers.calendar = new CalendarController(calendarServices);
    } else {
      delete this.controllers.calendar;
    }

    // Update search controller
    const searchServices = {
      radarr: this.services.radarr,
      sonarr: this.services.sonarr,
      readarr: this.services.readarr,
    };
    if (Object.values(searchServices).some((s) => s)) {
      this.controllers.search = new SearchController(searchServices);
    } else {
      delete this.controllers.search;
    }
  }
}

export const serviceRegistry = new ServiceRegistry();
