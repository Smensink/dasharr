import { Request, Response, NextFunction } from 'express';
import { HydraLibraryService } from '../services/games/HydraLibraryService';
import { appSettingsService } from '../services/app-settings.service';
import { CacheService } from '../services/cache.service';
import { logger } from '../utils/logger';

export class HydraController {
  private hydraService: HydraLibraryService;

  constructor(cacheService: CacheService) {
    this.hydraService = new HydraLibraryService(
      cacheService,
      appSettingsService.getHydraSettings()
    );

    // Listen for settings changes
    appSettingsService.onChange((settings) => {
      this.hydraService.updateSettings(settings.hydra);
    });
  }

  /**
   * Get all available Hydra sources
   */
  getSources = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const sources = this.hydraService.getAvailableSources();
      res.json({
        success: true,
        sources,
      });
    } catch (error) {
      logger.error('[HydraController] Failed to get sources:', error);
      next(error);
    }
  };

  /**
   * Get Hydra settings
   */
  getSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const settings = this.hydraService.getSettings();
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      logger.error('[HydraController] Failed to get settings:', error);
      next(error);
    }
  };

  /**
   * Update Hydra settings
   */
  updateSettings = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const updates = req.body;
      appSettingsService.updateHydraSettings(updates);

      res.json({
        success: true,
        settings: appSettingsService.getHydraSettings(),
      });
    } catch (error) {
      logger.error('[HydraController] Failed to update settings:', error);
      next(error);
    }
  };

  /**
   * Search for a game using Hydra library
   */
  searchGame = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const rawQuery = req.query.q;
      const gameName = typeof rawQuery === 'string' ? rawQuery : Array.isArray(rawQuery) && typeof rawQuery[0] === 'string' ? rawQuery[0] : '';

      if (!gameName || gameName.trim().length < 2) {
        res.status(400).json({ error: 'Query must be at least 2 characters' });
        return;
      }

      const results = await this.hydraService.searchGame(gameName);

      res.json({
        success: true,
        query: gameName,
        results,
      });
    } catch (error) {
      logger.error('[HydraController] Search failed:', error);
      next(error);
    }
  };

  /**
   * Get sources by trust level
   */
  getSourcesByTrustLevel = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    try {
      const level = req.params.level as string;
      const validLevels = ['trusted', 'safe', 'abandoned', 'unsafe', 'nsfw'];

      if (!validLevels.includes(level)) {
        res.status(400).json({ error: 'Invalid trust level' });
        return;
      }

      const sources = this.hydraService.getSourcesByTrustLevel([level as any]);
      res.json({
        success: true,
        level,
        sources,
      });
    } catch (error) {
      logger.error('[HydraController] Failed to get sources by level:', error);
      next(error);
    }
  };

  /**
   * Refresh Hydra source data
   */
  refreshSources = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.hydraService.clearCache();

      res.json({
        success: true,
        message: 'Hydra library cache cleared',
      });
    } catch (error) {
      logger.error('[HydraController] Failed to refresh sources:', error);
      next(error);
    }
  };
}
