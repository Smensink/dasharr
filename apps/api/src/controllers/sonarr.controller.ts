import { Request, Response, NextFunction } from 'express';
import { SonarrService } from '../services/sonarr.service';
import { ServiceError } from '../middleware/errorHandler';

export class SonarrController {
  constructor(private sonarrService: SonarrService) {}

  getSeries = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const series = await this.sonarrService.getSeries(req.query);
      res.json(series);
    } catch (error) {
      next(new ServiceError('Failed to fetch series', 'sonarr', 500, error));
    }
  };

  getSeriesById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const series = await this.sonarrService.getSeriesById(id);
      res.json(series);
    } catch (error) {
      next(new ServiceError('Failed to fetch series', 'sonarr', 500, error));
    }
  };

  getEpisodes = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const episodes = await this.sonarrService.getEpisodes(id);
      res.json(episodes);
    } catch (error) {
      next(new ServiceError('Failed to fetch episodes', 'sonarr', 500, error));
    }
  };

  addSeries = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const series = await this.sonarrService.addSeries(req.body);
      res.status(201).json(series);
    } catch (error: any) {
      // Extract validation errors from Sonarr response
      if (error?.response?.status === 400 && error?.response?.data) {
        const errorData = error.response.data;
        let errorMessage = 'Failed to add series';

        // Sonarr returns an array of validation errors
        if (Array.isArray(errorData) && errorData.length > 0) {
          errorMessage = errorData.map((e: any) => e.errorMessage).join(', ');
        } else if (errorData.errorMessage) {
          errorMessage = errorData.errorMessage;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }

        next(new ServiceError(errorMessage, 'sonarr', 400, error));
        return;
      }

      next(new ServiceError('Failed to add series', 'sonarr', 500, error));
    }
  };

  updateSeries = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const series = await this.sonarrService.updateSeries(id, req.body);
      res.json(series);
    } catch (error) {
      next(new ServiceError('Failed to update series', 'sonarr', 500, error));
    }
  };

  deleteSeries = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const deleteFiles = req.query.deleteFiles as string === 'true';
      await this.sonarrService.deleteSeries(id, deleteFiles);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to delete series', 'sonarr', 500, error));
    }
  };

  searchSeries = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = req.query.q as string;
      if (!query) {
        res.status(400).json({ error: 'Query parameter "q" is required' });
        return;
      }
      const results = await this.sonarrService.searchSeries(query);
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to search series', 'sonarr', 500, error));
    }
  };

  triggerSearch = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const interactive = req.body.interactive === true;
      const seasonNumber =
        typeof req.body.seasonNumber === 'number'
          ? req.body.seasonNumber
          : req.body.seasonNumber !== undefined
            ? parseInt(req.body.seasonNumber, 10)
            : undefined;
      const episodeIds = Array.isArray(req.body.episodeIds)
        ? req.body.episodeIds
            .map((episodeId: any) => Number(episodeId))
            .filter((episodeId: number) => Number.isFinite(episodeId))
        : undefined;

      if (episodeIds && episodeIds.length > 0) {
        await this.sonarrService.triggerEpisodeSearch(episodeIds, interactive);
      } else if (Number.isFinite(seasonNumber)) {
        await this.sonarrService.triggerSeasonSearch(
          id,
          seasonNumber as number,
          interactive
        );
      } else {
        await this.sonarrService.triggerSeriesSearch(id, interactive);
      }
      res.status(202).json({ message: 'Search triggered' });
    } catch (error) {
      next(
        new ServiceError('Failed to trigger series search', 'sonarr', 500, error)
      );
    }
  };

  getQueue = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const queue = await this.sonarrService.getQueue();
      res.json(queue);
    } catch (error) {
      next(new ServiceError('Failed to fetch queue', 'sonarr', 500, error));
    }
  };

  getHistory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const history = await this.sonarrService.getHistory(req.query);
      res.json(history);
    } catch (error) {
      next(new ServiceError('Failed to fetch history', 'sonarr', 500, error));
    }
  };

  getCalendar = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const params: any = {};
      if (req.query.start as string) {
        params.start = new Date(req.query.start as string);
      }
      if (req.query.end as string) {
        params.end = new Date(req.query.end as string);
      }
      const calendar = await this.sonarrService.getCalendar(params);
      res.json(calendar);
    } catch (error) {
      next(new ServiceError('Failed to fetch calendar', 'sonarr', 500, error));
    }
  };

  getProfiles = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const profiles = await this.sonarrService.getProfiles();
      res.json(profiles);
    } catch (error) {
      next(new ServiceError('Failed to fetch profiles', 'sonarr', 500, error));
    }
  };

  getRootFolders = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const folders = await this.sonarrService.getRootFolders();
      res.json(folders);
    } catch (error) {
      next(
        new ServiceError('Failed to fetch root folders', 'sonarr', 500, error)
      );
    }
  };

  getLogs = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const logs = await this.sonarrService.getLogs(req.query);
      res.json(logs);
    } catch (error) {
      next(new ServiceError('Failed to fetch logs', 'sonarr', 500, error));
    }
  };

  getHealth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const health = await this.sonarrService.getHealth();
      res.json(health);
    } catch (error) {
      next(new ServiceError('Failed to fetch health', 'sonarr', 500, error));
    }
  };
}
