export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'warning';

export interface QueueItem {
  id: string;
  title: string;
  status: DownloadStatus;
  size: number;
  sizeleft: number;
  progress?: number; // Download progress percentage (0-100)
  timeleft?: string;
  estimatedCompletionTime?: string;
  downloadClient?: string;
  downloadId?: string;
  indexer?: string;
  category?: string;
  protocol?: 'torrent' | 'usenet';
  errorMessage?: string;
  game?: {
    installed: boolean;
    matchName?: string;
    matchPath?: string;
  };
  // Source reference (which *arr service queued this)
  source?: {
    service: string;
    itemId: number;
  };
}

export interface DownloadClientStats {
  downloadSpeed: number;
  uploadSpeed: number;
  isAvailable: boolean;
  totalDownloading: number;
  totalPaused: number;
}

export interface DownloadedMediaItem {
  id: string;
  type: 'movie' | 'episode';
  service: 'radarr' | 'sonarr';
  title: string;
  downloadedAt: string;
  seriesTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  imdbId?: string;
  tmdbId?: number;
  tvdbId?: number;
  searchTitle?: string;
}

export interface QBittorrentTorrent {
  hash: string;
  name: string;
  size: number;
  progress: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  state: string;
  category?: string;
  tags?: string;
}

export interface SabnzbdQueueItem {
  nzo_id: string;
  filename: string;
  mb: number;
  mbleft: number;
  mbmissing: number;
  size: string;
  sizeleft: string;
  percentage: number;
  eta: string;
  status: string;
  timeleft: string;
  cat: string;
}

export interface SabnzbdStatus {
  paused: boolean;
  speed: number;
  speedlimit: number;
  speedlimit_abs: number;
  timeleft: string;
  mb: number;
  mbleft: number;
  noofslots: number;
}
