import { config, validateConfig } from './config/services.config';
import { createApp } from './app';
import { logger } from './utils/logger';
import { serviceRegistry } from './services/service-registry';

async function startServer(): Promise<void> {
  try {
    // Validate configuration
    try {
      validateConfig(config);
      logger.info('Configuration validated successfully');
    } catch (error) {
      logger.error('Configuration validation failed:', error);
      process.exit(1);
    }

    // Initialize services
    logger.info('Initializing services...');
    const controllers = await serviceRegistry.initializeAllServices();

    // Create Express app
    const app = createApp(controllers);

    // Start server
    const port = config.port;
    app.listen(port, () => {
      logger.info(`🚀 DashArr server running on port ${port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(
        `Enabled services: ${Object.keys(controllers).join(', ') || 'none'}`
      );
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();
