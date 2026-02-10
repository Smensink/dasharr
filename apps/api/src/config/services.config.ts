import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface ServiceConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
  timeout?: number;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  auth: {
    enabled: boolean;
    provider: 'plex';
    sessionSecret: string;
    sessionTtlDays: number;
    cookieName: string;
    plexClientId?: string;
    cookieSecure?: boolean;
    url?: string;
    apiKey?: string;
  };
  radarr?: ServiceConfig;
  sonarr?: ServiceConfig;
  readarr?: ServiceConfig;
  prowlarr?: ServiceConfig;
  plex?: ServiceConfig;
  tautulli?: ServiceConfig;
  bazarr?: ServiceConfig;
  tdarr?: ServiceConfig;
  qbittorrent?: ServiceConfig;
  rdtclient?: ServiceConfig;
  sabnzbd?: ServiceConfig;
  rezi?: ServiceConfig;
  tmdb?: ServiceConfig;
  trakt?: ServiceConfig;
  omdb?: ServiceConfig;
  igdb?: ServiceConfig & { clientId?: string; accessToken?: string };
  flaresolverr?: ServiceConfig;
  cache: {
    defaultTTL: number;
    queueTTL: number;
    healthTTL: number;
  };
}

function parseBoolean(value: string | undefined): boolean {
  return value === 'true';
}

function parseInt(value: string | undefined, defaultValue: number): number {
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT, 3000),
    nodeEnv: process.env.NODE_ENV || 'development',
    auth: {
      enabled: parseBoolean(process.env.AUTH_ENABLED),
      provider: 'plex',
      sessionSecret: process.env.AUTH_SESSION_SECRET || '',
      sessionTtlDays: parseInt(process.env.AUTH_SESSION_TTL_DAYS, 30),
      cookieName: process.env.AUTH_COOKIE_NAME || 'dasharr_session',
      plexClientId: process.env.PLEX_OAUTH_CLIENT_ID || '',
      cookieSecure: parseBoolean(process.env.AUTH_COOKIE_SECURE),
      url: process.env.AUTH_URL || '',
      apiKey: process.env.API_KEY || '',
    },

    radarr: {
      enabled: parseBoolean(process.env.RADARR_ENABLED),
      baseUrl: process.env.RADARR_URL || '',
      apiKey: process.env.RADARR_API_KEY || '',
      timeout: parseInt(process.env.RADARR_TIMEOUT, 30000),
    },

    sonarr: {
      enabled: parseBoolean(process.env.SONARR_ENABLED),
      baseUrl: process.env.SONARR_URL || '',
      apiKey: process.env.SONARR_API_KEY || '',
      timeout: parseInt(process.env.SONARR_TIMEOUT, 30000),
    },

    readarr: {
      enabled: parseBoolean(process.env.READARR_ENABLED),
      baseUrl: process.env.READARR_URL || '',
      apiKey: process.env.READARR_API_KEY || '',
      timeout: parseInt(process.env.READARR_TIMEOUT, 30000),
    },

    prowlarr: {
      enabled: parseBoolean(process.env.PROWLARR_ENABLED),
      baseUrl: process.env.PROWLARR_URL || '',
      apiKey: process.env.PROWLARR_API_KEY || '',
      timeout: parseInt(process.env.PROWLARR_TIMEOUT, 30000),
    },

    plex: {
      enabled: parseBoolean(process.env.PLEX_ENABLED),
      baseUrl: process.env.PLEX_URL || '',
      apiKey: process.env.PLEX_TOKEN || '', // Plex uses token instead of API key
      timeout: parseInt(process.env.PLEX_TIMEOUT, 30000),
    },

    tautulli: {
      enabled: parseBoolean(process.env.TAUTULLI_ENABLED),
      baseUrl: process.env.TAUTULLI_URL || '',
      apiKey: process.env.TAUTULLI_API_KEY || '',
      timeout: parseInt(process.env.TAUTULLI_TIMEOUT, 30000),
    },

    bazarr: {
      enabled: parseBoolean(process.env.BAZARR_ENABLED),
      baseUrl: process.env.BAZARR_URL || '',
      apiKey: process.env.BAZARR_API_KEY || '',
      timeout: parseInt(process.env.BAZARR_TIMEOUT, 30000),
    },

    tdarr: {
      enabled: parseBoolean(process.env.TDARR_ENABLED),
      baseUrl: process.env.TDARR_URL || 'http://host.docker.internal:8266',
      apiKey: process.env.TDARR_API_KEY || '',
      timeout: parseInt(process.env.TDARR_TIMEOUT, 30000),
    },

    qbittorrent: {
      enabled: parseBoolean(process.env.QBITTORRENT_ENABLED),
      baseUrl: process.env.QBITTORRENT_URL || '',
      username: process.env.QBITTORRENT_USERNAME || '',
      password: process.env.QBITTORRENT_PASSWORD || '',
      timeout: parseInt(process.env.QBITTORRENT_TIMEOUT, 30000),
    },

    rdtclient: {
      enabled: parseBoolean(process.env.RDTCLIENT_ENABLED),
      baseUrl: process.env.RDTCLIENT_URL || '',
      username: process.env.RDTCLIENT_USERNAME || '',
      password: process.env.RDTCLIENT_PASSWORD || '',
      timeout: parseInt(process.env.RDTCLIENT_TIMEOUT, 30000),
    },

    sabnzbd: {
      enabled: parseBoolean(process.env.SABNZBD_ENABLED),
      baseUrl: process.env.SABNZBD_URL || '',
      apiKey: process.env.SABNZBD_API_KEY || '',
      username: process.env.SABNZBD_USERNAME || '',
      password: process.env.SABNZBD_PASSWORD || '',
      timeout: parseInt(process.env.SABNZBD_TIMEOUT, 30000),
    },

    rezi: {
      enabled: parseBoolean(process.env.REZI_ENABLED),
      baseUrl: process.env.REZI_URL || 'https://search.rezi.one',
      apiKey: process.env.REZI_API_KEY || '',
      timeout: parseInt(process.env.REZI_TIMEOUT, 30000),
    },

    tmdb: {
      enabled: parseBoolean(process.env.TMDB_ENABLED),
      baseUrl: process.env.TMDB_URL || 'https://api.themoviedb.org/3',
      apiKey: process.env.TMDB_API_KEY || '',
      timeout: parseInt(process.env.TMDB_TIMEOUT, 30000),
    },

    trakt: {
      enabled: parseBoolean(process.env.TRAKT_ENABLED),
      baseUrl: process.env.TRAKT_URL || 'https://api.trakt.tv',
      apiKey: process.env.TRAKT_CLIENT_ID || '',
      timeout: parseInt(process.env.TRAKT_TIMEOUT, 30000),
    },

    omdb: {
      enabled: parseBoolean(process.env.OMDB_ENABLED),
      baseUrl: process.env.OMDB_URL || 'https://www.omdbapi.com',
      apiKey: process.env.OMDB_API_KEY || '',
      timeout: parseInt(process.env.OMDB_TIMEOUT, 30000),
    },

    igdb: {
      enabled: parseBoolean(process.env.IGDB_ENABLED),
      baseUrl: 'https://api.igdb.com/v4', // IGDB base URL is fixed
      apiKey: process.env.IGDB_CLIENT_ID || '',
      clientId: process.env.IGDB_CLIENT_ID || '',
      clientSecret: process.env.IGDB_CLIENT_SECRET || '',
      accessToken: process.env.IGDB_ACCESS_TOKEN || '',
      timeout: parseInt(process.env.IGDB_TIMEOUT, 30000),
    },

    flaresolverr: {
      enabled: parseBoolean(process.env.FLARESOLVERR_ENABLED),
      baseUrl: process.env.FLARESOLVERR_URL || 'http://flaresolverr:8191',
      timeout: parseInt(process.env.FLARESOLVERR_TIMEOUT, 60000),
    },

    cache: {
      defaultTTL: parseInt(process.env.CACHE_TTL_DEFAULT, 300),
      queueTTL: parseInt(process.env.CACHE_TTL_QUEUE, 10),
      healthTTL: parseInt(process.env.CACHE_TTL_HEALTH, 60),
    },
  };
}

