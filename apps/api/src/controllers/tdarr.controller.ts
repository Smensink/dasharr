import { Request, Response, NextFunction } from 'express';
import { TdarrService } from '../services/tdarr.service';
import { ServiceError } from '../middleware/errorHandler';

export class TdarrController {
  constructor(private service: TdarrService) {}

  getOverview = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const overview = await this.service.getOverview();
      res.json(overview);
    } catch (error) {
      next(new ServiceError('Failed to fetch Tdarr overview', 'tdarr', 500, error));
    }
  };

  updateWorkerLimit = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { nodeId, workerType, target } = req.body || {};
      if (!nodeId || !workerType || typeof target !== 'number') {
        res.status(400).json({ error: 'nodeId, workerType, and target are required' });
        return;
      }

      await this.service.updateWorkerLimit({ nodeId, workerType, target });
      res.json({ success: true });
    } catch (error) {
      next(new ServiceError('Failed to update Tdarr worker limit', 'tdarr', 500, error));
    }
  };

  requeueFailed = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { file, title, jobId } = req.body || {};
      if (!file) {
        res.status(400).json({ error: 'file is required' });
        return;
      }

      await this.service.requeueFailedJob({
        id: jobId || file,
        title: title || file,
        file,
        status: 'Transcode error',
      });

      res.json({ success: true });
    } catch (error) {
      next(new ServiceError('Failed to requeue Tdarr job', 'tdarr', 500, error));
    }
  };

  getHealth = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const health = await this.service.getHealth();
      res.json(health);
    } catch (error) {
      next(error);
    }
  };
}
