import { Router } from 'express';
import { SearchController } from '../controllers/search.controller';

export function createSearchRoutes(controller: SearchController): Router {
  const router = Router();

  // Unified search across all services
  router.get('/', controller.searchAll);

  // Search in specific service
  router.get('/:service', controller.searchService);

  return router;
}
