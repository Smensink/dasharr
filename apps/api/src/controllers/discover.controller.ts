import { Request, Response, NextFunction } from 'express';
import { DiscoverService } from '../services/discover.service';
import { ServiceError, ValidationError } from '../middleware/errorHandler';

export class DiscoverController {
  constructor(private discoverService: DiscoverService) {}

  getSections = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = await this.discoverService.getSections();
      res.json(data);
    } catch (error) {
      next(new ServiceError('Failed to load discover sections', 'discover', 500, error));
    }
  };

  getTrending = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const type = this.parseType(req.params.type);
      const items = await this.discoverService.getTrending(type);
      res.json({ type, items });
    } catch (error) {
      next(
        error instanceof ValidationError
          ? error
          : new ServiceError('Failed to load trending items', 'discover', 500, error)
      );
    }
  };

  getPopular = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const type = this.parseType(req.params.type);
      const items = await this.discoverService.getPopular(type);
      res.json({ type, items });
    } catch (error) {
      next(
        error instanceof ValidationError
          ? error
          : new ServiceError('Failed to load popular items', 'discover', 500, error)
      );
    }
  };

  getUpcoming = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const items = await this.discoverService.getUpcoming();
      res.json({ items });
    } catch (error) {
      next(new ServiceError('Failed to load upcoming items', 'discover', 500, error));
    }
  };

  getNowPlaying = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const items = await this.discoverService.getNowPlaying();
      res.json({ items });
    } catch (error) {
      next(new ServiceError('Failed to load now playing items', 'discover', 500, error));
    }
  };

  getAnticipated = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const type = this.parseType(req.params.type);
      const items = await this.discoverService.getAnticipated(type);
      res.json({ type, items });
    } catch (error) {
      next(
        error instanceof ValidationError
          ? error
          : new ServiceError('Failed to load anticipated items', 'discover', 500, error)
      );
    }
  };

  getAwards = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const category = this.getParam(req.params.category);
      if (!category) {
        throw new ValidationError('Category is required');
      }
      if (![
        'oscars',
        'emmys',
        'golden-globes',
        'cannes',
        'aacta',
        'oscars-nominations',
        'emmys-nominations',
        'golden-globes-nominations',
        'cannes-nominations',
        'aacta-nominations',
      ].includes(category)) {
        throw new ValidationError(
          'Category must be one of: oscars, emmys, golden-globes, cannes, aacta, oscars-nominations, emmys-nominations, golden-globes-nominations, cannes-nominations, aacta-nominations'
        );
      }
      const items = await this.discoverService.getAwards(category);
      res.json({ category, items });
    } catch (error) {
      next(
        error instanceof ValidationError
          ? error
          : new ServiceError('Failed to load awards list', 'discover', 500, error)
      );
    }
  };

  resolveExternalIds = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const type = this.parseType(req.params.type);
      const rawId = this.getParam(req.params.tmdbId);
      const tmdbId = rawId ? Number(rawId) : NaN;
      if (!tmdbId || Number.isNaN(tmdbId)) {
        throw new ValidationError('TMDB id must be a number');
      }

      const ids = await this.discoverService.resolveExternalIds(type, tmdbId);
      res.json({ type, tmdbId, ...ids });
    } catch (error) {
      next(
        error instanceof ValidationError
          ? error
          : new ServiceError('Failed to resolve external ids', 'discover', 500, error)
      );
    }
  };

  private parseType(type: string | string[] | undefined) {
    const parsed = this.getParam(type);
    if (parsed === 'movie' || parsed === 'series') {
      return parsed;
    }
    throw new ValidationError('Type must be "movie" or "series"');
  }

  private getParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
