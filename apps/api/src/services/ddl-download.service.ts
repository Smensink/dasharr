import axios, { AxiosResponse } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  DDLDownload,
  DDLDownloadStatus,
  DDLDownloadProgress,
  DDLSettings,
  GameDownloadCandidate,
} from '@dasharr/shared-types';
import { logger } from '../utils/logger';

interface ActiveDownload {
  download: DDLDownload;
  abortController: AbortController;
  writeStream: fs.WriteStream;
  retries: number;
}

export class DDLDownloadService extends EventEmitter {
  private activeDownloads: Map<string, ActiveDownload> = new Map();
  private downloadQueue: string[] = [];
  private settings: DDLSettings;
  private downloadIdCounter = 0;

  constructor(settings?: Partial<DDLSettings>) {
    super();
    this.settings = {
      enabled: true,
      downloadPath: 'E:/Downloads',
      maxConcurrentDownloads: 3,
      maxRetries: 3,
      retryDelayMs: 5000,
      createGameSubfolders: true,
      ...settings,
    };

    // Ensure download directory exists
    this.ensureDownloadDirectory();
  }

  /**
   * Update DDL service settings
   */
  updateSettings(settings: Partial<DDLSettings>): void {
    this.settings = { ...this.settings, ...settings };
    logger.info(`[DDL] Settings updated, download path: ${this.settings.downloadPath}`);
    this.ensureDownloadDirectory();
  }

  /**
   * Get current settings
   */
  getSettings(): DDLSettings {
    return { ...this.settings };
  }

  /**
   * Check if DDL downloads are enabled
   */
  isEnabled(): boolean {
    return this.settings.enabled;
  }

  /**
   * Start a new direct download
   */
  async startDownload(
    gameName: string,
    candidate: GameDownloadCandidate,
    igdbId?: number
  ): Promise<DDLDownload> {
    if (!this.settings.enabled) {
      throw new Error('DDL downloads are disabled');
    }

    if (!candidate.directDownloadUrl) {
      throw new Error('No direct download URL available');
    }

    const downloadId = this.generateDownloadId();
    const filename = this.extractFilename(candidate.directDownloadUrl, candidate.title);
    const destinationFolder = this.getDestinationFolder(gameName);
    const downloadPath = path.join(destinationFolder, filename);

    const download: DDLDownload = {
      id: downloadId,
      igdbId,
      gameName,
      source: candidate.source,
      sourceUrl: candidate.directDownloadUrl,
      filename,
      status: 'pending',
      progress: {
        downloadedBytes: 0,
        percentage: 0,
      },
      destinationFolder: this.settings.downloadPath,
      candidate,
    };

    logger.info(`[DDL] Queued download: ${filename} from ${candidate.source}`);

    // Check if we can start immediately or need to queue
    if (this.activeDownloads.size < this.settings.maxConcurrentDownloads) {
      await this.executeDownload(downloadId, download);
    } else {
      this.downloadQueue.push(downloadId);
      this.emit('queued', download);
    }

    return download;
  }

  /**
   * Cancel a download
   */
  async cancelDownload(downloadId: string): Promise<boolean> {
    const active = this.activeDownloads.get(downloadId);
    
    if (active) {
      // Abort the download
      active.abortController.abort();
      
      try {
        // Close the write stream
        active.writeStream.destroy();
      } catch (error) {
        logger.warn(`[DDL] Error closing write stream for ${downloadId}:`, error);
      }

      // Clean up partial file
      if (fs.existsSync(active.download.downloadPath!)) {
        try {
          fs.unlinkSync(active.download.downloadPath!);
        } catch (error) {
          logger.warn(`[DDL] Could not remove partial file:`, error);
        }
      }

      active.download.status = 'cancelled';
      this.activeDownloads.delete(downloadId);
      this.emit('cancelled', active.download);
      this.processQueue();
      return true;
    }

    // Check if in queue
    const queueIndex = this.downloadQueue.indexOf(downloadId);
    if (queueIndex >= 0) {
      this.downloadQueue.splice(queueIndex, 1);
      return true;
    }

    return false;
  }

  /**
   * Get all downloads (active and queued)
   */
  getAllDownloads(): DDLDownload[] {
    const downloads: DDLDownload[] = [];
    
    // Active downloads
    for (const active of this.activeDownloads.values()) {
      downloads.push({ ...active.download });
    }

    return downloads;
  }

  /**
   * Get a specific download
   */
  getDownload(downloadId: string): DDLDownload | undefined {
    const active = this.activeDownloads.get(downloadId);
    if (active) {
      return { ...active.download };
    }
    return undefined;
  }

  /**
   * Get active downloads count
   */
  getActiveCount(): number {
    return this.activeDownloads.size;
  }

  /**
   * Get queued downloads count
   */
  getQueuedCount(): number {
    return this.downloadQueue.length;
  }

  /**
   * Clear completed/failed/cancelled downloads from memory
   */
  cleanupDownloads(): number {
    let cleared = 0;
    // Currently we only keep active downloads in memory
    // This method is for future extension when we maintain history
    return cleared;
  }

