import { Request, Response, NextFunction } from 'express';
import { ProwlarrService } from '../services/prowlarr.service';
import { ServiceError } from '../middleware/errorHandler';

export class ProwlarrController {
  constructor(private prowlarrService: ProwlarrService) {}

  getIndexers = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const indexers = await this.prowlarrService.getIndexers();
      res.json(indexers);
    } catch (error) {
      next(new ServiceError('Failed to fetch indexers', 'prowlarr', 500, error));
    }
  };

  getIndexerById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const indexer = await this.prowlarrService.getIndexerById(id);
      res.json(indexer);
    } catch (error) {
      next(new ServiceError('Failed to fetch indexer', 'prowlarr', 500, error));
    }
  };

  addIndexer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const indexer = await this.prowlarrService.addIndexer(req.body);
      res.status(201).json(indexer);
    } catch (error) {
      next(new ServiceError('Failed to add indexer', 'prowlarr', 500, error));
    }
  };

  updateIndexer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const indexer = await this.prowlarrService.updateIndexer(id, req.body);
      res.json(indexer);
    } catch (error) {
      next(new ServiceError('Failed to update indexer', 'prowlarr', 500, error));
    }
  };

  deleteIndexer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      await this.prowlarrService.deleteIndexer(id);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to delete indexer', 'prowlarr', 500, error));
    }
  };

  testIndexer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const result = await this.prowlarrService.testIndexer(id);
      res.json(result);
    } catch (error) {
      next(new ServiceError('Failed to test indexer', 'prowlarr', 500, error));
    }
  };

  getIndexerStats = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const stats = await this.prowlarrService.getIndexerStats();
      res.json(stats);
    } catch (error) {
      next(
        new ServiceError('Failed to fetch indexer stats', 'prowlarr', 500, error)
      );
    }
  };

  search = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const results = await this.prowlarrService.search(req.query);
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to search indexers', 'prowlarr', 500, error));
    }
  };

  getHistory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const history = await this.prowlarrService.getHistory(req.query);
      res.json(history);
    } catch (error) {
      next(new ServiceError('Failed to fetch history', 'prowlarr', 500, error));
    }
  };

  getHealth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const health = await this.prowlarrService.getHealth();
      res.json(health);
    } catch (error) {
      next(new ServiceError('Failed to fetch health', 'prowlarr', 500, error));
    }
  };

  getTags = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const tags = await this.prowlarrService.getTags();
      res.json(tags);
    } catch (error) {
      next(new ServiceError('Failed to fetch tags', 'prowlarr', 500, error));
    }
  };

  getAppProfiles = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const profiles = await this.prowlarrService.getAppProfiles();
      res.json(profiles);
    } catch (error) {
      next(
        new ServiceError('Failed to fetch app profiles', 'prowlarr', 500, error)
      );
    }
  };
}
