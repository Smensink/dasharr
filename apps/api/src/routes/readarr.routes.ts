import { Router } from 'express';
import { ReadarrController } from '../controllers/readarr.controller';

export function createReadarrRouter(controller: ReadarrController): Router {
  const router = Router();

  // Books endpoints
  router.get('/books', controller.getBooks);
  router.get('/books/:id', controller.getBookById);
  router.post('/books', controller.addBook);
  router.put('/books/:id', controller.updateBook);
  router.delete('/books/:id', controller.deleteBook);

  // Authors endpoints
  router.get('/authors', controller.getAuthors);
  router.get('/authors/lookup', controller.lookupAuthors);

  // Search endpoints
  router.get('/search', controller.searchBooks);
  router.post('/books/:id/search', controller.triggerSearch);

  // Queue, history, calendar
  router.get('/queue', controller.getQueue);
  router.get('/history', controller.getHistory);
  router.get('/calendar', controller.getCalendar);

  // Configuration
  router.get('/profiles', controller.getProfiles);
  router.get('/metadataprofiles', controller.getMetadataProfiles);
  router.get('/rootfolders', controller.getRootFolders);

  // System
  router.get('/logs', controller.getLogs);
  router.get('/health', controller.getHealth);

  return router;
}
