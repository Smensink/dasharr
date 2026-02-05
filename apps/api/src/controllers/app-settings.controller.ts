import { Request, Response, NextFunction } from 'express';
import { appSettingsService } from '../services/app-settings.service';
import { logger } from '../utils/logger';

export class AppSettingsController {
  /**
   * Get all application settings
   */
  getSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const settings = appSettingsService.getSettings();
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      logger.error('[AppSettingsController] Failed to get settings:', error);
      next(error);
    }
  };

  /**
   * Update all settings
   */
  updateSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const updates = req.body;
      appSettingsService.updateSettings(updates);
      
      logger.info('[AppSettingsController] Settings updated');
      res.json({
        success: true,
        settings: appSettingsService.getSettings(),
      });
    } catch (error) {
      logger.error('[AppSettingsController] Failed to update settings:', error);
      next(error);
    }
  };

  /**
   * Get games settings
   */
  getGamesSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const settings = appSettingsService.getGamesSettings();
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update games settings
   */
  updateGamesSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const updates = req.body;
      appSettingsService.updateGamesSettings(updates);
      
      logger.info('[AppSettingsController] Games settings updated');
      res.json({
        success: true,
        settings: appSettingsService.getGamesSettings(),
      });
    } catch (error) {
      logger.error('[AppSettingsController] Failed to update games settings:', error);
      next(error);
    }
  };

  /**
   * Get downloads settings
   */
  getDownloadsSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const settings = appSettingsService.getDownloadsSettings();
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update downloads settings
   */
  updateDownloadsSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const updates = req.body;
      appSettingsService.updateDownloadsSettings(updates);
      
      logger.info('[AppSettingsController] Downloads settings updated');
      res.json({
        success: true,
        settings: appSettingsService.getDownloadsSettings(),
      });
    } catch (error) {
      logger.error('[AppSettingsController] Failed to update downloads settings:', error);
      next(error);
    }
  };

  /**
   * Get cache settings
   */
  getCacheSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const settings = appSettingsService.getCacheSettings();
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update cache settings
   */
  updateCacheSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const updates = req.body;
      appSettingsService.updateCacheSettings(updates);
      
      logger.info('[AppSettingsController] Cache settings updated');
      res.json({
        success: true,
        settings: appSettingsService.getCacheSettings(),
      });
    } catch (error) {
      logger.error('[AppSettingsController] Failed to update cache settings:', error);
      next(error);
    }
  };

  /**
   * Get system settings
   */
  getSystemSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const settings = appSettingsService.getSystemSettings();
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update system settings
   */
  updateSystemSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const updates = req.body;
      appSettingsService.updateSystemSettings(updates);
      
      logger.info('[AppSettingsController] System settings updated');
      res.json({
        success: true,
        settings: appSettingsService.getSystemSettings(),
      });
    } catch (error) {
      logger.error('[AppSettingsController] Failed to update system settings:', error);
      next(error);
    }
  };

  /**
   * Get Tdarr settings
   */
  getTdarrSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const settings = appSettingsService.getTdarrSettings();
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update Tdarr settings
   */
  updateTdarrSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const updates = req.body;
      appSettingsService.updateTdarrSettings(updates);
      
      logger.info('[AppSettingsController] Tdarr settings updated');
      res.json({
        success: true,
        settings: appSettingsService.getTdarrSettings(),
      });
    } catch (error) {
      logger.error('[AppSettingsController] Failed to update Tdarr settings:', error);
      next(error);
    }
  };

  /**
   * Get FlareSolverr settings
   */
  getFlareSolverrSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const settings = appSettingsService.getFlareSolverrSettings();
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update FlareSolverr settings
   */
  updateFlareSolverrSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const updates = req.body;
      appSettingsService.updateFlareSolverrSettings(updates);
      
      logger.info('[AppSettingsController] FlareSolverr settings updated');
      res.json({
        success: true,
        settings: appSettingsService.getFlareSolverrSettings(),
      });
    } catch (error) {
      logger.error('[AppSettingsController] Failed to update FlareSolverr settings:', error);
      next(error);
    }
  };

  /**
   * Get Hydra settings
   */
  getHydraSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const settings = appSettingsService.getHydraSettings();
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update Hydra settings
   */
  updateHydraSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const updates = req.body;
      appSettingsService.updateHydraSettings(updates);
      
      logger.info('[AppSettingsController] Hydra settings updated');
      res.json({
        success: true,
        settings: appSettingsService.getHydraSettings(),
      });
    } catch (error) {
      logger.error('[AppSettingsController] Failed to update Hydra settings:', error);
      next(error);
    }
  };

  /**
   * Reset all settings to defaults
   */
  resetToDefaults = (req: Request, res: Response, next: NextFunction): void => {
    try {
      appSettingsService.resetToDefaults();
      
      logger.info('[AppSettingsController] Settings reset to defaults');
      res.json({
        success: true,
        settings: appSettingsService.getSettings(),
      });
    } catch (error) {
      logger.error('[AppSettingsController] Failed to reset settings:', error);
      next(error);
    }
  };

  /**
   * Get default values for reference
   */
  getDefaults = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const defaults = appSettingsService.getDefaults();
      res.json({
        success: true,
        defaults,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const appSettingsController = new AppSettingsController();
