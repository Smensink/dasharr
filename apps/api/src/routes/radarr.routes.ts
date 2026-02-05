import { Router } from 'express';
import { RadarrController } from '../controllers/radarr.controller';

export function createRadarrRouter(controller: RadarrController): Router {
  const router = Router();

  // Movies endpoints
  router.get('/movies', controller.getMovies);
  router.get('/movies/:id', controller.getMovieById);
  router.post('/movies', controller.addMovie);
  router.put('/movies/:id', controller.updateMovie);
  router.delete('/movies/:id', controller.deleteMovie);

  // Search endpoints
  router.get('/search', controller.searchMovies);
  router.post('/movies/:id/search', controller.triggerSearch);

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
