import { Router } from 'express';
import { HydraController } from '../controllers/hydra.controller';
import { CacheService } from '../services/cache.service';

export function createHydraRouter(cacheService: CacheService): Router {
  const router = Router();
  const controller = new HydraController(cacheService);

  // Get all available sources
  router.get('/sources', controller.getSources);

  // Get sources by trust level
  router.get('/sources/trust/:level', controller.getSourcesByTrustLevel);

  // Get Hydra settings
  router.get('/settings', controller.getSettings);

  // Update Hydra settings
  router.put('/settings', controller.updateSettings);

  // Search for a game
  router.get('/search', controller.searchGame);

  // Refresh sources cache
  router.post('/refresh', controller.refreshSources);

  return router;
}
