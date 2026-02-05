/**
 * Application Settings Service
 * 
 * Manages application-wide configuration settings that are not service-specific.
 * These include job frequencies, feature toggles, and system preferences.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface GamesSettings {
  /** Enable RSS monitoring for game releases */
  rssMonitorEnabled: boolean;
  /** Frequency of periodic game searches in minutes */
  searchFrequencyMinutes: number;
  /** FitGirl RSS check interval in minutes */
  fitgirlRssIntervalMinutes: number;
  /** Prowlarr RSS check interval in minutes */
  prowlarrRssIntervalMinutes: number;
  /** Minimum time between searches for the same game in minutes */
  minSearchIntervalMinutes: number;
}

export interface DownloadsSettings {
  /** Enable queue deduplication for Arr services */
  dedupeArrEnabled: boolean;
  /** Game library directories (comma-separated paths) */
  gamesDirectories: string;
}

export interface CacheSettings {
  /** Default cache TTL in seconds */
  defaultTtlSeconds: number;
  /** Queue cache TTL in seconds */
  queueTtlSeconds: number;
  /** Health check cache TTL in seconds */
  healthTtlSeconds: number;
}

export interface SystemSettings {
  /** Maximum log entries to keep in memory */
  logStoreMaxEntries: number;
  /** Application timezone */
  timezone: string;
  /** Data directory path */
  dataDirectory: string;
}

export interface TdarrSettings {
  /** File age retry threshold in minutes */
  fileAgeRetryMinutes: number;
  /** Local database path for Tdarr status */
  localDbPath: string;
}

export interface FlareSolverrSettings {
  /** Enable FlareSolverr for bypassing Cloudflare */
  enabled: boolean;
  /** FlareSolverr URL */
  url: string;
  /** Request timeout in milliseconds */
  timeoutMs: number;
}

export interface AppSettings {
  games: GamesSettings;
  downloads: DownloadsSettings;
  cache: CacheSettings;
  system: SystemSettings;
  tdarr: TdarrSettings;
  flaresolverr: FlareSolverrSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  games: {
    rssMonitorEnabled: true,
    searchFrequencyMinutes: 30,
    fitgirlRssIntervalMinutes: 30,
    prowlarrRssIntervalMinutes: 15,
    minSearchIntervalMinutes: 15,
  },
  downloads: {
    dedupeArrEnabled: false,
    gamesDirectories: '',
  },
  cache: {
    defaultTtlSeconds: 300,
    queueTtlSeconds: 10,
    healthTtlSeconds: 60,
  },
  system: {
    logStoreMaxEntries: 1000,
    timezone: 'UTC',
    dataDirectory: '/app/data',
  },
  tdarr: {
    fileAgeRetryMinutes: 60,
    localDbPath: '',
  },
  flaresolverr: {
    enabled: false,
    url: 'http://flaresolverr:8191',
    timeoutMs: 60000,
  },
};

class AppSettingsService {
  private settings: AppSettings;
  private settingsFilePath: string;
  private listeners: Set<(settings: AppSettings) => void> = new Set();

  constructor() {
    this.settingsFilePath = this.resolveSettingsPath();
    this.settings = this.loadSettings();
    
    // Apply environment variable overrides
    this.applyEnvironmentOverrides();
  }

  private resolveSettingsPath(): string {
    const envPath = process.env.APP_SETTINGS_PATH;
    if (envPath) return envPath;
    
    const dataDir = process.env.DASHARR_DATA_DIR || '/app/data';
    return path.join(dataDir, 'app-settings.json');
  }

  private loadSettings(): AppSettings {
    try {
      if (fs.existsSync(this.settingsFilePath)) {
        const data = fs.readFileSync(this.settingsFilePath, 'utf-8');
        const parsed = JSON.parse(data) as Partial<AppSettings>;
        
        // Deep merge with defaults
        return this.mergeWithDefaults(parsed);
      }
    } catch (error) {
      logger.warn(`[AppSettings] Failed to load settings: ${error}`);
    }
    
    return { ...DEFAULT_SETTINGS };
  }

