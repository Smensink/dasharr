import { Request, Response, NextFunction } from 'express';
import { getLogEntries } from '../utils/log-store';
import { ServiceError } from '../middleware/errorHandler';
import type { LogEntry } from '@dasharr/shared-types';

export class DasharrController {
  getLogs = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const level = req.query.level as LogEntry['level'] | undefined;
      const page = req.query.page ? Number(req.query.page) : 1;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 50;

      const logs = getLogEntries({ level, page, pageSize });
      res.json(logs);
    } catch (error) {
      next(new ServiceError('Failed to fetch Dasharr logs', 'dasharr', 500, error));
    }
  };
}
