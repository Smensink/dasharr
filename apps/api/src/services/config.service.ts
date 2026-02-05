import { ServiceConfig, config } from '../config/services.config';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface RuntimeConfig {
  services: {
    [key: string]: ServiceConfig;
  };
}

interface PersistedConfig {
  services: {
    [key: string]: Partial<ServiceConfig>;
  };
}

class ConfigService {
  private runtimeConfig: RuntimeConfig;
  private configFilePath: string;
  private backupConfigFilePath?: string;

  constructor() {
    // Config file path - can be overridden via environment variable
    const envConfigPath = process.env.CONFIG_FILE_PATH;
    const resolvedPaths = this.resolveConfigPaths(envConfigPath);
    this.configFilePath = resolvedPaths.primary;
    this.backupConfigFilePath = resolvedPaths.backup;

    // Initialize with current environment config
    const envConfig: RuntimeConfig = {
      services: {
        radarr: config.radarr!,
        sonarr: config.sonarr!,
        readarr: config.readarr!,
        prowlarr: config.prowlarr!,
        qbittorrent: config.qbittorrent!,
        sabnzbd: config.sabnzbd!,
        rdtclient: config.rdtclient!,
        plex: config.plex!,
        tautulli: config.tautulli!,
        bazarr: config.bazarr!,
        tdarr: config.tdarr!,
        tmdb: config.tmdb!,
        trakt: config.trakt!,
        omdb: config.omdb!,
        igdb: config.igdb!,
        flaresolverr: config.flaresolverr!,
      },
    };

    // Load and merge persisted config
    const persistedConfig = this.loadPersistedConfig();
    this.runtimeConfig = this.mergeConfigs(envConfig, persistedConfig);
  }

  private loadPersistedConfig(): PersistedConfig | null {
    const primary = this.readConfigFile(this.configFilePath, 'primary');
    const backup = this.backupConfigFilePath
      ? this.readConfigFile(this.backupConfigFilePath, 'backup')
      : null;

    if (!primary && !backup) {
      return null;
    }

    if (!primary && backup) {
      logger.warn(
        `Primary config missing; using backup settings from ${this.backupConfigFilePath}`
      );
      return backup;
    }

    if (primary && backup) {
      const merged = this.mergePersistedConfigs(primary, backup);
      if (merged !== primary) {
        logger.warn(
          `Primary config missing values; filled from backup settings at ${this.backupConfigFilePath}`
        );
      }
      return merged;
    }

    return primary;
  }

  private mergeConfigs(envConfig: RuntimeConfig, persisted: PersistedConfig | null): RuntimeConfig {
    if (!persisted) {
      return envConfig;
    }

    const merged: RuntimeConfig = { services: {} };

    for (const [serviceName, envService] of Object.entries(envConfig.services)) {
      const persistedService = persisted.services?.[serviceName] || {};
      merged.services[serviceName] = {
        ...envService,
        ...persistedService,
      };
    }

    return merged;
  }

  private resolveConfigPaths(envConfigPath?: string): { primary: string; backup?: string } {
    if (envConfigPath) {
      return { primary: envConfigPath, backup: `${envConfigPath}.backup` };
    }

    const primary = this.findConfigFile(path.join('data', 'settings.json'));
    const backup = this.findConfigFile(path.join('data', 'settings.json.backup'));

    return {
      primary: primary || path.join(process.cwd(), 'data', 'settings.json'),
      backup: backup || (primary ? `${primary}.backup` : undefined),
    };
  }

  private findConfigFile(relativePath: string): string | null {
    let current = process.cwd();
    for (let i = 0; i < 5; i += 1) {
      const candidate = path.join(current, relativePath);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
    return null;
  }

  private readConfigFile(
    filePath: string,
    label: 'primary' | 'backup'
  ): PersistedConfig | null {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(data) as PersistedConfig;
        logger.info(`Loaded ${label} persisted config from ${filePath}`);
        return parsed;
      }
    } catch (error) {
      logger.warn(`Failed to load ${label} persisted config from ${filePath}: ${error}`);
    }
    return null;
  }

  private mergePersistedConfigs(
    primary: PersistedConfig,
    backup: PersistedConfig
  ): PersistedConfig {
    const merged: PersistedConfig = { services: { ...primary.services } };

    for (const [serviceName, backupService] of Object.entries(
      backup.services || {}
    )) {
      const primaryService = merged.services[serviceName];
      if (!primaryService) {
        merged.services[serviceName] = { ...backupService };
        continue;
      }

      for (const [key, value] of Object.entries(backupService)) {
        const primaryValue = (primaryService as Record<string, unknown>)[key];
        if (!this.isValueSet(primaryValue) && this.isValueSet(value)) {
          (primaryService as Record<string, unknown>)[key] = value;
        }
      }
    }

    return merged;
  }

  private isValueSet(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return true;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    return value !== undefined && value !== null;
  }

  private savePersistedConfig(): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.configFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save only the fields that should persist (not sensitive defaults from env)
      const toSave: PersistedConfig = { services: {} };
      for (const [serviceName, serviceConfig] of Object.entries(this.runtimeConfig.services)) {
        toSave.services[serviceName] = {
          enabled: serviceConfig.enabled,
          baseUrl: serviceConfig.baseUrl,
          apiKey: serviceConfig.apiKey,
          username: serviceConfig.username,
          password: serviceConfig.password,
          clientId: serviceConfig.clientId,
          clientSecret: serviceConfig.clientSecret,
        };
      }

      fs.writeFileSync(this.configFilePath, JSON.stringify(toSave, null, 2), 'utf-8');
      logger.info(`Saved config to ${this.configFilePath}`);
    } catch (error) {
      logger.error(`Failed to save config: ${error}`);
    }
  }

  getConfig(): RuntimeConfig {
    return this.runtimeConfig;
  }

  updateServiceConfig(serviceName: string, newConfig: Partial<ServiceConfig>): void {
    if (!this.runtimeConfig.services[serviceName]) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    this.runtimeConfig.services[serviceName] = {
      ...this.runtimeConfig.services[serviceName],
      ...newConfig,
    };

    // Persist changes to file
    this.savePersistedConfig();
  }

  getServiceConfig(serviceName: string): ServiceConfig | undefined {
    return this.runtimeConfig.services[serviceName];
  }
}

export const configService = new ConfigService();
