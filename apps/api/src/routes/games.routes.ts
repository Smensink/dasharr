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

  // Get game details
  router.get('/:igdbId', controller.getGameDetails);

  // Get sequel/related game patterns
  router.get('/:igdbId/sequel-patterns', controller.getSequelPatterns);

  // Monitored games routes
  router.get('/monitored/all', controller.getMonitoredGames);
  router.post('/monitored/:igdbId', controller.monitorGame);
  router.delete('/monitored/:igdbId', controller.unmonitorGame);
  router.get('/monitored/:igdbId', controller.getMonitoredGame);

  // Download candidates (streaming)
  router.get('/:igdbId/candidates/stream', controller.searchDownloadCandidatesStream);

  // Download candidates (non-streaming fallback)
  router.get('/:igdbId/candidates', controller.searchDownloadCandidates);

  // Start download
  router.post('/:igdbId/download', controller.startDownload);

  // Manual check trigger
  router.post('/check', controller.checkMonitoredGames);

  // Test search agents
  router.get('/test/agents', controller.testSearchAgents);

  // Test search agents with enhanced IGDB matching
  router.get('/test/agents/enhanced/:igdbId', controller.testSearchAgentsEnhanced);

  // Test search with mock game data (no IGDB required)
  router.get('/test/agents/mock', controller.testSearchMock);

  // Test FitGirl RSS feed parsing
  router.get('/test/rss/fitgirl', controller.testFitGirlRss);

  // Test Prowlarr RSS feed parsing
  router.get('/test/rss/prowlarr', controller.testProwlarrRss);

  return router;
}