  private mergeWithDefaults(parsed: Partial<AppSettings>): AppSettings {
    return {
      games: { ...DEFAULT_SETTINGS.games, ...parsed.games },
      downloads: { ...DEFAULT_SETTINGS.downloads, ...parsed.downloads },
      cache: { ...DEFAULT_SETTINGS.cache, ...parsed.cache },
      system: { ...DEFAULT_SETTINGS.system, ...parsed.system },
      tdarr: { ...DEFAULT_SETTINGS.tdarr, ...parsed.tdarr },
      flaresolverr: { ...DEFAULT_SETTINGS.flaresolverr, ...parsed.flaresolverr },
    };
  }

  private applyEnvironmentOverrides(): void {
    // Games settings
    if (process.env.GAMES_RSS_MONITOR_ENABLED !== undefined) {
      this.settings.games.rssMonitorEnabled = process.env.GAMES_RSS_MONITOR_ENABLED === 'true';
    }
    if (process.env.GAMES_SEARCH_FREQUENCY_MINUTES) {
      this.settings.games.searchFrequencyMinutes = parseInt(process.env.GAMES_SEARCH_FREQUENCY_MINUTES, 10);
    }
    if (process.env.GAMES_FITGIRL_RSS_INTERVAL_MINUTES) {
      this.settings.games.fitgirlRssIntervalMinutes = parseInt(process.env.GAMES_FITGIRL_RSS_INTERVAL_MINUTES, 10);
    }
    if (process.env.GAMES_PROWLARR_RSS_INTERVAL_MINUTES) {
      this.settings.games.prowlarrRssIntervalMinutes = parseInt(process.env.GAMES_PROWLARR_RSS_INTERVAL_MINUTES, 10);
    }
    if (process.env.GAMES_MIN_SEARCH_INTERVAL_MINUTES) {
      this.settings.games.minSearchIntervalMinutes = parseInt(process.env.GAMES_MIN_SEARCH_INTERVAL_MINUTES, 10);
    }

    // Downloads settings
    if (process.env.DOWNLOADS_DEDUPE_ARR !== undefined) {
      this.settings.downloads.dedupeArrEnabled = process.env.DOWNLOADS_DEDUPE_ARR === 'true';
    }
    if (process.env.GAMES_DIRS) {
      this.settings.downloads.gamesDirectories = process.env.GAMES_DIRS;
    }

    // Cache settings
    if (process.env.CACHE_TTL_DEFAULT) {
      this.settings.cache.defaultTtlSeconds = parseInt(process.env.CACHE_TTL_DEFAULT, 10);
    }
    if (process.env.CACHE_TTL_QUEUE) {
      this.settings.cache.queueTtlSeconds = parseInt(process.env.CACHE_TTL_QUEUE, 10);
    }
    if (process.env.CACHE_TTL_HEALTH) {
      this.settings.cache.healthTtlSeconds = parseInt(process.env.CACHE_TTL_HEALTH, 10);
    }

    // System settings
    if (process.env.DASHARR_LOG_STORE_MAX) {
      this.settings.system.logStoreMaxEntries = parseInt(process.env.DASHARR_LOG_STORE_MAX, 10);
    }
    if (process.env.APP_TIME_ZONE) {
      this.settings.system.timezone = process.env.APP_TIME_ZONE;
    }
    if (process.env.DASHARR_DATA_DIR) {
      this.settings.system.dataDirectory = process.env.DASHARR_DATA_DIR;
    }

    // Tdarr settings
    if (process.env.TDARR_FILE_AGE_RETRY_MINUTES) {
      this.settings.tdarr.fileAgeRetryMinutes = parseInt(process.env.TDARR_FILE_AGE_RETRY_MINUTES, 10);
    }
    if (process.env.TDARR_LOCAL_DB_PATH) {
      this.settings.tdarr.localDbPath = process.env.TDARR_LOCAL_DB_PATH;
    }

    // FlareSolverr settings
    if (process.env.FLARESOLVERR_ENABLED !== undefined) {
      this.settings.flaresolverr.enabled = process.env.FLARESOLVERR_ENABLED === 'true';
    }
    if (process.env.FLARESOLVERR_URL) {
      this.settings.flaresolverr.url = process.env.FLARESOLVERR_URL;
    }
    if (process.env.FLARESOLVERR_TIMEOUT) {
      this.settings.flaresolverr.timeoutMs = parseInt(process.env.FLARESOLVERR_TIMEOUT, 10);
    }
  }

