import express, { Express } from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { config } from './config/services.config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth.middleware';
import { createApiRouter, ServiceControllers } from './routes';
import { logger } from './utils/logger';
import { PlexAuthService } from './services/plex-auth.service';
import { AuthController } from './controllers/auth.controller';
import { createAuthRoutes } from './routes/auth.routes';
import path from 'path';

export function createApp(controllers: ServiceControllers): Express {
  const app = express();
  if (config.auth.cookieSecure) {
    app.set('trust proxy', 1);
  }

  // Middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(limiter);

  // Auth routes (always available)
  const plexAuthService = new PlexAuthService();
  const authController = new AuthController(plexAuthService);
  app.use('/api/v1/auth', createAuthRoutes(authController));

  // API routes (protected if auth enabled)
  if (config.auth.enabled) {
    app.use('/api/v1', authMiddleware);
  }
  app.use('/api/v1', createApiRouter(controllers));

  // Serve frontend static files in production
  if (config.nodeEnv === 'production') {
    const publicPath = path.join(__dirname, '../public');
    app.use(express.static(publicPath));

    // SPA fallback - serve index.html for all non-API routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(publicPath, 'index.html'));
    });
  }

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
