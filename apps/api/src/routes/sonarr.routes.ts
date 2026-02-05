import { Router } from 'express';
import { SonarrController } from '../controllers/sonarr.controller';

export function createSonarrRouter(controller: SonarrController): Router {
  const router = Router();

  // Series endpoints
  router.get('/series', controller.getSeries);
  router.get('/series/:id', controller.getSeriesById);
  router.get('/series/:id/episodes', controller.getEpisodes);
  router.post('/series', controller.addSeries);
  router.put('/series/:id', controller.updateSeries);
  router.delete('/series/:id', controller.deleteSeries);

  // Search endpoints
  router.get('/search', controller.searchSeries);
  router.post('/series/:id/search', controller.triggerSearch);

  // Queue, history, calendar
  router.get('/queue', controller.getQueue);
  router.get('/history', controller.getHistory);
  router.get('/calendar', controller.getCalendar);

  // Configuration
  router.get('/profiles', controller.getProfiles);
  router.get('/rootfolders', controller.getRootFolders);

  // System
  router.get('/logs', controller.getLogs);
  router.get('/health', controller.getHealth);

  return router;
}
