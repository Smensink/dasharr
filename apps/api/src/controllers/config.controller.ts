import { Request, Response, NextFunction } from 'express';
import { configService } from '../services/config.service';
import { serviceRegistry } from '../services/service-registry';
import { ServiceError } from '../middleware/errorHandler';

export class ConfigController {
  /**
   * Get all service configurations
   */
  getConfig = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const config = configService.getConfig();

      // Mask sensitive data in response
      const maskedConfig = {
        services: Object.entries(config.services).reduce((acc, [name, cfg]) => {
          acc[name] = {
            enabled: cfg.enabled,
            baseUrl: cfg.baseUrl,
            // Only show if values exist, mask actual values
            hasApiKey: !!cfg.apiKey,
            hasUsername: !!cfg.username,
            hasPassword: !!cfg.password,
            hasClientId: !!cfg.clientId,
            hasClientSecret: !!cfg.clientSecret,
          };
          return acc;
        }, {} as any),
      };

      res.json(maskedConfig);
    } catch (error) {
      next(
        new ServiceError('Failed to get configuration', 'config', 500, error)
      );
    }
  };

  /**
   * Get configuration for a specific service
   */
  getServiceConfig = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const service = req.params.service as string;
      const config = configService.getServiceConfig(service);

      if (!config) {
        res.status(404).json({ error: `Service ${service} not found` });
        return;
      }

      // Mask sensitive data
      const maskedConfig = {
        enabled: config.enabled,
        baseUrl: config.baseUrl,
        hasApiKey: !!config.apiKey,
        hasUsername: !!config.username,
        hasPassword: !!config.password,
        hasClientId: !!config.clientId,
        hasClientSecret: !!config.clientSecret,
      };

      res.json(maskedConfig);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update configuration for a specific service
   */
  updateServiceConfig = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const service = req.params.service as string;
      const updates = req.body;

      // Validate that at least one field is provided
      if (!updates || Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'No configuration updates provided' });
        return;
      }

      // Update the configuration
      configService.updateServiceConfig(service, updates);

      // Reinitialize the service with new configuration and get connection result
      const connectionResult = await serviceRegistry.reinitializeService(service);

      res.json({
        success: true,
        message: `Configuration updated for ${service}`,
        connection: connectionResult
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unknown service')) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(
        new ServiceError(
          'Failed to update configuration',
          'config',
          500,
          error
        )
      );
    }
  };
}
