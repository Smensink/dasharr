import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { optionalAuth } from '../middleware/auth.middleware';

export function createAuthRoutes(controller: AuthController): Router {
  const router = Router();

  router.post('/plex/start', controller.startPlexAuth);
  router.post('/plex/complete', controller.completePlexAuth);
  router.get('/me', optionalAuth, controller.getMe);
  router.post('/logout', controller.logout);

  return router;
}
