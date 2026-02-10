import { Request, Response } from 'express';
import { DDLDownloadService } from '../services/ddl-download.service';
import { GamesService } from '../services/games/GamesService';
import { GameDownloadCandidate, DDLDownload } from '@dasharr/shared-types';
import { logger } from '../utils/logger';

export interface DDLControllerConfig {
  ddlService: DDLDownloadService;
  gamesService: GamesService;
}

export class DDLController {
  private ddlService: DDLDownloadService;
  private gamesService: GamesService;

  constructor(config: DDLControllerConfig) {
    this.ddlService = config.ddlService;
    this.gamesService = config.gamesService;

    // Set up event listeners for downloads
    this.setupEventListeners();
  }

  /**
   * Get DDL service settings
   */
  getSettings = async (req: Request, res: Response): Promise<void> => {
    try {
      const settings = this.ddlService.getSettings();
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      logger.error('[DDL] Error getting settings:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Update DDL service settings
   */
  updateSettings = async (req: Request, res: Response): Promise<void> => {
    try {
      const { downloadPath, maxConcurrentDownloads, maxRetries, createGameSubfolders } = req.body;

      this.ddlService.updateSettings({
        downloadPath,
        maxConcurrentDownloads,
        maxRetries,
        createGameSubfolders,
      });

      res.json({
        success: true,
        settings: this.ddlService.getSettings(),
      });
    } catch (error) {
      logger.error('[DDL] Error updating settings:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Start a new DDL download
   */
  startDownload = async (req: Request, res: Response): Promise<void> => {
    try {
      const { igdbId, candidate } = req.body;

      if (!candidate || !candidate.directDownloadUrl) {
        res.status(400).json({
          success: false,
          error: 'No direct download URL provided',
        });
        return;
      }

      // Get game details if igdbId provided
      let gameName = candidate.title;
      if (igdbId) {
        const game = await this.gamesService.getGameDetails(igdbId);
        if (game) {
          gameName = game.name;
        }
      }

      const download = await this.ddlService.startDownload(
        gameName,
        candidate as GameDownloadCandidate,
        igdbId
      );

      res.json({
        success: true,
        download,
      });
    } catch (error) {
      logger.error('[DDL] Error starting download:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Cancel a download
   */
  cancelDownload = async (req: Request, res: Response): Promise<void> => {
    try {
      const downloadId = Array.isArray(req.params.downloadId) 
        ? req.params.downloadId[0] 
        : req.params.downloadId;

      const cancelled = await this.ddlService.cancelDownload(downloadId);

      if (!cancelled) {
        res.status(404).json({
          success: false,
          error: 'Download not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Download cancelled',
      });
    } catch (error) {
      logger.error('[DDL] Error cancelling download:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Get all downloads
   */
  getDownloads = async (req: Request, res: Response): Promise<void> => {
    try {
      const downloads = this.ddlService.getAllDownloads();

      res.json({
        success: true,
        downloads,
        activeCount: this.ddlService.getActiveCount(),
        queuedCount: this.ddlService.getQueuedCount(),
      });
    } catch (error) {
      logger.error('[DDL] Error getting downloads:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Get a specific download
   */
  getDownload = async (req: Request, res: Response): Promise<void> => {
    try {
      const downloadId = Array.isArray(req.params.downloadId) 
        ? req.params.downloadId[0] 
        : req.params.downloadId;

      const download = this.ddlService.getDownload(downloadId);

      if (!download) {
        res.status(404).json({
          success: false,
          error: 'Download not found',
        });
        return;
      }

      res.json({
        success: true,
        download,
      });
    } catch (error) {
      logger.error('[DDL] Error getting download:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Search for DDL candidates (Rezi only, filtered for DDL)
   */
  searchDDLCandidates = async (req: Request, res: Response): Promise<void> => {
    try {
      const { igdbId, platform, strictPlatform } = req.body;

      if (!igdbId) {
        res.status(400).json({
          success: false,
          error: 'IGDB ID is required',
        });
        return;
      }

      // Get game details
      const game = await this.gamesService.getGameDetails(igdbId);
      if (!game) {
        res.status(404).json({
          success: false,
          error: 'Game not found',
        });
        return;
      }

      // Search for candidates using streaming API
      const allCandidates = await this.gamesService.searchDownloadCandidatesStreaming(
        igdbId,
        {
          platform,
          strictPlatform,
        }
      );

      // Filter to only DDL candidates
      const ddlCandidates = allCandidates.filter(c => c.hasDirectDownload || c.directDownloadUrl);

      res.json({
        success: true,
        game: {
          igdbId: game.id,
          name: game.name,
        },
        candidates: ddlCandidates,
        totalCandidates: allCandidates.length,
        ddlCandidates: ddlCandidates.length,
      });
    } catch (error) {
      logger.error('[DDL] Error searching DDL candidates:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Setup event listeners for download events
   */
  private setupEventListeners(): void {
    this.ddlService.on('started', (download: DDLDownload) => {
      logger.info(`[DDL] Download started: ${download.filename}`);
    });

    this.ddlService.on('progress', (download: DDLDownload) => {
      // Only log every ~10% to avoid spam
      if (download.progress.percentage % 10 === 0) {
        logger.info(
          `[DDL] Progress: ${download.filename} - ${download.progress.percentage}%`
        );
      }
    });

    this.ddlService.on('completed', (download: DDLDownload) => {
      logger.info(`[DDL] Download completed: ${download.filename}`);
      
      // Update game status if it's a monitored game
      if (download.igdbId) {
        // Note: We don't have a direct way to update monitored game status here
        // This would need to be handled by the GamesService
      }
    });

    this.ddlService.on('failed', (download: DDLDownload) => {
      logger.error(`[DDL] Download failed: ${download.filename} - ${download.error}`);
    });

    this.ddlService.on('cancelled', (download: DDLDownload) => {
      logger.info(`[DDL] Download cancelled: ${download.filename}`);
    });
  }
}
