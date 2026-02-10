import { Router } from 'express';
import { DDLController } from '../controllers/ddl.controller';
import { DDLDownloadService } from '../services/ddl-download.service';
import { GamesService } from '../services/games/GamesService';

export interface DDLRoutesConfig {
  ddlService: DDLDownloadService;
  gamesService: GamesService;
}

export function createDDLRoutes(config: DDLRoutesConfig): Router {
  const router = Router();
  const controller = new DDLController({
    ddlService: config.ddlService,
    gamesService: config.gamesService,
  });

  // Settings routes
  router.get('/settings', controller.getSettings);
  router.put('/settings', controller.updateSettings);

  // Download routes
  router.get('/downloads', controller.getDownloads);
  router.post('/downloads', controller.startDownload);
  router.get('/downloads/:downloadId', controller.getDownload);
  router.delete('/downloads/:downloadId', controller.cancelDownload);

  // Search route (DDL only)
  router.post('/search', controller.searchDDLCandidates);

  return router;
}
