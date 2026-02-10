import { Router } from 'express';
import { GamesController } from '../controllers/games.controller';

export function createGamesRouter(controller: GamesController): Router {
  const router = Router();

  // Search games
  router.get('/search', controller.searchGames);

  // Get upcoming games
  router.get('/upcoming', controller.getUpcomingGames);

  // Get popular games
  router.get('/popular', controller.getPopularGames);

  // Get anticipated games
  router.get('/anticipated', controller.getAnticipatedGames);

  // Get top rated games
  router.get('/top-rated', controller.getTopRatedGames);

  // Get trending games
  router.get('/trending', controller.getTrendingGames);

  // Get game stats
  router.get('/stats', controller.getStats);

  // Monitored games routes (must be before /:igdbId to avoid shadowing)
  router.get('/monitored/all', controller.getMonitoredGames);
  router.post('/monitored/:igdbId', controller.monitorGame);
  router.delete('/monitored/:igdbId', controller.unmonitorGame);
  router.get('/monitored/:igdbId', controller.getMonitoredGame);

  // Manual check trigger
  router.post('/check', controller.checkMonitoredGames);

  // Test routes (must be before /:igdbId param routes)
  router.get('/test/agents', controller.testSearchAgents);
  router.get('/test/agents/enhanced/:igdbId', controller.testSearchAgentsEnhanced);
  router.get('/test/agents/mock', controller.testSearchMock);
  router.get('/test/rss/fitgirl', controller.testFitGirlRss);
  router.get('/test/rss/prowlarr', controller.testProwlarrRss);

  // Parameterized routes (must be last - /:igdbId catches anything)
  router.get('/:igdbId', controller.getGameDetails);
  router.get('/:igdbId/sequel-patterns', controller.getSequelPatterns);
  router.get('/:igdbId/candidates/stream', controller.searchDownloadCandidatesStream);
  router.get('/:igdbId/candidates', controller.searchDownloadCandidates);
  router.post('/:igdbId/download', controller.startDownload);

  return router;
}