export function validateConfig(config: AppConfig): void {
  if (config.auth.enabled && !config.auth.sessionSecret) {
    throw new Error('AUTH_SESSION_SECRET is required when AUTH_ENABLED=true');
  }
  if (config.auth.enabled && !config.auth.url) {
    throw new Error('AUTH_URL is required when AUTH_ENABLED=true');
  }

  const enabledServices = Object.entries(config).filter(
    ([_key, value]) =>
      typeof value === 'object' &&
      value !== null &&
      'enabled' in value &&
      value.enabled &&
      'baseUrl' in value
  ) as [string, ServiceConfig][];

  for (const [name, cfg] of enabledServices) {
    if (!cfg.baseUrl) {
      throw new Error(
        `${name.toUpperCase()}_URL is required when ${name.toUpperCase()}_ENABLED=true`
      );
    }

    // Validate API key for services that require it (not Plex, uses token)
    if (
      name !== 'plex' &&
      name !== 'rdtclient' &&
      name !== 'qbittorrent' &&
      name !== 'tdarr' &&
      name !== 'igdb' &&
      name !== 'flaresolverr' &&
      !cfg.apiKey
    ) {
      const keyName =
        name === 'trakt' ? 'TRAKT_CLIENT_ID' : `${name.toUpperCase()}_API_KEY`;
      throw new Error(
        `${keyName} is required when ${name.toUpperCase()}_ENABLED=true`
      );
    }

    // Validate IGDB credentials (clientId and clientSecret required)
    if (name === 'igdb' && (!cfg.clientId || !cfg.clientSecret)) {
      throw new Error(
        'IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are required when IGDB_ENABLED=true'
      );
    }

    // Validate qBittorrent credentials
    if (name === 'qbittorrent' && (!cfg.username || !cfg.password)) {
      throw new Error(
        'QBITTORRENT_USERNAME and QBITTORRENT_PASSWORD are required when QBITTORRENT_ENABLED=true'
      );
    }
  }
}

export const config = loadConfig();
