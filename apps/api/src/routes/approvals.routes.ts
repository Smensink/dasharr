import { Router, Request, Response, NextFunction } from 'express';
import { pendingMatchesService } from '../services/pending-matches.service';
import { GamesService } from '../services/games/GamesService';
import { logger } from '../utils/logger';

export function createApprovalsRouter(getGamesService: () => GamesService | undefined): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const groups = pendingMatchesService.getPendingMatchesGrouped();
    res.json({ success: true, groups });
  });

  router.get('/count', (req: Request, res: Response) => {
    const count = pendingMatchesService.getPendingCount();
    res.json({ success: true, count });
  });

  router.post('/:matchId/approve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gamesService = getGamesService();
      if (!gamesService) {
        res.status(503).json({ error: 'Games service not available' });
        return;
      }

      await gamesService.approveAndDownload(req.params.matchId as string);
      res.json({ success: true });
    } catch (error: any) {
      logger.error(`[Approvals] Approve failed:`, error);
      res.status(400).json({ error: error.message || 'Failed to approve match' });
    }
  });

  router.post('/:matchId/reject', (req: Request, res: Response) => {
    const match = pendingMatchesService.rejectMatch(req.params.matchId as string);
    if (!match) {
      res.status(404).json({ error: 'Match not found or already resolved' });
      return;
    }
    const gamesService = getGamesService();
    gamesService?.refreshGameWantedStatus(match.igdbId);
    res.json({ success: true });
  });

  router.post('/game/:igdbId/reject-all', (req: Request, res: Response) => {
    const igdbId = parseInt(req.params.igdbId as string, 10);
    if (isNaN(igdbId)) {
      res.status(400).json({ error: 'Invalid IGDB ID' });
      return;
    }
    const count = pendingMatchesService.rejectAllForGame(igdbId);
    const gamesService = getGamesService();
    gamesService?.refreshGameWantedStatus(igdbId);
    res.json({ success: true, rejected: count });
  });

  return router;
}
