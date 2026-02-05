import { Router } from 'express';
import { TautulliController } from '../controllers/tautulli.controller';

export function createTautulliRouter(controller: TautulliController): Router {
  const router = Router();

  // Activity endpoint (current sessions)
  router.get('/activity', controller.getActivity);

  // History endpoint
  router.get('/history', controller.getHistory);

  // Statistics endpoints
  router.get('/stats/watch', controller.getWatchStats);
  router.get('/stats/home', controller.getHomeStats);

  // Health endpoint
  router.get('/health', controller.getHealth);

  return router;
}
