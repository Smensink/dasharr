import { Router } from 'express';
import { PlexController } from '../controllers/plex.controller';

export function createPlexRouter(controller: PlexController): Router {
  const router = Router();

  // Sessions endpoint
  router.get('/sessions', controller.getSessions);

  // Libraries endpoints
  router.get('/libraries', controller.getLibraries);
  router.get('/libraries/:libraryKey/items', controller.getLibraryItems);

  // Search endpoint
  router.get('/search', controller.searchMedia);

  // Media by GUID endpoint (for matching with *arr)
  router.get('/media/:guid', controller.getMediaByGuid);

  // Server info endpoint
  router.get('/server', controller.getServerInfo);

  // Health endpoint
  router.get('/health', controller.getHealth);

  // Find media using IDs first, then title (best for *arr integration)
  router.get('/find', controller.findMedia);

  return router;
}
