import { Request, Response, NextFunction } from 'express';
import { GamesService } from '../services/games/GamesService';
import { ServiceError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export class GamesController {
  constructor(private gamesService: GamesService) {}

  /**
   * Search games by name
   */
  searchGames = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = req.query.q as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      
      if (!query || query.trim().length < 2) {
        res.status(400).json({ error: 'Query must be at least 2 characters' });
        return;
      }
      
      const results = await this.gamesService.searchGames(query, limit);
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to search games', 'games', 500, error));
    }
  };

  /**
   * Get upcoming games
   */
  getUpcomingGames = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const results = await this.gamesService.getUpcomingGames(limit);
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to get upcoming games', 'games', 500, error));
    }
  };

  /**
   * Get popular games
   */
  getPopularGames = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const results = await this.gamesService.getPopularGames(limit);
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to get popular games', 'games', 500, error));
    }
  };

  /**
   * Get highly anticipated games
   */
  getAnticipatedGames = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const results = await this.gamesService.getAnticipatedGames(limit);
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to get anticipated games', 'games', 500, error));
    }
  };

  /**
   * Get top rated games of all time
   */
  getTopRatedGames = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const results = await this.gamesService.getTopRatedGames(limit);
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to get top rated games', 'games', 500, error));
    }
  };

  /**
   * Get trending games
   */
  getTrendingGames = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const results = await this.gamesService.getTrendingGames(limit);
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to get trending games', 'games', 500, error));
    }
  };

  /**
   * Get game details
   */
  getGameDetails = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const igdbIdParam = Array.isArray(req.params.igdbId) ? req.params.igdbId[0] : req.params.igdbId;
      const igdbId = parseInt(igdbIdParam, 10);
      
      if (isNaN(igdbId)) {
        res.status(400).json({ error: 'Invalid IGDB ID' });
        return;
      }
      
      const game = await this.gamesService.getGameDetails(igdbId);
      
      if (!game) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }
      
      res.json(game);
    } catch (error) {
      next(new ServiceError('Failed to get game details', 'games', 500, error));
    }
  };

  /**
   * Start monitoring a game
   */
  monitorGame = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const igdbIdParam = Array.isArray(req.params.igdbId) ? req.params.igdbId[0] : req.params.igdbId;
      const igdbId = parseInt(igdbIdParam, 10);
      
      if (isNaN(igdbId)) {
        res.status(400).json({ error: 'Invalid IGDB ID' });
        return;
      }
      
      const { preferredReleaseType, preferredPlatforms } = req.body;
      
      const monitoredGame = await this.gamesService.monitorGame(igdbId, {
        preferredReleaseType,
        preferredPlatforms,
      });
      
      res.json(monitoredGame);
    } catch (error) {
      next(new ServiceError('Failed to monitor game', 'games', 500, error));
    }
  };

  /**
   * Stop monitoring a game
   */
  unmonitorGame = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const igdbIdParam = Array.isArray(req.params.igdbId) ? req.params.igdbId[0] : req.params.igdbId;
      const igdbId = parseInt(igdbIdParam, 10);
      
      if (isNaN(igdbId)) {
        res.status(400).json({ error: 'Invalid IGDB ID' });
        return;
      }
      
      await this.gamesService.unmonitorGame(igdbId);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to unmonitor game', 'games', 500, error));
    }
  };

  /**
   * Get all monitored games
   */
  getMonitoredGames = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const games = this.gamesService.getMonitoredGames();
      res.json(games);
    } catch (error) {
      next(new ServiceError('Failed to get monitored games', 'games', 500, error));
    }
  };

  /**
   * Get monitored game by ID
   */
  getMonitoredGame = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const igdbIdParam = Array.isArray(req.params.igdbId) ? req.params.igdbId[0] : req.params.igdbId;
      const igdbId = parseInt(igdbIdParam, 10);
      
      if (isNaN(igdbId)) {
        res.status(400).json({ error: 'Invalid IGDB ID' });
        return;
      }
      
      const game = this.gamesService.getMonitoredGame(igdbId);
      
      if (!game) {
        res.status(404).json({ error: 'Game is not monitored' });
        return;
      }
      
      res.json(game);
    } catch (error) {
      next(new ServiceError('Failed to get monitored game', 'games', 500, error));
    }
  };

  /**
   * Get game stats
   */
  getStats = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const stats = this.gamesService.getStats();
      res.json(stats);
    } catch (error) {
      next(new ServiceError('Failed to get game stats', 'games', 500, error));
    }
  };

  /**
   * Search download candidates for a game (SSE streaming)
   */
  searchDownloadCandidatesStream = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const igdbIdParam = Array.isArray(req.params.igdbId) ? req.params.igdbId[0] : req.params.igdbId;
      const igdbId = parseInt(igdbIdParam, 10);

      if (isNaN(igdbId)) {
        res.status(400).json({ error: 'Invalid IGDB ID' });
        return;
      }

      const { releaseType, platform, strictPlatform } = req.query;

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      // Helper to send SSE message
      const sendEvent = (event: string, data: any) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Search with streaming callbacks
      await this.gamesService.searchDownloadCandidatesStreaming(igdbId, {
        releaseType: releaseType as any,
        platform: platform as string,
        strictPlatform: strictPlatform === 'true',
        onAgentStart: (agentName) => {
          sendEvent('agentStart', { agent: agentName });
        },
        onAgentResult: (agentName, candidates) => {
          sendEvent('agentResult', { agent: agentName, candidates, count: candidates.length });
        },
        onAgentError: (agentName, error) => {
          sendEvent('agentError', { agent: agentName, error });
        },
        onAgentComplete: (agentName) => {
          sendEvent('agentComplete', { agent: agentName });
        },
      });

      // Send completion event
      sendEvent('complete', { message: 'All agents finished' });
      res.end();
    } catch (error) {
      logger.error('Stream error:', error);
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: 'Failed to search download candidates' })}\n\n`);
      res.end();
    }
  };

  /**
   * Search download candidates for a game (non-streaming fallback)
   */
  searchDownloadCandidates = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const igdbIdParam = Array.isArray(req.params.igdbId) ? req.params.igdbId[0] : req.params.igdbId;
      const igdbId = parseInt(igdbIdParam, 10);

      if (isNaN(igdbId)) {
        res.status(400).json({ error: 'Invalid IGDB ID' });
        return;
      }

      const { releaseType, platform, strictPlatform } = req.query;

      const candidates = await this.gamesService.searchDownloadCandidates(igdbId, {
        releaseType: releaseType as any,
        platform: platform as string,
        strictPlatform: strictPlatform === 'true',
      });

      res.json(candidates);
    } catch (error) {
      next(new ServiceError('Failed to search download candidates', 'games', 500, error));
    }
  };

  /**
   * Start downloading a game
   */
  startDownload = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const igdbIdParam = Array.isArray(req.params.igdbId) ? req.params.igdbId[0] : req.params.igdbId;
      const igdbId = parseInt(igdbIdParam, 10);
      
      if (isNaN(igdbId)) {
        res.status(400).json({ error: 'Invalid IGDB ID' });
        return;
      }
      
      const { candidate, downloadClient } = req.body;
      
      if (!candidate) {
        res.status(400).json({ error: 'Download candidate is required' });
        return;
      }
      
      await this.gamesService.startDownload(igdbId, candidate, downloadClient || 'qbittorrent');
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to start download', 'games', 500, error));
    }
  };

  /**
   * Manually trigger check for monitored games
   */
  checkMonitoredGames = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Run the check in background
      this.gamesService.checkMonitoredGames().catch(error => {
        logger.error('Background check for monitored games failed:', error);
      });
      
      res.json({ message: 'Check started in background' });
    } catch (error) {
      next(new ServiceError('Failed to check monitored games', 'games', 500, error));
    }
  };

  /**
   * Test FitGirl RSS feed parsing
   */
  testFitGirlRss = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const results = await this.gamesService.testFitGirlRss();
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to test FitGirl RSS', 'games', 500, error));
    }
  };

  /**
   * Test Prowlarr RSS feed parsing
   */
  testProwlarrRss = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const results = await this.gamesService.testProwlarrRss();
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to test Prowlarr RSS', 'games', 500, error));
    }
  };

  /**
   * Test search agents
   */
  testSearchAgents = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = req.query.q as string;
      
      if (!query || query.trim().length < 2) {
        res.status(400).json({ error: 'Query must be at least 2 characters' });
        return;
      }
      
      const results = await this.gamesService.testSearchAgents(query);
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to test search agents', 'games', 500, error));
    }
  };

  /**
   * Test search agents with enhanced IGDB-based matching
   */
  testSearchAgentsEnhanced = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const igdbIdParam = Array.isArray(req.params.igdbId) ? req.params.igdbId[0] : req.params.igdbId;
      const igdbId = parseInt(igdbIdParam, 10);
      
      if (isNaN(igdbId)) {
        res.status(400).json({ error: 'Invalid IGDB ID' });
        return;
      }
      
      const { game, results } = await this.gamesService.testSearchAgentsEnhanced(igdbId);
      
      if (!game) {
        res.status(404).json({ error: 'Game not found in IGDB' });
        return;
      }
      
      res.json({
        game: {
          igdbId: game.id,
          name: game.name,
          slug: game.slug,
          releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString().split('T')[0] : undefined,
          platforms: game.platforms?.map(p => p.name),
        },
        results,
      });
    } catch (error) {
      next(new ServiceError('Failed to test enhanced search agents', 'games', 500, error));
    }
  };

  /**
   * Test search with mock game data (no IGDB lookup required)
   */
  testSearchMock = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const gameName = req.query.name as string;
      const gameYear = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
      const alternativeNames = req.query.alt ? (req.query.alt as string).split(',') : undefined;
      const steamAppId = req.query.steamAppId ? parseInt(req.query.steamAppId as string, 10) : undefined;

      if (!gameName) {
        res.status(400).json({ error: 'Game name is required (use ?name=...)' });
        return;
      }

      const { game, results } = await this.gamesService.testSearchWithMockData(
        gameName,
        gameYear,
        alternativeNames,
        steamAppId
      );

      res.json({ game, results });
    } catch (error) {
      next(new ServiceError('Failed to test mock search', 'games', 500, error));
    }
  };
}
