import { Router } from 'express';
import { BazarrController } from '../controllers/bazarr.controller';

export function createBazarrRouter(controller: BazarrController): Router {
  const router = Router();

  // Allow direct Cross-Origin access to Bazarr metadata endpoints if needed
  router.use((_, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    next();
  });

  router.options('*', (_req, res) => {
    res.sendStatus(204);
  });

  router.get('/movies', controller.getMovies);
  router.post('/movies', controller.getMovies);
  router.get('/series/:seriesId/episodes', controller.getSeriesEpisodes);
  router.get('/series/summary', controller.getSeriesSummary);
  router.post('/series/summary', controller.getSeriesSummary);

  router.post('/movies/:radarrId/search', controller.searchMovieSubtitles);
  router.post(
    '/series/:seriesId/episodes/:episodeId/search',
    controller.searchEpisodeSubtitles
  );
  router.post('/series/:seriesId/search', controller.searchSeriesSubtitles);

  router.get('/logs', controller.getLogs);

  router.get('/health', controller.getHealth);

  return router;
}
