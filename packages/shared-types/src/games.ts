export type GameStatus =
  | 'wanted'
  | 'monitored'
  | 'downloading'
  | 'downloaded'
  | 'installed'
  | 'not_available';

export interface GamePlatform {
  id: number;
  name: string;
  abbreviation?: string;
}

export interface GameGenre {
  id: number;
  name: string;
}

export interface GameCover {
  id: number;
  url: string;
  width?: number;
  height?: number;
}

export interface IGDBWebsite {
  id: number;
  url: string;
  category: number; // 1 = official, 13 = Steam, 26 = GOG, etc.
}

export interface IGDBAlternativeName {
  id: number;
  name: string;
  comment?: string; // e.g., "Alternative title", "Alternative spelling", etc.
}

export interface IGDBGame {
  id: number;
  name: string;
  slug: string;
  category?: number; // IGDB category (main game, DLC, expansion, etc.)
  summary?: string;
  storyline?: string;
  first_release_date?: number; // Unix timestamp
  cover?: GameCover;
  platforms?: GamePlatform[];
  genres?: GameGenre[];
  rating?: number;
  rating_count?: number;
  aggregated_rating?: number;
  aggregated_rating_count?: number;
  status?: number; // 0 = released, 2 = alpha, 3 = beta, 4 = early access, 5 = offline, 6 = cancelled, 7 = rumored, 8 = delisted
  websites?: IGDBWebsite[]; // External links including Steam
  alternative_names?: IGDBAlternativeName[]; // Alternative titles and spellings
  franchises?: number[]; // Franchise IDs for sequel detection
  collections?: number[]; // Collection IDs for sequel detection
  similar_games?: number[]; // Related games by similarity
  remakes?: number[];
  remasters?: number[];
  expansions?: number[];
  dlcs?: number[];
  bundles?: number[];
  ports?: number[];
  forks?: number[];
  standalone_expansions?: number[];
  parent_game?: number;
  version_parent?: number;
  version_title?: string;
  versions?: number[];
}

export interface MonitoredGame {
  id: string; // igdb-{igdbId}
  igdbId: number;
  name: string;
  slug: string;
  category?: number; // IGDB category (main game, DLC, expansion, etc.)
  summary?: string;
  coverUrl?: string;
  platforms: string[];
  genres: string[];
  releaseDate?: string; // ISO date
  rating?: number;
  
  // Monitoring settings
  status: GameStatus;
  monitoredSince: string;
  preferredReleaseType: 'scene' | 'p2p' | 'repack' | 'any';
  preferredPlatforms?: string[]; // Platform names to prefer
  
  // Download tracking
  currentDownload?: {
    hash?: string;
    client?: string;
    progress: number;
    status: 'searching' | 'downloading' | 'completed' | 'failed';
    source?: string; // Which search agent found it
    title?: string; // The actual torrent title
  };
  
  // Last check info
  lastSearchedAt?: string;
  lastFoundAt?: string;
  searchCount: number;
  installedAt?: string;
  installedPath?: string;
  installedMatchName?: string;
}

export interface GameSearchResult {
  igdbId: number;
  name: string;
  slug: string;
  category?: number; // IGDB category (main game, DLC, expansion, etc.)
  coverUrl?: string;
  releaseDate?: string;
  platforms: string[];
  rating?: number;
  isMonitored: boolean;
  status?: GameStatus;
  // Enhanced search fields for better matching
  alternativeNames?: string[]; // Alternative titles from IGDB (e.g., "Baldur's Gate 3" for "Baldur's Gate III")
  steamAppId?: number; // Steam App ID if available
}

