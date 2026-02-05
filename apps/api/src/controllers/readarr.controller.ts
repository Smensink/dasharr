import { Request, Response, NextFunction } from 'express';
import { ReadarrService } from '../services/readarr.service';
import { ServiceError } from '../middleware/errorHandler';

export class ReadarrController {
  constructor(private readarrService: ReadarrService) {}

  getBooks = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const books = await this.readarrService.getBooks(req.query);
      res.json(books);
    } catch (error) {
      next(new ServiceError('Failed to fetch books', 'readarr', 500, error));
    }
  };

  getBookById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const book = await this.readarrService.getBookById(id);
      res.json(book);
    } catch (error) {
      next(new ServiceError('Failed to fetch book', 'readarr', 500, error));
    }
  };

  addBook = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const book = await this.readarrService.addBook(req.body);
      res.status(201).json(book);
    } catch (error: any) {
      // Extract validation errors from Readarr response
      if (error?.response?.status === 400 && error?.response?.data) {
        const errorData = error.response.data;
        let errorMessage = 'Failed to add book';

        // Readarr returns an array of validation errors
        if (Array.isArray(errorData) && errorData.length > 0) {
          errorMessage = errorData.map((e: any) => e.errorMessage).join(', ');
        } else if (errorData.errorMessage) {
          errorMessage = errorData.errorMessage;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }

        next(new ServiceError(errorMessage, 'readarr', 400, error));
        return;
      }

      if (error?.response?.data?.message) {
        next(new ServiceError(error.response.data.message, 'readarr', 500, error));
        return;
      }

      next(new ServiceError('Failed to add book', 'readarr', 500, error));
    }
  };

  updateBook = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const book = await this.readarrService.updateBook(id, req.body);
      res.json(book);
    } catch (error) {
      next(new ServiceError('Failed to update book', 'readarr', 500, error));
    }
  };

  deleteBook = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const deleteFiles = req.query.deleteFiles as string === 'true';
      await this.readarrService.deleteBook(id, deleteFiles);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to delete book', 'readarr', 500, error));
    }
  };

  searchBooks = async (
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
      const results = await this.readarrService.searchBooks(query);
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to search books', 'readarr', 500, error));
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
      await this.readarrService.triggerBookSearch(id, interactive);
      res.status(202).json({ message: 'Search triggered' });
    } catch (error) {
      next(
        new ServiceError('Failed to trigger book search', 'readarr', 500, error)
      );
    }
  };

  getAuthors = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authors = await this.readarrService.getAuthors();
      res.json(authors);
    } catch (error) {
      next(new ServiceError('Failed to fetch authors', 'readarr', 500, error));
    }
  };

  lookupAuthors = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const term = (req.query.term as string)?.trim();
      if (!term) {
        res.status(400).json({ error: 'Query parameter "term" is required' });
        return;
      }
      const authors = await this.readarrService.lookupAuthors(term);
      res.json(authors);
    } catch (error) {
      next(new ServiceError('Failed to lookup authors', 'readarr', 500, error));
    }
  };

  getQueue = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const queue = await this.readarrService.getQueue();
      res.json(queue);
    } catch (error) {
      next(new ServiceError('Failed to fetch queue', 'readarr', 500, error));
    }
  };

  getHistory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const history = await this.readarrService.getHistory(req.query);
      res.json(history);
    } catch (error) {
      next(new ServiceError('Failed to fetch history', 'readarr', 500, error));
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
      const calendar = await this.readarrService.getCalendar(params);
      res.json(calendar);
    } catch (error) {
      next(new ServiceError('Failed to fetch calendar', 'readarr', 500, error));
    }
  };

  getProfiles = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const profiles = await this.readarrService.getProfiles();
      res.json(profiles);
    } catch (error) {
      next(new ServiceError('Failed to fetch profiles', 'readarr', 500, error));
    }
  };

  getMetadataProfiles = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const profiles = await this.readarrService.getMetadataProfiles();
      res.json(profiles);
    } catch (error) {
      next(
        new ServiceError(
          'Failed to fetch metadata profiles',
          'readarr',
          500,
          error
        )
      );
    }
  };

  getRootFolders = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const folders = await this.readarrService.getRootFolders();
      res.json(folders);
    } catch (error) {
      next(
        new ServiceError('Failed to fetch root folders', 'readarr', 500, error)
      );
    }
  };

  getLogs = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const logs = await this.readarrService.getLogs(req.query);
      res.json(logs);
    } catch (error) {
      next(new ServiceError('Failed to fetch logs', 'readarr', 500, error));
    }
  };

  getHealth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const health = await this.readarrService.getHealth();
      res.json(health);
    } catch (error) {
      next(new ServiceError('Failed to fetch health', 'readarr', 500, error));
    }
  };
}
