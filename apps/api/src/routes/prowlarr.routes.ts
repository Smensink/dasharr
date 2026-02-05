import { Router } from 'express';
import { ProwlarrController } from '../controllers/prowlarr.controller';

export function createProwlarrRouter(controller: ProwlarrController): Router {
  const router = Router();

  // Indexer endpoints
  router.get('/indexers', controller.getIndexers);
  router.get('/indexers/:id', controller.getIndexerById);
  router.post('/indexers', controller.addIndexer);
  router.put('/indexers/:id', controller.updateIndexer);
  router.delete('/indexers/:id', controller.deleteIndexer);
  router.post('/indexers/:id/test', controller.testIndexer);

  // Stats
  router.get('/stats', controller.getIndexerStats);

  // Search
  router.get('/search', controller.search);

  // History
  router.get('/history', controller.getHistory);

  // Configuration
  router.get('/tags', controller.getTags);
  router.get('/appprofiles', controller.getAppProfiles);

  // System
  router.get('/health', controller.getHealth);

  return router;
}
