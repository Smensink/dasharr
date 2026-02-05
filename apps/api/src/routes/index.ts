import { Router } from 'express';
import { RadarrController } from '../controllers/radarr.controller';
import { SonarrController } from '../controllers/sonarr.controller';
import { ReadarrController } from '../controllers/readarr.controller';
import { ProwlarrController } from '../controllers/prowlarr.controller';
import { PlexController } from '../controllers/plex.controller';
import { TautulliController } from '../controllers/tautulli.controller';
import { TdarrController } from '../controllers/tdarr.controller';
import { BazarrController } from '../controllers/bazarr.controller';
import { GamesController } from '../controllers/games.controller';
import { DasharrController } from '../controllers/dasharr.controller';
import { DownloadsController } from '../controllers/downloads.controller';
import { CalendarController } from '../controllers/calendar.controller';
import { SearchController } from '../controllers/search.controller';
import { DiscoverController } from '../controllers/discover.controller';
import { createRadarrRouter } from './radarr.routes';
import { createSonarrRouter } from './sonarr.routes';
import { createReadarrRouter } from './readarr.routes';
import { createProwlarrRouter } from './prowlarr.routes';
import { createPlexRouter } from './plex.routes';
import { createTautulliRouter } from './tautulli.routes';
import { createTdarrRoutes } from './tdarr.routes';
import { createBazarrRouter } from './bazarr.routes';
import { createGamesRouter } from './games.routes';
import { createDasharrRouter } from './dasharr.routes';
import { createDownloadsRouter } from './downloads.routes';
import { createCalendarRoutes } from './calendar.routes';
import { createSearchRoutes } from './search.routes';
import { createDiscoverRoutes } from './discover.routes';
import configRoutes from './config.routes';
import { createAppSettingsRouter } from './app-settings.routes';
import { serviceRegistry } from '../services/service-registry';
import { DiscoverService } from '../services/discover.service';
import { CacheService } from '../services/cache.service';

export interface ServiceControllers {
  radarr?: RadarrController;
  sonarr?: SonarrController;
  readarr?: ReadarrController;
  prowlarr?: ProwlarrController;
  plex?: PlexController;
  tautulli?: TautulliController;
  tdarr?: TdarrController;
  bazarr?: BazarrController;
  games?: GamesController;
  dasharr?: DasharrController;
  downloads?: DownloadsController;
  calendar?: CalendarController;
  search?: SearchController;
}

export function createApiRouter(_controllers: ServiceControllers): Router {
  const router = Router();
  const discoverService = new DiscoverService(
    new CacheService(),
    () => serviceRegistry.getServices()
  );
  const discoverController = new DiscoverController(discoverService);

  // Dynamic routing middleware - always uses current controllers from registry
  router.use('/radarr', (req, res, next) => {
    const currentControllers = serviceRegistry.getControllers();
    if (currentControllers.radarr) {
      createRadarrRouter(currentControllers.radarr)(req, res, next);
    } else {
      res.status(503).json({ error: 'Radarr service not available' });
    }
  });

  router.use('/sonarr', (req, res, next) => {
    const currentControllers = serviceRegistry.getControllers();
    if (currentControllers.sonarr) {
      createSonarrRouter(currentControllers.sonarr)(req, res, next);
    } else {
      res.status(503).json({ error: 'Sonarr service not available' });
    }
  });

  router.use('/readarr', (req, res, next) => {
    const currentControllers = serviceRegistry.getControllers();
    if (currentControllers.readarr) {
      createReadarrRouter(currentControllers.readarr)(req, res, next);
    } else {
      res.status(503).json({ error: 'Readarr service not available' });
    }
  });

  router.use('/prowlarr', (req, res, next) => {
    const currentControllers = serviceRegistry.getControllers();
    if (currentControllers.prowlarr) {
      createProwlarrRouter(currentControllers.prowlarr)(req, res, next);
    } else {
      res.status(503).json({ error: 'Prowlarr service not available' });
    }
  });

  router.use('/downloads', (req, res, next) => {
    const currentControllers = serviceRegistry.getControllers();
    if (currentControllers.downloads) {
      createDownloadsRouter(currentControllers.downloads)(req, res, next);
    } else {
      res.status(503).json({ error: 'Downloads service not available' });
    }
  });

  router.use('/calendar', (req, res, next) => {
    const currentControllers = serviceRegistry.getControllers();
    if (currentControllers.calendar) {
      createCalendarRoutes(currentControllers.calendar)(req, res, next);
    } else {
      res.status(503).json({ error: 'Calendar service not available' });
    }
  });

  router.use('/search', (req, res, next) => {
    const currentControllers = serviceRegistry.getControllers();
    if (currentControllers.search) {
      createSearchRoutes(currentControllers.search)(req, res, next);
    } else {
      res.status(503).json({ error: 'Search service not available' });
    }
  });

  router.use('/plex', (req, res, next) => {
    const currentControllers = serviceRegistry.getControllers();
    if (currentControllers.plex) {
      createPlexRouter(currentControllers.plex)(req, res, next);
    } else {
      res.status(503).json({ error: 'Plex service not available' });
    }
  });

  router.use('/tautulli', (req, res, next) => {
    const currentControllers = serviceRegistry.getControllers();
    if (currentControllers.tautulli) {
      createTautulliRouter(currentControllers.tautulli)(req, res, next);
    } else {
      res.status(503).json({ error: 'Tautulli service not available' });
    }
  });

  router.use('/bazarr', (req, res, next) => {
    const currentControllers = serviceRegistry.getControllers();
    if (currentControllers.bazarr) {
      createBazarrRouter(currentControllers.bazarr)(req, res, next);
    } else {
      res.status(503).json({ error: 'Bazarr service not available' });
    }
  });

  router.use('/tdarr', (req, res, next) => {
    const currentControllers = serviceRegistry.getControllers();
    if (currentControllers.tdarr) {
      createTdarrRoutes(currentControllers.tdarr)(req, res, next);
    } else {
      res.status(503).json({ error: 'Tdarr service not available' });
    }
  });

  router.use('/games', (req, res, next) => {
    const currentControllers = serviceRegistry.getControllers();
    if (currentControllers.games) {
      createGamesRouter(currentControllers.games)(req, res, next);
    } else {
      res.status(503).json({ error: 'Games service not available. Configure IGDB in settings.' });
    }
  });

  router.use('/discover', createDiscoverRoutes(discoverController));
  router.use('/dasharr', createDasharrRouter(new DasharrController()));

  // Configuration endpoint (always available)
  router.use('/config', configRoutes);

  // App settings endpoint (always available)
  router.use('/app-settings', createAppSettingsRouter());

  // Health check endpoint - always get fresh controller status
  router.get('/health', (_req, res) => {
    const currentControllers = serviceRegistry.getControllers();
    const serviceStatus = serviceRegistry.getServiceStatus();
    res.json({
      status: 'ok',
      services: {
        ...serviceStatus,
        downloads: !!currentControllers.downloads,
        calendar: !!currentControllers.calendar,
        search: !!currentControllers.search,
        plex: !!currentControllers.plex,
        tautulli: !!currentControllers.tautulli,
        bazarr: !!currentControllers.bazarr,
        tdarr: !!currentControllers.tdarr,
        games: !!currentControllers.games,
      },
    });
  });

  return router;
}