  private saveSettings(): void {
    try {
      const dir = path.dirname(this.settingsFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.settingsFilePath, JSON.stringify(this.settings, null, 2), 'utf-8');
      logger.info(`[AppSettings] Saved settings to ${this.settingsFilePath}`);
    } catch (error) {
      logger.error(`[AppSettings] Failed to save settings: ${error}`);
      throw error;
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.settings);
      } catch (error) {
        logger.error('[AppSettings] Listener error:', error);
      }
    });
  }

  // Getters
  getSettings(): AppSettings {
    return { ...this.settings };
  }

  getGamesSettings(): GamesSettings {
    return { ...this.settings.games };
  }

  getDownloadsSettings(): DownloadsSettings {
    return { ...this.settings.downloads };
  }

  getCacheSettings(): CacheSettings {
    return { ...this.settings.cache };
  }

  getSystemSettings(): SystemSettings {
    return { ...this.settings.system };
  }

  getTdarrSettings(): TdarrSettings {
    return { ...this.settings.tdarr };
  }

  getFlareSolverrSettings(): FlareSolverrSettings {
    return { ...this.settings.flaresolverr };
  }

  // Setters
  updateSettings(settings: Partial<AppSettings>): void {
    if (settings.games) {
      this.settings.games = { ...this.settings.games, ...settings.games };
    }
    if (settings.downloads) {
      this.settings.downloads = { ...this.settings.downloads, ...settings.downloads };
    }
    if (settings.cache) {
      this.settings.cache = { ...this.settings.cache, ...settings.cache };
    }
    if (settings.system) {
      this.settings.system = { ...this.settings.system, ...settings.system };
    }
    if (settings.tdarr) {
      this.settings.tdarr = { ...this.settings.tdarr, ...settings.tdarr };
    }
    if (settings.flaresolverr) {
      this.settings.flaresolverr = { ...this.settings.flaresolverr, ...settings.flaresolverr };
    }

    this.saveSettings();
    this.notifyListeners();
  }

  updateGamesSettings(settings: Partial<GamesSettings>): void {
    this.settings.games = { ...this.settings.games, ...settings };
    this.saveSettings();
    this.notifyListeners();
  }

  updateDownloadsSettings(settings: Partial<DownloadsSettings>): void {
    this.settings.downloads = { ...this.settings.downloads, ...settings };
    this.saveSettings();
    this.notifyListeners();
  }

  updateCacheSettings(settings: Partial<CacheSettings>): void {
    this.settings.cache = { ...this.settings.cache, ...settings };
    this.saveSettings();
    this.notifyListeners();
  }

  updateSystemSettings(settings: Partial<SystemSettings>): void {
    this.settings.system = { ...this.settings.system, ...settings };
    this.saveSettings();
    this.notifyListeners();
  }

  updateTdarrSettings(settings: Partial<TdarrSettings>): void {
    this.settings.tdarr = { ...this.settings.tdarr, ...settings };
    this.saveSettings();
    this.notifyListeners();
  }

  updateFlareSolverrSettings(settings: Partial<FlareSolverrSettings>): void {
    this.settings.flaresolverr = { ...this.settings.flaresolverr, ...settings };
    this.saveSettings();
    this.notifyListeners();
  }

  // Subscribe to changes
  onChange(listener: (settings: AppSettings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Reset to defaults
  resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings();
    this.notifyListeners();
  }

  // Get default values (for reference)
  getDefaults(): AppSettings {
    return { ...DEFAULT_SETTINGS };
  }
}

export const appSettingsService = new AppSettingsService();