export interface GameDownloadCandidate {
  title: string;
  size?: string;
  sizeBytes?: number;
  seeders?: number;
  leechers?: number;
  magnetUrl?: string;
  torrentUrl?: string;
  infoUrl?: string;
  source: string; // Which search agent found this
  releaseType: 'scene' | 'p2p' | 'repack' | 'rip' | 'unknown';
  platform?: string; // Detected platform (PC, PS4, PS5, Xbox, Switch)
  platformScore?: number; // Platform match score (100 = preferred, 0 = non-preferred)
  quality?: string; // e.g., "FitGirl", "SteamRip", etc.
  uploader?: string; // Username of the uploader (from Prowlarr)
  // Source trust info (from Hydra Library)
  sourceTrustLevel?: 'trusted' | 'safe' | 'abandoned' | 'unsafe' | 'nsfw';
  // Enhanced matching info (optional)
  matchScore?: number; // 0-100 match score
  matchReasons?: string[]; // Reasons for match score
  // Direct Download Link (DDL) support
  directDownloadUrl?: string; // Direct download URL (if available)
  hasDirectDownload?: boolean; // Whether this candidate has a direct download link
}

export interface GameStats {
  monitored: number;
  downloading: number;
  downloaded: number;
  installed: number;
  wanted: number;
}

// === Direct Download Link (DDL) Types ===

export type DDLDownloadStatus = 
  | 'pending'      // Download queued but not started
  | 'downloading'  // Actively downloading
  | 'paused'       // Download paused by user
  | 'completed'    // Download finished successfully
  | 'failed'       // Download failed
  | 'cancelled';   // Download cancelled by user

export interface DDLDownloadProgress {
  downloadedBytes: number;
  totalBytes?: number;
  percentage: number; // 0-100
  speedBytesPerSecond?: number; // Current download speed
  etaSeconds?: number; // Estimated time remaining
}

export interface DDLDownload {
  id: string; // Unique download ID
  igdbId?: number; // Associated IGDB game ID (if from monitored game)
  gameName: string;
  source: string; // Where the link came from (e.g., "Rezi")
  sourceUrl: string; // The direct download URL
  filename: string;
  status: DDLDownloadStatus;
  progress: DDLDownloadProgress;
  downloadPath?: string; // Full path where file is being saved
  destinationFolder: string; // Base download folder
  startedAt?: string; // ISO timestamp
  completedAt?: string; // ISO timestamp
  error?: string; // Error message if failed
  candidate?: GameDownloadCandidate; // Original candidate info
}

export interface DDLSettings {
  enabled: boolean;
  downloadPath: string; // Default download path (e.g., "E:/Downloads")
  maxConcurrentDownloads: number;
  maxRetries: number;
  retryDelayMs: number;
  createGameSubfolders: boolean; // Create subfolder for each game
}

// Default DDL settings
export const DEFAULT_DDL_SETTINGS: DDLSettings = {
  enabled: true,
  downloadPath: './data/downloads',
  maxConcurrentDownloads: 3,
  maxRetries: 3,
  retryDelayMs: 5000,
  createGameSubfolders: true,
};

// === Pending Match / Approval Types ===

export type PendingMatchStatus = 'pending' | 'approved' | 'rejected';

export interface PendingMatch {
  id: string;
  igdbId: number;
  gameName: string;
  coverUrl?: string;
  candidate: GameDownloadCandidate;
  status: PendingMatchStatus;
  foundAt: string; // ISO timestamp
  resolvedAt?: string; // ISO timestamp
  source: string; // 'initial' | 'periodic' | 'rss'
}

export interface PendingMatchGroup {
  igdbId: number;
  gameName: string;
  coverUrl?: string;
  matches: PendingMatch[];
}

// === Pushover Notification Types ===

export interface PushoverSettings {
  enabled: boolean;
  apiToken: string;
  userKey: string;
  notifyOnMatchFound: boolean;
  notifyOnDownloadStarted: boolean;
  notifyOnDownloadCompleted: boolean;
  notifyOnDownloadFailed: boolean;
}

export const DEFAULT_PUSHOVER_SETTINGS: PushoverSettings = {
  enabled: false,
  apiToken: '',
  userKey: '',
  notifyOnMatchFound: true,
  notifyOnDownloadStarted: true,
  notifyOnDownloadCompleted: true,
  notifyOnDownloadFailed: true,
};
