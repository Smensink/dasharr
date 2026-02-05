import { Router } from 'express';
import { DiscoverController } from '../controllers/discover.controller';

export function createDiscoverRoutes(controller: DiscoverController): Router {
  const router = Router();

  router.get('/sections', controller.getSections);
  router.get('/trending/:type', controller.getTrending);
  router.get('/popular/:type', controller.getPopular);
  router.get('/upcoming', controller.getUpcoming);
  router.get('/now-playing', controller.getNowPlaying);
  router.get('/anticipated/:type', controller.getAnticipated);
  router.get('/awards/:category', controller.getAwards);
  router.get('/external/:type/:tmdbId', controller.resolveExternalIds);

  return router;
}
