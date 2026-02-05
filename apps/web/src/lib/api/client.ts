import axios, { AxiosInstance } from 'axios';
import type {
  QualityProfile,
  CalendarEvent,
  HistoryItem,
  LogEntry,
  HealthStatus,
  SearchResult,
  QueueItem,
  DownloadedMediaItem,
  DiscoverSectionsResponse,
  TdarrOverview,
  BazarrSubtitleStatus,
  BazarrSeriesSubtitleSummary,
  GameSearchResult,
  MonitoredGame,
  GameStats,
  IGDBGame,
  GameDownloadCandidate,
} from '@shared/index';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api/v1',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });
  }

  // Radarr endpoints
  radarr = {
    getMovies: () => this.client.get('/radarr/movies').then((r) => r.data),
    getMovieById: (id: number) =>
      this.client.get(`/radarr/movies/${id}`).then((r) => r.data),
    addMovie: (movie: any) =>
      this.client.post('/radarr/movies', movie).then((r) => r.data),
    updateMovie: (id: number, updates: any) =>
      this.client.put(`/radarr/movies/${id}`, updates).then((r) => r.data),
    deleteMovie: (id: number, deleteFiles: boolean = false) =>
      this.client
        .delete(`/radarr/movies/${id}?deleteFiles=${deleteFiles}`)
        .then((r) => r.data),
    searchMovies: (query: string) =>
      this.client
        .get<SearchResult[]>('/radarr/search', { params: { q: query } })
        .then((r) => r.data),
    triggerSearch: (id: number, interactive: boolean = false) =>
      this.client
        .post(`/radarr/movies/${id}/search`, { interactive })
        .then((r) => r.data),
    getQueue: () =>
      this.client.get<QueueItem[]>('/radarr/queue').then((r) => r.data),
    getHistory: (params?: any) =>
      this.client
        .get<HistoryItem[]>('/radarr/history', { params })
        .then((r) => r.data),
    getCalendar: (start?: Date, end?: Date) =>
      this.client
        .get<CalendarEvent[]>('/radarr/calendar', {
          params: {
            start: start?.toISOString(),
            end: end?.toISOString(),
          },
        })
        .then((r) => r.data),
    getProfiles: () =>
      this.client.get<QualityProfile[]>('/radarr/profiles').then((r) => r.data),
    getRootFolders: () =>
      this.client.get('/radarr/rootfolders').then((r) => r.data),
    getLogs: (params?: any) =>
      this.client
        .get<LogEntry[]>('/radarr/logs', { params })
        .then((r) => r.data),
    getHealth: () =>
      this.client.get<HealthStatus>('/radarr/health').then((r) => r.data),
  };

  // Sonarr endpoints
  sonarr = {
    getSeries: () => this.client.get('/sonarr/series').then((r) => r.data),
    getSeriesById: (id: number) =>
      this.client.get(`/sonarr/series/${id}`).then((r) => r.data),
    getSeriesEpisodes: (id: number) =>
      this.client.get(`/sonarr/series/${id}/episodes`).then((r) => r.data),
    addSeries: (series: any) =>
      this.client.post('/sonarr/series', series).then((r) => r.data),
    updateSeries: (id: number, updates: any) =>
      this.client.put(`/sonarr/series/${id}`, updates).then((r) => r.data),
    deleteSeries: (id: number, deleteFiles: boolean = false) =>
      this.client
        .delete(`/sonarr/series/${id}?deleteFiles=${deleteFiles}`)
        .then((r) => r.data),
    searchSeries: (query: string) =>
      this.client
        .get<SearchResult[]>('/sonarr/search', { params: { q: query } })
        .then((r) => r.data),
    triggerSearch: (
      id: number,
      options: { interactive?: boolean; seasonNumber?: number; episodeIds?: number[] } = {}
    ) =>
      this.client
        .post(`/sonarr/series/${id}/search`, options)
        .then((r) => r.data),
    getQueue: () =>
      this.client.get<QueueItem[]>('/sonarr/queue').then((r) => r.data),
    getHistory: (params?: any) =>
      this.client
        .get<HistoryItem[]>('/sonarr/history', { params })
        .then((r) => r.data),
    getCalendar: (start?: Date, end?: Date) =>
      this.client
        .get<CalendarEvent[]>('/sonarr/calendar', {
          params: {
            start: start?.toISOString(),
            end: end?.toISOString(),
          },
        })
        .then((r) => r.data),
    getProfiles: () =>
      this.client.get<QualityProfile[]>('/sonarr/profiles').then((r) => r.data),
    getRootFolders: () =>
      this.client.get('/sonarr/rootfolders').then((r) => r.data),
    getLogs: (params?: any) =>
      this.client
        .get<LogEntry[]>('/sonarr/logs', { params })
        .then((r) => r.data),
    getHealth: () =>
      this.client.get<HealthStatus>('/sonarr/health').then((r) => r.data),
  };

  // Readarr endpoints
  readarr = {
    getBooks: () => this.client.get('/readarr/books').then((r) => r.data),
    getBookById: (id: number) =>
      this.client.get(`/readarr/books/${id}`).then((r) => r.data),
    addBook: (book: any) =>
      this.client.post('/readarr/books', book).then((r) => r.data),
    triggerSearch: (id: number, interactive: boolean = false) =>
      this.client
        .post(`/readarr/books/${id}/search`, { interactive })
        .then((r) => r.data),
    searchBooks: (query: string) =>
      this.client
        .get<SearchResult[]>('/readarr/search', { params: { q: query } })
        .then((r) => r.data),
    lookupAuthors: (term: string) =>
      this.client
        .get('/readarr/authors/lookup', { params: { term } })
        .then((r) => r.data),
    getAuthors: () => this.client.get('/readarr/authors').then((r) => r.data),
    getProfiles: () =>
      this.client.get<QualityProfile[]>('/readarr/profiles').then((r) => r.data),
    getMetadataProfiles: () =>
      this.client.get('/readarr/metadataprofiles').then((r) => r.data),
    getRootFolders: () =>
      this.client.get('/readarr/rootfolders').then((r) => r.data),
    getQueue: () =>
      this.client.get<QueueItem[]>('/readarr/queue').then((r) => r.data),
    getCalendar: (start?: Date, end?: Date) =>
      this.client
        .get<CalendarEvent[]>('/readarr/calendar', {
          params: {
            start: start?.toISOString(),
            end: end?.toISOString(),
          },
        })
        .then((r) => r.data),
    getLogs: (params?: any) =>
      this.client
        .get<LogEntry[]>('/readarr/logs', { params })
        .then((r) => r.data),
    getHealth: () =>
      this.client.get<HealthStatus>('/readarr/health').then((r) => r.data),
  };

  // Prowlarr endpoints
  prowlarr = {
    getIndexers: () => this.client.get('/prowlarr/indexers').then((r) => r.data),
    getIndexerStats: () =>
      this.client.get('/prowlarr/stats').then((r) => r.data),
    search: (query: string, indexerIds?: number[]) =>
      this.client
        .get('/prowlarr/search', { params: { query, indexerIds } })
        .then((r) => r.data),
    getHealth: () =>
      this.client.get<HealthStatus>('/prowlarr/health').then((r) => r.data),
  };

  // Downloads endpoints
  downloads = {
    getQueue: () =>
      this.client.get<QueueItem[]>('/downloads/queue').then((r) => r.data),
    getStats: () => this.client.get('/downloads/stats').then((r) => r.data),
    getToday: (limit?: number) =>
      this.client
        .get<DownloadedMediaItem[]>('/downloads/today', { params: { limit } })
        .then((r) => r.data),
    dedupeQueue: () => this.client.post('/downloads/dedupe').then((r) => r.data),
    // qBittorrent
    qbittorrent: {
      getTorrents: (filter?: string) =>
        this.client
          .get('/downloads/qbittorrent/torrents', { params: { filter } })
          .then((r) => r.data),
      pauseTorrent: (hash: string) =>
        this.client
          .post(`/downloads/qbittorrent/torrents/${hash}/pause`)
          .then((r) => r.data),
      resumeTorrent: (hash: string) =>
        this.client
          .post(`/downloads/qbittorrent/torrents/${hash}/resume`)
          .then((r) => r.data),
      deleteTorrent: (hash: string, deleteFiles: boolean = false) =>
        this.client
          .delete(
            `/downloads/qbittorrent/torrents/${hash}?deleteFiles=${deleteFiles}`
          )
          .then((r) => r.data),
      recheckTorrent: (hash: string) =>
        this.client
          .post(`/downloads/qbittorrent/torrents/${hash}/recheck`)
          .then((r) => r.data),
    },
    // SABnzbd
    sabnzbd: {
      pauseQueue: () =>
        this.client.post('/downloads/sabnzbd/queue/pause').then((r) => r.data),
      resumeQueue: () =>
        this.client.post('/downloads/sabnzbd/queue/resume').then((r) => r.data),
      pauseItem: (nzoId: string) =>
        this.client
          .post(`/downloads/sabnzbd/items/${encodeURIComponent(nzoId)}/pause`)
          .then((r) => r.data),
      resumeItem: (nzoId: string) =>
        this.client
          .post(`/downloads/sabnzbd/items/${encodeURIComponent(nzoId)}/resume`)
          .then((r) => r.data),
      deleteItem: (nzoId: string, deleteFiles: boolean = false) =>
        this.client
          .delete(
            `/downloads/sabnzbd/items/${encodeURIComponent(nzoId)}?deleteFiles=${deleteFiles}`
          )
          .then((r) => r.data),
      moveItem: (nzoId: string, position: number) =>
        this.client
          .post(`/downloads/sabnzbd/items/${encodeURIComponent(nzoId)}/move`, { position })
          .then((r) => r.data),
      getHistory: (limit?: number) =>
        this.client
          .get('/downloads/sabnzbd/history', { params: { limit } })
          .then((r) => r.data),
    },
    // RDTClient
    rdtclient: {
      retryTorrent: (id: string) =>
        this.client
          .post(`/downloads/rdtclient/torrents/${id}/retry`)
          .then((r) => r.data),
      updateTorrent: (id: string) =>
        this.client
          .put(`/downloads/rdtclient/torrents/${id}`)
          .then((r) => r.data),
      deleteTorrent: (id: string, deleteFiles: boolean = false) =>
        this.client
          .delete(`/downloads/rdtclient/torrents/${id}?deleteFiles=${deleteFiles}`)
          .then((r) => r.data),
    },
  };

  // Plex endpoints
  plex = {
    getSessions: () => this.client.get('/plex/sessions').then((r) => r.data),
    getLibraries: () => this.client.get('/plex/libraries').then((r) => r.data),
    searchMedia: (query: string) =>
      this.client.get('/plex/search', { params: { q: query } }).then((r) => r.data),
    findMedia: (params: {
      title: string;
      type?: 'movie' | 'episode';
      seriesTitle?: string;
      seasonNumber?: number;
      episodeNumber?: number;
      imdbId?: string;
      tmdbId?: number;
      tvdbId?: number;
    }) => this.client.get('/plex/find', { params }).then((r) => r.data),
    getMediaByGuid: (guid: string) =>
      this.client.get(`/plex/media/${encodeURIComponent(guid)}`).then((r) => r.data),
    getServerInfo: () => this.client.get('/plex/server').then((r) => r.data),
    getHealth: () => this.client.get('/plex/health').then((r) => r.data),
  };

  // Tautulli endpoints
  tautulli = {
    getActivity: () => this.client.get('/tautulli/activity').then((r) => r.data),
    getHistory: (limit?: number) =>
      this.client.get('/tautulli/history', { params: { limit } }).then((r) => r.data),
    getWatchStats: (libraryId?: string) =>
      this.client.get('/tautulli/stats/watch', { params: { libraryId } }).then((r) => r.data),
    getHomeStats: () => this.client.get('/tautulli/stats/home').then((r) => r.data),
    getHealth: () => this.client.get('/tautulli/health').then((r) => r.data),
  };

  // Tdarr endpoints
  tdarr = {
    getOverview: () =>
      this.client.get<TdarrOverview>('/tdarr/overview').then((r) => r.data),
    updateWorkerLimit: (data: { nodeId: string; workerType: string; target: number }) =>
      this.client.post('/tdarr/workers', data).then((r) => r.data),
    requeueFailed: (data: { file: string; title?: string; jobId?: string }) =>
      this.client.post('/tdarr/requeue', data).then((r) => r.data),
    getHealth: () => this.client.get('/tdarr/health').then((r) => r.data),
  };

  // Bazarr endpoints
  bazarr = {
    getMovies: (radarrIds?: number[]) => {
      const payload = radarrIds && radarrIds.length ? { radarrIds } : {};
      return this.client
        .post<BazarrSubtitleStatus[]>('/bazarr/movies', payload)
        .then((r) => r.data);
    },
    getSeriesEpisodes: (seriesId: number, episodeIds?: number[]) =>
      this.client
        .get<BazarrSubtitleStatus[]>(`/bazarr/series/${seriesId}/episodes`, {
          params: { episodeIds },
        })
        .then((r) => r.data),
    getSeriesSummary: (seriesIds?: number[]) => {
      const payload = seriesIds && seriesIds.length ? { seriesIds } : {};
      return this.client
        .post<BazarrSeriesSubtitleSummary[]>('/bazarr/series/summary', payload)
        .then((r) => r.data);
    },
    searchMovie: (
      radarrId: number,
      options?: { language?: string; forced?: boolean; hi?: boolean }
    ) =>
      this.client
        .post(`/bazarr/movies/${radarrId}/search`, options || {})
        .then((r) => r.data),
    searchEpisode: (
      seriesId: number,
      episodeId: number,
      options?: { language?: string; forced?: boolean; hi?: boolean }
    ) =>
      this.client
        .post(`/bazarr/series/${seriesId}/episodes/${episodeId}/search`, options || {})
        .then((r) => r.data),
    searchSeries: (seriesId: number) =>
      this.client
        .post(`/bazarr/series/${seriesId}/search`)
        .then((r) => r.data),
    getLogs: (params?: any) =>
      this.client.get<LogEntry[]>('/bazarr/logs', { params }).then((r) => r.data),
    getHealth: () => this.client.get('/bazarr/health').then((r) => r.data),
  };

  // Discover endpoints
  discover = {
    getSections: () =>
      this.client
        .get<DiscoverSectionsResponse>('/discover/sections')
        .then((r) => r.data),
    getTrending: (type: 'movie' | 'series') =>
      this.client.get(`/discover/trending/${type}`).then((r) => r.data),
    getPopular: (type: 'movie' | 'series') =>
      this.client.get(`/discover/popular/${type}`).then((r) => r.data),
    getUpcoming: () => this.client.get('/discover/upcoming').then((r) => r.data),
    getAnticipated: (type: 'movie' | 'series') =>
      this.client.get(`/discover/anticipated/${type}`).then((r) => r.data),
    getAwards: (category: string) =>
      this.client.get(`/discover/awards/${category}`).then((r) => r.data),
    resolveExternalIds: (type: 'movie' | 'series', tmdbId: number) =>
      this.client
        .get(`/discover/external/${type}/${tmdbId}`)
        .then((r) => r.data),
  };

  // Games endpoints
  games = {
    search: (query: string, limit?: number) =>
      this.client
        .get<GameSearchResult[]>('/games/search', { params: { q: query, limit } })
        .then((r) => r.data),
    getUpcoming: (limit?: number) =>
      this.client
        .get<GameSearchResult[]>('/games/upcoming', { params: { limit } })
        .then((r) => r.data),
    getPopular: (limit?: number) =>
      this.client
        .get<GameSearchResult[]>('/games/popular', { params: { limit } })
        .then((r) => r.data),
    getAnticipated: (limit?: number) =>
      this.client
        .get<GameSearchResult[]>('/games/anticipated', { params: { limit } })
        .then((r) => r.data),
    getTopRated: (limit?: number) =>
      this.client
        .get<GameSearchResult[]>('/games/top-rated', { params: { limit } })
        .then((r) => r.data),
    getStats: () => this.client.get<GameStats>('/games/stats').then((r) => r.data),
    getDetails: (igdbId: number) =>
      this.client.get<IGDBGame>(`/games/${igdbId}`).then((r) => r.data),
    getMonitored: () =>
      this.client.get<MonitoredGame[]>('/games/monitored/all').then((r) => r.data),
    monitor: (igdbId: number, options?: { preferredReleaseType?: string; preferredPlatforms?: string[] }) =>
      this.client.post<MonitoredGame>(`/games/monitored/${igdbId}`, options).then((r) => r.data),
    unmonitor: (igdbId: number) =>
      this.client.delete(`/games/monitored/${igdbId}`).then((r) => r.data),
    getCandidates: (igdbId: number, releaseType?: string) =>
      this.client
        .get<GameDownloadCandidate[]>(`/games/${igdbId}/candidates`, { params: { releaseType } })
        .then((r) => r.data),
    startDownload: (igdbId: number, candidate: GameDownloadCandidate, downloadClient?: string) =>
      this.client
        .post(`/games/${igdbId}/download`, { candidate, downloadClient })
        .then((r) => r.data),
    checkMonitored: () =>
      this.client.post('/games/check').then((r) => r.data),
  };

  // Auth endpoints
  auth = {
    getMe: () => this.client.get('/auth/me').then((r) => r.data),
    startPlexAuth: (data: { clientId: string }) =>
      this.client.post('/auth/plex/start', data).then((r) => r.data),
    completePlexAuth: (data: { state: string; pinId: string | number; clientId: string }) =>
      this.client.post('/auth/plex/complete', data).then((r) => r.data),
    logout: () => this.client.post('/auth/logout').then((r) => r.data),
  };

  // Dasharr endpoints
  dasharr = {
    getLogs: (params?: any) =>
      this.client.get('/dasharr/logs', { params }).then((r) => r.data),
  };

  // Generic get method for custom endpoints
  get = <T = any>(url: string) =>
    this.client.get<T>(url).then((r) => r.data);

  // Generic put method for custom endpoints
  put = <T = any>(url: string, data?: any) =>
    this.client.put<T>(url, data).then((r) => r.data);

  // Generic post method for custom endpoints
  post = <T = any>(url: string, data?: any) =>
    this.client.post<T>(url, data).then((r) => r.data);

  // Health check
  getHealth = () =>
    this.client.get('/health').then((r) => r.data);
}

export const api = new ApiClient();
