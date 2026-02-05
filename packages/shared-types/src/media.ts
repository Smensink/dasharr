export type MediaType = 'movie' | 'series' | 'book';

export type MediaStatus =
  | 'available'
  | 'missing'
  | 'downloading'
  | 'wanted'
  | 'monitored';

export interface UnifiedMediaItem {
  id: string; // Composite: "radarr:123" or "sonarr:456"
  type: MediaType;
  title: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  status: MediaStatus;
  qualityProfile?: string;
  monitored: boolean;

  // Type-specific metadata
  metadata?: {
    // For movies
    runtime?: number;
    // For series
    seasonCount?: number;
    episodeCount?: number;
    // For books
    author?: string;
    pages?: number;
  };

  // Source reference
  source: {
    service: string;
    id: number;
  };
}

export interface QualityProfile {
  id: number;
  name: string;
  upgradeAllowed: boolean;
  cutoff: number;
  items: QualityProfileItem[];
}

export interface QualityProfileItem {
  quality: {
    id: number;
    name: string;
    resolution: number;
  };
  allowed: boolean;
}

export interface CalendarEvent {
  id: string;
  type: MediaType;
  title: string;
  airDate: string;
  hasFile: boolean;
  monitored: boolean;
  // For series
  seasonNumber?: number;
  episodeNumber?: number;
  // Source reference
  source: {
    service: string;
    id: number;
  };
}

export interface HistoryItem {
  id: number;
  eventType: string;
  date: string;
  quality?: string;
  sourceTitle?: string;
  downloadClient?: string;
  indexer?: string;
  customFormatScore?: number;
}

export interface LogEntry {
  time: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  exception?: string;
}

export interface HealthStatus {
  healthy: boolean;
  message?: string;
  checks?: HealthCheck[];
}

export interface HealthCheck {
  source: string;
  type: string;
  message: string;
  wikiUrl?: string;
}

export interface ServiceHealth {
  service: string;
  status: HealthStatus;
}

export interface SearchResult {
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
  title: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  inLibrary: boolean;
  monitored?: boolean;
  ratings?: {
    imdb?: { value: number; votes?: number };
    tmdb?: { value: number; votes?: number };
    rottenTomatoes?: { value: number; votes?: number };
    metacritic?: { value: number; votes?: number };
    value?: number;
    votes?: number;
  };
}

export interface UnifiedSearchResult extends SearchResult {
  type: MediaType;
  source: string;
}
