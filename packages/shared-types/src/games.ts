export type GameStatus = 'wanted' | 'monitored' | 'downloading' | 'downloaded' | 'not_available';

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
  // Enhanced matching info (optional)
  matchScore?: number; // 0-100 match score
  matchReasons?: string[]; // Reasons for match score
}

export interface GameStats {
  monitored: number;
  downloading: number;
  downloaded: number;
  wanted: number;
}

