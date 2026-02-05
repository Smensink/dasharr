import { Request, Response, NextFunction } from 'express';
import { RadarrService } from '../services/radarr.service';
import { ServiceError } from '../middleware/errorHandler';

export class RadarrController {
  constructor(private radarrService: RadarrService) {}

  getMovies = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const movies = await this.radarrService.getMovies(req.query);
      res.json(movies);
    } catch (error) {
      next(new ServiceError('Failed to fetch movies', 'radarr', 500, error));
    }
  };

  getMovieById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const movie = await this.radarrService.getMovieById(id);
      res.json(movie);
    } catch (error) {
      next(new ServiceError('Failed to fetch movie', 'radarr', 500, error));
    }
  };

  addMovie = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const movie = await this.radarrService.addMovie(req.body);
      res.status(201).json(movie);
    } catch (error: any) {
      // Extract validation errors from Radarr response
      if (error?.response?.status === 400 && error?.response?.data) {
        const errorData = error.response.data;
        let errorMessage = 'Failed to add movie';

        // Radarr returns an array of validation errors
        if (Array.isArray(errorData) && errorData.length > 0) {
          errorMessage = errorData.map((e: any) => e.errorMessage).join(', ');
        } else if (errorData.errorMessage) {
          errorMessage = errorData.errorMessage;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }

        next(new ServiceError(errorMessage, 'radarr', 400, error));
        return;
      }

      next(new ServiceError('Failed to add movie', 'radarr', 500, error));
    }
  };

  updateMovie = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const movie = await this.radarrService.updateMovie(id, req.body);
      res.json(movie);
    } catch (error) {
      next(new ServiceError('Failed to update movie', 'radarr', 500, error));
    }
  };

  deleteMovie = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const deleteFiles = req.query.deleteFiles as string === 'true';
      await this.radarrService.deleteMovie(id, deleteFiles);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to delete movie', 'radarr', 500, error));
    }
  };

  searchMovies = async (
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
      const results = await this.radarrService.searchMovie(query);
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to search movies', 'radarr', 500, error));
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
      await this.radarrService.triggerMovieSearch(id, interactive);
      res.status(202).json({ message: 'Search triggered' });
    } catch (error) {
      next(
        new ServiceError('Failed to trigger movie search', 'radarr', 500, error)
      );
    }
  };

  getQueue = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const queue = await this.radarrService.getQueue();
      res.json(queue);
    } catch (error) {
      next(new ServiceError('Failed to fetch queue', 'radarr', 500, error));
    }
  };

  getHistory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const history = await this.radarrService.getHistory(req.query);
      res.json(history);
    } catch (error) {
      next(new ServiceError('Failed to fetch history', 'radarr', 500, error));
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
      const calendar = await this.radarrService.getCalendar(params);
      res.json(calendar);
    } catch (error) {
      next(new ServiceError('Failed to fetch calendar', 'radarr', 500, error));
    }
  };

  getProfiles = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const profiles = await this.radarrService.getProfiles();
      res.json(profiles);
    } catch (error) {
      next(new ServiceError('Failed to fetch profiles', 'radarr', 500, error));
    }
  };

  getRootFolders = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const folders = await this.radarrService.getRootFolders();
      res.json(folders);
    } catch (error) {
      next(
        new ServiceError('Failed to fetch root folders', 'radarr', 500, error)
      );
    }
  };

  getLogs = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const logs = await this.radarrService.getLogs(req.query);
      res.json(logs);
    } catch (error) {
      next(new ServiceError('Failed to fetch logs', 'radarr', 500, error));
    }
  };

  getHealth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const health = await this.radarrService.getHealth();
      res.json(health);
    } catch (error) {
      next(new ServiceError('Failed to fetch health', 'radarr', 500, error));
    }
  };
}
