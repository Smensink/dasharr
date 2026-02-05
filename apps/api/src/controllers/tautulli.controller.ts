import { Request, Response, NextFunction } from 'express';
import { TautulliService } from '../services/tautulli.service';
import { ServiceError } from '../middleware/errorHandler';

export class TautulliController {
  constructor(private tautulliService: TautulliService) {}

  getActivity = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const activity = await this.tautulliService.getActivityTransformed();
      res.json(activity);
    } catch (error) {
      next(new ServiceError('Failed to fetch Tautulli activity', 'tautulli', 500, error));
    }
  };

  getHistory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const history = await this.tautulliService.getHistory(limit);
      res.json(history);
    } catch (error) {
      next(new ServiceError('Failed to fetch Tautulli history', 'tautulli', 500, error));
    }
  };

  getWatchStats = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const libraryId = req.query.libraryId as string | undefined;
      const stats = await this.tautulliService.getLibraryWatchStats(libraryId);
      res.json(stats);
    } catch (error) {
      next(new ServiceError('Failed to fetch Tautulli watch stats', 'tautulli', 500, error));
    }
  };

  getHomeStats = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const stats = await this.tautulliService.getHomeStatsTransformed();
      res.json(stats);
    } catch (error) {
      next(new ServiceError('Failed to fetch Tautulli home stats', 'tautulli', 500, error));
    }
  };

  getHealth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const health = await this.tautulliService.getHealth();
      res.json(health);
    } catch (error) {
      next(new ServiceError('Failed to fetch Tautulli health', 'tautulli', 500, error));
    }
  };
}
