import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class ServiceError extends Error {
  constructor(
    message: string,
    public service: string,
    public statusCode: number = 500,
    public originalError?: any
  ) {
    super(message);
    this.name = 'ServiceError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'ValidationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ServiceError) {
    logger.error(
      `[${err.service}] ${err.message}`,
      err.originalError || err.stack
    );

    res.status(err.statusCode).json({
      error: {
        message: err.message,
        service: err.service,
        code: err.statusCode,
      },
    });
    return;
  }

  if (err instanceof ValidationError) {
    logger.warn(`Validation error: ${err.message}`);

    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.statusCode,
      },
    });
    return;
  }

  // Unhandled errors
  logger.error('Unhandled error:', err);

  res.status(500).json({
    error: {
      message:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message,
      code: 500,
    },
  });
}

export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 404,
    },
  });
}