  /**
   * Execute the actual download
   */
  private async executeDownload(downloadId: string, download: DDLDownload): Promise<void> {
    const abortController = new AbortController();
    
    // Create write stream
    const writeStream = fs.createWriteStream(download.downloadPath!, { flags: 'w' });
    
    const activeDownload: ActiveDownload = {
      download,
      abortController,
      writeStream,
      retries: 0,
    };

    this.activeDownloads.set(downloadId, activeDownload);
    download.status = 'downloading';
    download.startedAt = new Date().toISOString();

    this.emit('started', download);

    try {
      await this.performDownload(activeDownload);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Download was cancelled
        return;
      }

      logger.error(`[DDL] Download failed for ${download.filename}:`, error);
      
      // Attempt retry
      if (activeDownload.retries < this.settings.maxRetries) {
        activeDownload.retries++;
        logger.info(`[DDL] Retrying ${download.filename} (attempt ${activeDownload.retries}/${this.settings.maxRetries})`);
        
        await this.delay(this.settings.retryDelayMs);
        
        if (this.activeDownloads.has(downloadId)) {
          await this.performDownload(activeDownload);
          return;
        }
      }

      download.status = 'failed';
      download.error = error instanceof Error ? error.message : 'Unknown error';
      this.activeDownloads.delete(downloadId);
      this.emit('failed', download);
      this.processQueue();
    }
  }

  /**
   * Perform the HTTP download with progress tracking
   */
  private async performDownload(activeDownload: ActiveDownload): Promise<void> {
    const { download, abortController, writeStream } = activeDownload;
    
    let totalBytes = 0;
    let downloadedBytes = 0;
    let lastReportedBytes = 0;
    const reportIntervalMs = 500; // Report progress every 500ms
    let lastReportTime = Date.now();

    try {
      const response: AxiosResponse<NodeJS.ReadableStream> = await axios({
        method: 'GET',
        url: download.sourceUrl,
        responseType: 'stream',
        signal: abortController.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0.36',
        },
        // Allow redirects
        maxRedirects: 5,
        // Timeout configuration
        timeout: 60000, // 60 second timeout
      });

      // Get total size from headers
      const contentLength = response.headers['content-length'];
      if (contentLength) {
        totalBytes = parseInt(contentLength as string, 10);
        download.progress.totalBytes = totalBytes;
      }

      // Handle the stream
      const stream = response.data;

      stream.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        
        const now = Date.now();
        const timeDiff = now - lastReportTime;
        
        // Update progress
        download.progress.downloadedBytes = downloadedBytes;
        if (totalBytes > 0) {
          download.progress.percentage = Math.round((downloadedBytes / totalBytes) * 100);
        }

        // Report progress periodically
        if (timeDiff >= reportIntervalMs) {
          const bytesSinceLastReport = downloadedBytes - lastReportedBytes;
          const speedBps = (bytesSinceLastReport / timeDiff) * 1000;
          
          download.progress.speedBytesPerSecond = Math.round(speedBps);
          
          if (totalBytes > 0 && speedBps > 0) {
            const remainingBytes = totalBytes - downloadedBytes;
            download.progress.etaSeconds = Math.round(remainingBytes / speedBps);
          }

          this.emit('progress', download);
          
          lastReportTime = now;
          lastReportedBytes = downloadedBytes;
        }
      });

      // Pipe to file
      stream.pipe(writeStream);

      // Wait for completion
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => {
          download.progress.downloadedBytes = downloadedBytes;
          if (totalBytes > 0) {
            download.progress.percentage = 100;
          }
          resolve();
        });

        writeStream.on('error', (error) => {
          reject(error);
        });

        stream.on('error', (error) => {
          reject(error);
        });
      });

      // Download completed successfully
      download.status = 'completed';
      download.completedAt = new Date().toISOString();
      
      this.activeDownloads.delete(download.id);
      this.emit('completed', download);
      this.processQueue();

    } catch (error) {
      writeStream.destroy();
      throw error;
    }
  }

  /**
   * Process the next item in the download queue
   */
  private processQueue(): void {
    while (
      this.activeDownloads.size < this.settings.maxConcurrentDownloads &&
      this.downloadQueue.length > 0
    ) {
      const downloadId = this.downloadQueue.shift();
      if (downloadId) {
        const download = this.getDownload(downloadId);
        if (download) {
          this.executeDownload(downloadId, download);
        }
      }
    }
  }

  /**
   * Ensure the download directory exists
   */
  private ensureDownloadDirectory(): void {
    try {
      if (!fs.existsSync(this.settings.downloadPath)) {
        fs.mkdirSync(this.settings.downloadPath, { recursive: true });
        logger.info(`[DDL] Created download directory: ${this.settings.downloadPath}`);
      }
    } catch (error) {
      logger.error(`[DDL] Could not create download directory:`, error);
    }
  }

  /**
   * Get the destination folder for a game
   */
  private getDestinationFolder(gameName: string): string {
    if (this.settings.createGameSubfolders) {
      // Sanitize game name for folder
      const sanitizedName = gameName
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim();
      const folder = path.join(this.settings.downloadPath, sanitizedName);
      
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
      }
      
      return folder;
    }
    return this.settings.downloadPath;
  }

  /**
   * Extract filename from URL or generate from title
   */
  private extractFilename(url: string, title: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const originalName = pathname.split('/').pop();
      
      if (originalName && originalName.includes('.')) {
        // URL has a filename with extension
        return decodeURIComponent(originalName);
      }
    } catch (error) {
      // URL parsing failed, continue with fallback
    }

    // Fallback: generate filename from title
    const sanitized = title
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim();
    return `${sanitized}.zip`;
  }

  /**
   * Generate a unique download ID
   */
  private generateDownloadId(): string {
    this.downloadIdCounter++;
    return `ddl-${Date.now()}-${this.downloadIdCounter}`;
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
