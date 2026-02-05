import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { QBittorrentService } from '../services/qbittorrent.service';
import { SabnzbdService } from '../services/sabnzbd.service';
import { RdtClientService } from '../services/rdtclient.service';
import { RadarrService } from '../services/radarr.service';
import { SonarrService } from '../services/sonarr.service';
import { ReadarrService } from '../services/readarr.service';
import { ServiceError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { QueueItem, DownloadStatus, DownloadedMediaItem } from '@dasharr/shared-types';

interface DownloadControllers {
  qbittorrent?: QBittorrentService;
  sabnzbd?: SabnzbdService;
  rdtclient?: RdtClientService;
  radarr?: RadarrService;
  sonarr?: SonarrService;
  readarr?: ReadarrService;
}

// Transform *arr queue item to unified QueueItem
function transformArrQueueItem(item: any, service: string): QueueItem {
  const statusMap: Record<string, DownloadStatus> = {
    'queued': 'queued',
    'downloading': 'downloading',
    'paused': 'paused',
    'completed': 'completed',
    'failed': 'failed',
    'warning': 'warning',
    'delay': 'queued',
    'downloadClientUnavailable': 'warning',
    'downloadClientError': 'failed',
  };

  const status = statusMap[item.status?.toLowerCase()] || 'queued';
  const size = item.size || 0;
  const sizeleft = item.sizeleft || 0;
  const progress = size > 0 ? ((size - sizeleft) / size) * 100 : 0;

  return {
    id: `${service}:${item.id}`,
    title: item.title || 'Unknown',
    status,
    size,
    sizeleft,
    progress,
    timeleft: item.timeleft,
    estimatedCompletionTime: item.estimatedCompletionTime,
    downloadClient: item.downloadClient,
    downloadId: item.downloadId || item.downloadClientId,
    indexer: item.indexer,
    category: item.category,
    protocol: item.protocol,
    errorMessage: item.errorMessage || item.trackedDownloadStatusMessage,
    source: {
      service,
      itemId: item.id,
    },
  };
}

export class DownloadsController {
  private dedupeHistory = new Map<string, number>();
  private gameIndexCache?: {
    timestamp: number;
    entries: Array<{ name: string; normalized: string; fullPath: string }>;
  };
  private readonly gameIndexTtlMs = 60000;

  constructor(private clients: DownloadControllers) {}

  // Get unified queue from all download clients and *arr services
  getQueue = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const enableArrDedupe = process.env.DOWNLOADS_DEDUPE_ARR === 'true';
      const queues: QueueItem[] = [];
      const clientDownloadIds: Record<string, Set<string>> = {
        qbittorrent: new Set<string>(),
        sabnzbd: new Set<string>(),
        rdtclient: new Set<string>(),
      };

      const addClientIds = (clientKey: string, items: QueueItem[]) => {
        for (const item of items) {
          const rawId = item.downloadId || item.id?.split(':')[1];
          if (rawId) {
            clientDownloadIds[clientKey].add(rawId.toString().toLowerCase());
          }
        }
      };

      // Fetch from download clients
      if (this.clients.qbittorrent) {
        try {
          const qbitQueue = await this.clients.qbittorrent.getQueue();
          addClientIds('qbittorrent', qbitQueue);
          queues.push(...qbitQueue);
        } catch (error) {
          console.error('qBittorrent queue fetch failed:', error);
        }
      }

      if (this.clients.sabnzbd) {
        try {
          const sabnzbdQueue = await this.clients.sabnzbd.getQueue();
          addClientIds('sabnzbd', sabnzbdQueue);
          queues.push(...sabnzbdQueue);
        } catch (error) {
          console.error('SABnzbd queue fetch failed:', error);
        }
      }

      if (this.clients.rdtclient) {
        try {
          const rdtQueue = await this.clients.rdtclient.getQueue();
          addClientIds('rdtclient', rdtQueue);
          queues.push(...rdtQueue);
        } catch (error) {
          console.error('RDTClient queue fetch failed:', error);
        }
      }

      const normalizeClientKey = (name?: string): string | null => {
        if (!name) return null;
        const lower = name.toLowerCase();
        if (lower.includes('qbit')) return 'qbittorrent';
        if (lower.includes('sab')) return 'sabnzbd';
        if (lower.includes('rdt') || lower.includes('real-debrid') || lower.includes('realdebrid') || lower.includes('debrid')) {
          return 'rdtclient';
        }
        return null;
      };

      const shouldIncludeArrItem = (item: any): boolean => {
        const clientKey = normalizeClientKey(item.downloadClient);
        const rawId = item.downloadId || item.downloadClientId;
        if (!clientKey || !rawId) {
          return true;
        }

        const id = rawId.toString().toLowerCase();
        const clientSet = clientDownloadIds[clientKey];
        if (!clientSet) {
          return true;
        }

        return !clientSet.has(id);
      };

      // Fetch from *arr services and transform to unified format
      if (this.clients.radarr) {
        try {
          const radarrQueue = await this.clients.radarr.getQueue();
          if (enableArrDedupe) {
            await this.dedupeArrQueue(radarrQueue, 'Radarr');
          }
          const transformed = radarrQueue
            .filter((item: any) => shouldIncludeArrItem(item))
            .map((item: any) => transformArrQueueItem(item, 'Radarr'));
          queues.push(...transformed);
        } catch (error) {
          console.error('Radarr queue fetch failed:', error);
        }
      }

      if (this.clients.sonarr) {
        try {
          const sonarrQueue = await this.clients.sonarr.getQueue();
          if (enableArrDedupe) {
            await this.dedupeArrQueue(sonarrQueue, 'Sonarr');
          }
          const transformed = sonarrQueue
            .filter((item: any) => shouldIncludeArrItem(item))
            .map((item: any) => transformArrQueueItem(item, 'Sonarr'));
          queues.push(...transformed);
        } catch (error) {
          console.error('Sonarr queue fetch failed:', error);
        }
      }

      if (this.clients.readarr) {
        try {
          const readarrQueue = await this.clients.readarr.getQueue();
          if (enableArrDedupe) {
            await this.dedupeArrQueue(readarrQueue, 'Readarr');
          }
          const transformed = readarrQueue
            .filter((item: any) => shouldIncludeArrItem(item))
            .map((item: any) => transformArrQueueItem(item, 'Readarr'));
          queues.push(...transformed);
        } catch (error) {
          console.error('Readarr queue fetch failed:', error);
        }
      }

      // Sort by progress (downloading first, then by percentage)
      queues.sort((a, b) => {
        if (a.status === 'downloading' && b.status !== 'downloading') return -1;
        if (a.status !== 'downloading' && b.status === 'downloading') return 1;
        return (b.progress || 0) - (a.progress || 0);
      });

      await this.applyGameBadges(queues);
      res.json(queues);
    } catch (error) {
      next(new ServiceError('Failed to fetch download queue', 'downloads', 500, error));
    }
  };

  private getGameDirs(): string[] {
    const raw = process.env.GAMES_DIRS || process.env.GAME_DIRS || '';
    return raw
      .split(/[;,]/)
      .map((dir) => dir.trim())
      .filter(Boolean);
  }

  private normalizeGameName(value: string): string {
    return value
      .toLowerCase()
      .replace(/\[[^\]]+]/g, ' ')
      .replace(/\([^)]+\)/g, ' ')
      .replace(/[._-]+/g, ' ')
      .replace(
        /\b(?:fitgirl|repack|gog|steamrip|steam|codex|rune|plaza|dodi|elamigos|skidrow|razor1911|rg|x64|x86|multi\d*|eng|usa|repacks)\b/g,
        ' '
      )
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isPossibleGame(item: QueueItem): boolean {
    const category = item.category?.toLowerCase() || '';
    const title = item.title?.toLowerCase() || '';
    if (category.includes('game')) return true;
    if (category.includes('console')) return true;
    return /fitgirl|repack|gog|steamrip|codex|rune|plaza|dodi|elamigos|skidrow|razor1911/.test(
      title
    );
  }

  private async getInstalledGamesIndex(): Promise<
    Array<{ name: string; normalized: string; fullPath: string }>
  > {
    const now = Date.now();
    if (this.gameIndexCache && now - this.gameIndexCache.timestamp < this.gameIndexTtlMs) {
      return this.gameIndexCache.entries;
    }

    const dirs = this.getGameDirs();
    const entries: Array<{ name: string; normalized: string; fullPath: string }> =
      [];
    for (const dir of dirs) {
      try {
        const resolved = path.resolve(dir);
        if (!fs.existsSync(resolved)) continue;
        const items = await fs.promises.readdir(resolved, { withFileTypes: true });
        for (const entry of items) {
          if (!entry.isDirectory()) continue;
          const name = entry.name;
          const normalized = this.normalizeGameName(name);
          if (!normalized) continue;
          entries.push({
            name,
            normalized,
            fullPath: path.join(resolved, name),
          });
        }
      } catch {
        // ignore unreadable directories
      }
    }

    this.gameIndexCache = { timestamp: now, entries };
    return entries;
  }

  private findInstalledGame(
    title: string,
    installed: Array<{ name: string; normalized: string; fullPath: string }>
  ): { name: string; fullPath: string } | null {
    const normalizedTitle = this.normalizeGameName(title);
    if (!normalizedTitle || normalizedTitle.length < 4) return null;
    for (const entry of installed) {
      if (
        normalizedTitle.includes(entry.normalized) ||
        entry.normalized.includes(normalizedTitle)
      ) {
        return { name: entry.name, fullPath: entry.fullPath };
      }
    }
    return null;
  }

  private async applyGameBadges(items: QueueItem[]): Promise<void> {
    const dirs = this.getGameDirs();
    if (!dirs.length || !items.length) return;
    const installed = await this.getInstalledGamesIndex();
    if (!installed.length) return;

    for (const item of items) {
      if (!this.isPossibleGame(item)) continue;
      const match = this.findInstalledGame(item.title, installed);
      if (match) {
        item.game = {
          installed: true,
          matchName: match.name,
          matchPath: match.fullPath,
        };
      }
    }
  }

  // Get stats from all download clients
  getStats = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const stats: any = {};

      if (this.clients.qbittorrent) {
        try {
          const state = await this.clients.qbittorrent.getServerState();
          stats.qbittorrent = {
            downloadSpeed: state.dl_info_speed,
            uploadSpeed: state.up_info_speed,
            isAvailable: true,
          };
        } catch (error) {
          stats.qbittorrent = { isAvailable: false };
        }
      }

      if (this.clients.sabnzbd) {
        try {
          const sabnzbdStats = await this.clients.sabnzbd.getStats();
          stats.sabnzbd = sabnzbdStats;
        } catch (error) {
          stats.sabnzbd = { isAvailable: false };
        }
      }

      if (this.clients.rdtclient) {
        try {
          const rdtStats = await this.clients.rdtclient.getStats();
          stats.rdtclient = rdtStats;
        } catch (error) {
          stats.rdtclient = { isAvailable: false };
        }
      }

      res.json(stats);
    } catch (error) {
      next(new ServiceError('Failed to fetch download stats', 'downloads', 500, error));
    }
  };

  getTodayDownloads = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const results: DownloadedMediaItem[] = [];
      const seen = new Set<string>();
      const radarrMovieCache = new Map<number, Promise<any | null>>();
      const sonarrSeriesCache = new Map<number, Promise<any | null>>();
      const sonarrEpisodesCache = new Map<number, Promise<any[] | null>>();

      const isDownloadEvent = (eventType: string): boolean => {
        const normalized = (eventType || '').toLowerCase();
        if (!normalized) return false;
        if (normalized.includes('grab')) return false;
        if (normalized.includes('fail')) return false;
        return normalized.includes('download') || normalized.includes('import');
      };

      const isToday = (dateStr?: string): boolean => {
        if (!dateStr) return false;
        const date = new Date(dateStr);
        return date >= startOfDay && date <= endOfDay;
      };

      const pad2 = (value?: number): string =>
        value !== undefined ? String(value).padStart(2, '0') : '';

      const fetchMovieById = async (id: number) => {
        if (!this.clients.radarr) return null;
        if (!radarrMovieCache.has(id)) {
          radarrMovieCache.set(
            id,
            this.clients.radarr.getMovieById(id).catch(() => null)
          );
        }
        return radarrMovieCache.get(id) || null;
      };

      const fetchSeriesById = async (id: number) => {
        if (!this.clients.sonarr) return null;
        if (!sonarrSeriesCache.has(id)) {
          sonarrSeriesCache.set(
            id,
            this.clients.sonarr.getSeriesById(id).catch(() => null)
          );
        }
        return sonarrSeriesCache.get(id) || null;
      };

      const fetchEpisodesBySeries = async (seriesId: number) => {
        if (!this.clients.sonarr) return null;
        if (!sonarrEpisodesCache.has(seriesId)) {
          sonarrEpisodesCache.set(
            seriesId,
            this.clients.sonarr.getEpisodes(seriesId).catch(() => null)
          );
        }
        return sonarrEpisodesCache.get(seriesId) || null;
      };

      if (this.clients.radarr) {
        const history = await this.clients.radarr.getHistory({
          page: 1,
          pageSize: 50,
          sortKey: 'date',
          sortDir: 'desc',
        }) as any[];

        for (const item of history) {
          const eventType = String(item.eventType || '');
          if (!isDownloadEvent(eventType)) continue;
          if (!isToday(item.date)) continue;

          const movieId = typeof item.movieId === 'number'
            ? item.movieId
            : item.movie?.id;
          const movie = movieId ? await fetchMovieById(movieId) : null;
          const title = movie?.title || item.sourceTitle || item.movie?.title || 'Unknown';
          const dedupeKey = movieId
            ? `radarr:${movieId}`
            : `radarr:${title.toLowerCase()}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          results.push({
            id: dedupeKey,
            type: 'movie',
            service: 'radarr',
            title,
            downloadedAt: item.date,
            imdbId: movie?.imdbId,
            tmdbId: movie?.tmdbId,
            searchTitle: movie?.title || item.sourceTitle || title,
          });
        }
      }

      if (this.clients.sonarr) {
        const history = await this.clients.sonarr.getHistory({
          page: 1,
          pageSize: 100,
          sortKey: 'date',
          sortDir: 'desc',
        }) as any[];

        for (const item of history) {
          const eventType = String(item.eventType || '');
          if (!isDownloadEvent(eventType)) continue;
          if (!isToday(item.date)) continue;

          const seriesId = typeof item.seriesId === 'number'
            ? item.seriesId
            : item.series?.id;
          const episodeId = typeof item.episodeId === 'number'
            ? item.episodeId
            : item.episode?.id
              ? item.episode.id
              : Array.isArray(item.episodeIds)
                ? item.episodeIds[0]
                : undefined;

          const series = seriesId ? await fetchSeriesById(seriesId) : null;
          const episodes = seriesId && episodeId
            ? await fetchEpisodesBySeries(seriesId)
            : null;
          const episode = item.episode || episodes?.find((entry: any) => entry.id === episodeId);

          const seriesTitle = series?.title || item.series?.title;
          const seasonNumber = episode?.seasonNumber ?? item.seasonNumber;
          const episodeNumber = episode?.episodeNumber ?? item.episodeNumber;
          const episodeTitle = episode?.title || item.title || item.sourceTitle || 'Episode';
          const title = episodeTitle;

          const dedupeKey = seriesId && episodeId
            ? `sonarr:${seriesId}:${episodeId}`
            : `sonarr:${(seriesTitle || title).toLowerCase()}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          const searchTitle = seriesTitle && seasonNumber !== undefined && episodeNumber !== undefined
            ? `${seriesTitle} S${pad2(seasonNumber)}E${pad2(episodeNumber)}`
            : seriesTitle
              ? `${seriesTitle} ${episodeTitle}`
              : episodeTitle;

          results.push({
            id: dedupeKey,
            type: 'episode',
            service: 'sonarr',
            title,
            seriesTitle,
            seasonNumber,
            episodeNumber,
            downloadedAt: item.date,
            imdbId: series?.imdbId,
            tvdbId: series?.tvdbId,
            searchTitle,
          });
        }
      }

      results.sort(
        (a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime()
      );

      res.json(results.slice(0, Math.max(0, limit)));
    } catch (error) {
      next(new ServiceError('Failed to fetch today downloads', 'downloads', 500, error));
    }
  };

  // qBittorrent-specific endpoints
  getQBitTorrents = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.qbittorrent) {
        res.status(404).json({ error: 'qBittorrent not configured' });
        return;
      }

      const filter = req.query.filter as string | undefined;
      const category = req.query.category as string | undefined;
      const torrents = await this.clients.qbittorrent.getTorrents(filter, category);
      res.json(torrents);
    } catch (error) {
      next(new ServiceError('Failed to fetch torrents', 'qbittorrent', 500, error));
    }
  };

  pauseQBitTorrent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.qbittorrent) {
        res.status(404).json({ error: 'qBittorrent not configured' });
        return;
      }

      const hash = req.params.hash as string;
      await this.clients.qbittorrent.pauseTorrent(hash);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to pause torrent', 'qbittorrent', 500, error));
    }
  };

  resumeQBitTorrent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.qbittorrent) {
        res.status(404).json({ error: 'qBittorrent not configured' });
        return;
      }

      const hash = req.params.hash as string;
      await this.clients.qbittorrent.resumeTorrent(hash);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to resume torrent', 'qbittorrent', 500, error));
    }
  };

  deleteQBitTorrent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.qbittorrent) {
        res.status(404).json({ error: 'qBittorrent not configured' });
        return;
      }

      const hash = req.params.hash as string;
      const deleteFiles = req.query.deleteFiles as string === 'true';
      await this.clients.qbittorrent.deleteTorrent(hash, deleteFiles);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to delete torrent', 'qbittorrent', 500, error));
    }
  };

  recheckQBitTorrent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.qbittorrent) {
        res.status(404).json({ error: 'qBittorrent not configured' });
        return;
      }

      const hash = req.params.hash as string;
      await this.clients.qbittorrent.recheckTorrent(hash);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to recheck torrent', 'qbittorrent', 500, error));
    }
  };

  // SABnzbd-specific endpoints
  pauseSabnzbdQueue = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.sabnzbd) {
        res.status(404).json({ error: 'SABnzbd not configured' });
        return;
      }

      await this.clients.sabnzbd.pauseQueue();
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to pause SABnzbd queue', 'sabnzbd', 500, error));
    }
  };

  resumeSabnzbdQueue = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.sabnzbd) {
        res.status(404).json({ error: 'SABnzbd not configured' });
        return;
      }

      await this.clients.sabnzbd.resumeQueue();
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to resume SABnzbd queue', 'sabnzbd', 500, error));
    }
  };

  pauseSabnzbdItem = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.sabnzbd) {
        res.status(404).json({ error: 'SABnzbd not configured' });
        return;
      }

      const nzoId = req.params.nzoId as string;
      await this.clients.sabnzbd.pauseItem(nzoId);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to pause SABnzbd item', 'sabnzbd', 500, error));
    }
  };

  resumeSabnzbdItem = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.sabnzbd) {
        res.status(404).json({ error: 'SABnzbd not configured' });
        return;
      }

      const nzoId = req.params.nzoId as string;
      await this.clients.sabnzbd.resumeItem(nzoId);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to resume SABnzbd item', 'sabnzbd', 500, error));
    }
  };

  deleteSabnzbdItem = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const nzoId = req.params.nzoId as string;
      const deleteFiles = req.query.deleteFiles === 'true';
      let sabError: unknown;

      if (this.clients.sabnzbd) {
        try {
          await this.clients.sabnzbd.deleteItem(nzoId, deleteFiles);
          res.status(204).send();
          return;
        } catch (error) {
          sabError = error;
          logger.warn(`[downloads] SABnzbd delete failed for ${nzoId}, trying Arr fallback`);
        }
      }

      const fallbackRemoved = await this.removeArrDownloadBySabId(nzoId);
      if (fallbackRemoved) {
        res.status(204).send();
        return;
      }

      if (!this.clients.sabnzbd) {
        res.status(404).json({ error: 'SABnzbd not configured' });
        return;
      }

      next(new ServiceError('Failed to delete SABnzbd item', 'sabnzbd', 500, sabError));
    } catch (error) {
      next(new ServiceError('Failed to delete SABnzbd item', 'sabnzbd', 500, error));
    }
  };

  moveSabnzbdItem = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.sabnzbd) {
        res.status(404).json({ error: 'SABnzbd not configured' });
        return;
      }

      const nzoId = req.params.nzoId as string;
      const { position } = req.body;

      if (typeof position !== 'number') {
        res.status(400).json({ error: 'Position must be a number' });
        return;
      }

      await this.clients.sabnzbd.moveItem(nzoId, position);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to move SABnzbd item', 'sabnzbd', 500, error));
    }
  };

  getSabnzbdHistory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.sabnzbd) {
        res.status(404).json({ error: 'SABnzbd not configured' });
        return;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const start = req.query.start ? parseInt(req.query.start as string) : 0;

      const history = await this.clients.sabnzbd.getHistory({ limit, start });
      res.json(history);
    } catch (error) {
      next(new ServiceError('Failed to fetch SABnzbd history', 'sabnzbd', 500, error));
    }
  };

  private async dedupeArrQueue(items: any[], serviceName: string): Promise<number> {
    if (!items || items.length < 2) return 0;

    let removedCount = 0;
    const groups = new Map<string, any[]>();
    for (const item of items) {
      const key = this.getArrQueueKey(item, serviceName);
      if (!key) continue;
      const list = groups.get(key);
      if (list) {
        list.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      const scored = group
        .map((item) => ({ item, score: this.getArrQueueScore(item) }))
        .sort((a, b) => b.score - a.score);

      for (let i = 1; i < scored.length; i += 1) {
        const candidate = scored[i];
        const deleteKey = this.getArrDownloadKey(candidate.item, serviceName);
        if (!deleteKey || this.wasRecentlyDeleted(deleteKey)) continue;
        const deleted =
          (await this.deleteArrQueueItem(serviceName, candidate.item.id)) ||
          (await this.deleteArrDownload(candidate.item));

        if (deleted) {
          this.markDeleted(deleteKey);
          removedCount += 1;
          logger.info(
            `[downloads] Removed inferior ${serviceName} queue item for ${key}`
          );
        } else {
          logger.warn(
            `[downloads] Failed to remove inferior ${serviceName} queue item for ${key}`
          );
        }
      }
    }

    return removedCount;
  }

  runArrDedupe = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      logger.info('[downloads] Arr dedupe run started');
      const removedByService: Record<string, number> = {
        radarr: 0,
        sonarr: 0,
        readarr: 0,
      };

      if (this.clients.radarr) {
        const radarrQueue = await this.clients.radarr.getQueue();
        removedByService.radarr = await this.dedupeArrQueue(radarrQueue, 'Radarr');
      }

      if (this.clients.sonarr) {
        const sonarrQueue = await this.clients.sonarr.getQueue();
        removedByService.sonarr = await this.dedupeArrQueue(sonarrQueue, 'Sonarr');
      }

      if (this.clients.readarr) {
        const readarrQueue = await this.clients.readarr.getQueue();
        removedByService.readarr = await this.dedupeArrQueue(readarrQueue, 'Readarr');
      }

      const totalRemoved =
        removedByService.radarr +
        removedByService.sonarr +
        removedByService.readarr;

      logger.info(
        `[downloads] Arr dedupe run complete: removed ${totalRemoved} (radarr ${removedByService.radarr}, sonarr ${removedByService.sonarr}, readarr ${removedByService.readarr})`
      );
      res.json({ totalRemoved, removedByService });
    } catch (error) {
      next(new ServiceError('Failed to dedupe queue', 'downloads', 500, error));
    }
  };

  private getArrQueueKey(item: any, serviceName: string): string | null {
    if (serviceName === 'Radarr' && item.movieId) {
      return `radarr:${item.movieId}`;
    }
    if (serviceName === 'Sonarr' && item.seriesId) {
      const episodeIds = Array.isArray(item.episodeIds)
        ? item.episodeIds
        : item.episodeId
          ? [item.episodeId]
          : [];
      if (episodeIds.length > 0) {
        const sorted = [...episodeIds].sort((a, b) => a - b);
        return `sonarr:${item.seriesId}:${sorted.join('-')}`;
      }
    }
    if (serviceName === 'Readarr' && item.bookId) {
      return `readarr:${item.bookId}`;
    }
    if (item.title) {
      return `${serviceName.toLowerCase()}:${item.title.toLowerCase().trim()}`;
    }
    return null;
  }

  private getArrQueueScore(item: any): number {
    const customScore = Number(item.customFormatScore) || 0;
    const quality = item.quality?.quality || {};
    const resolution =
      Number(quality.resolution) ||
      this.parseResolution(quality.name) ||
      0;
    const source = String(quality.source || '').toLowerCase();
    const sourceScore =
      source.includes('bluray') ? 4000 :
      source.includes('webdl') ? 3000 :
      source.includes('web') ? 2500 :
      source.includes('hdtv') ? 2000 :
      source.includes('dvd') ? 1000 : 0;
    const revision = item.quality?.revision || {};
    const revisionScore =
      (Number(revision.version) || 0) * 200 +
      (Number(revision.real) || 0) * 20 +
      (revision.isRepack ? 50 : 0);
    const sizeScore = item.size ? item.size / (1024 * 1024) : 0;

    return customScore + resolution * 10 + sourceScore + revisionScore + sizeScore;
  }

  private parseResolution(value?: string): number {
    if (!value) return 0;
    const match = value.match(/(\d{3,4})p/i);
    return match ? Number(match[1]) : 0;
  }

  private getArrDownloadKey(item: any, serviceName: string): string | null {
    const client = String(item.downloadClient || '').toLowerCase();
    const id = item.downloadId || item.downloadClientId;
    if (!client || !id) return null;
    return `${serviceName}:${client}:${id}`;
  }

  private wasRecentlyDeleted(key: string): boolean {
    const last = this.dedupeHistory.get(key);
    if (!last) return false;
    const ttlMs = 10 * 60 * 1000;
    if (Date.now() - last > ttlMs) {
      this.dedupeHistory.delete(key);
      return false;
    }
    return true;
  }

  private markDeleted(key: string): void {
    this.dedupeHistory.set(key, Date.now());
  }

  private async deleteArrDownload(item: any): Promise<boolean> {
    const client = String(item.downloadClient || '').toLowerCase();
    const rawId = item.downloadId || item.downloadClientId;
    if (!rawId) return false;

    if (client.includes('sab')) {
      const fallbackTarget = rawId.toString();
      let deleted = false;
      if (fallbackTarget && this.clients.sabnzbd) {
        const nzoId = this.extractSabNzoId(fallbackTarget);
        if (nzoId) {
          try {
            await this.clients.sabnzbd.deleteItem(nzoId, true);
            deleted = true;
          } catch (error) {
            logger.warn(`[downloads] SABnzbd delete failed for ${fallbackTarget}: ${error}`);
          }
        }
      }

      if (!deleted) {
        const fallbackRemoved = await this.removeArrDownloadBySabId(fallbackTarget);
        if (fallbackRemoved) {
          deleted = true;
        }
      }

      if (!deleted) {
        logger.warn(`[downloads] Unable to delete SABnzbd item ${fallbackTarget}`);
      }
      return deleted;
    }

    if (client.includes('qbit')) {
      if (this.clients.qbittorrent) {
        const hash = this.extractQbitHash(rawId.toString());
        await this.clients.qbittorrent.deleteTorrent(hash, true);
        return true;
      }
      return false;
    }

    if (client.includes('rdt') || client.includes('debrid')) {
      if (this.clients.rdtclient) {
        await this.clients.rdtclient.deleteTorrent(rawId.toString(), true);
        return true;
      }
      return false;
    }

    return false;
  }

  private getArrService(serviceName: string) {
    switch (serviceName.toLowerCase()) {
      case 'radarr':
        return this.clients.radarr;
      case 'sonarr':
        return this.clients.sonarr;
      case 'readarr':
        return this.clients.readarr;
      default:
        return null;
    }
  }

  private async deleteArrQueueItem(serviceName: string, queueId: number): Promise<boolean> {
    if (!queueId) return false;
    const service = this.getArrService(serviceName);
    if (!service) return false;
    try {
      await service.deleteQueueItem(queueId, { removeFromClient: true });
      return true;
    } catch (error) {
      logger.warn(
        `[downloads] ${serviceName} deleteQueueItem failed (id=${queueId}): ${error}`
      );
      return false;
    }
  }

  private extractSabNzoId(value: string): string {
    const idx = value.toLowerCase().indexOf('nzo_');
    if (idx >= 0) {
      return value.substring(idx + 4);
    }
    return value.replace(/^sabnzbd_?/i, '');
  }

  private extractQbitHash(value: string): string {
    return value.replace(/^qbittorrent[:_]/i, '').replace(/^qbit[:_]/i, '');
  }

  private normalizeSabId(value: string): string {
    return value
      .toLowerCase()
      .replace(/^sabnzbd[:_]/, '')
      .replace(/^nzo_/, '')
      .trim();
  }

  private async removeArrDownloadBySabId(nzoId: string): Promise<boolean> {
    const target = this.normalizeSabId(nzoId);
    const candidates: Array<{ name: string; client?: RadarrService | SonarrService | ReadarrService }> = [
      { name: 'Radarr', client: this.clients.radarr },
      { name: 'Sonarr', client: this.clients.sonarr },
      { name: 'Readarr', client: this.clients.readarr },
    ];

    for (const entry of candidates) {
      if (!entry.client) continue;
      try {
        const queue = await entry.client.getQueue();
        const match = queue.find((item: any) => {
          const raw = item.downloadId || item.downloadClientId;
          if (!raw) return false;
          return this.normalizeSabId(String(raw)) === target;
        });

        if (match?.id) {
          await entry.client.deleteQueueItem(match.id, { removeFromClient: true, blocklist: false });
          logger.info(
            `[downloads] Removed ${entry.name} queue item ${match.id} via Arr fallback for ${nzoId}`
          );
          return true;
        }
      } catch (error) {
        logger.warn(
          `[downloads] Arr fallback delete failed for ${entry.name} (${nzoId}): ${error}`
        );
      }
    }

    return false;
  }

  // RDTClient endpoints
  retryRdtTorrent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.rdtclient) {
        res.status(404).json({ error: 'RDTClient not configured' });
        return;
      }

      const id = req.params.id as string;
      await this.clients.rdtclient.retryTorrent(id);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to retry RDTClient torrent', 'rdtclient', 500, error));
    }
  };

  updateRdtTorrent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.rdtclient) {
        res.status(404).json({ error: 'RDTClient not configured' });
        return;
      }

      const id = req.params.id as string;
      await this.clients.rdtclient.updateTorrent(id);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to update RDTClient torrent', 'rdtclient', 500, error));
    }
  };

  deleteRdtTorrent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!this.clients.rdtclient) {
        res.status(404).json({ error: 'RDTClient not configured' });
        return;
      }

      const id = req.params.id as string;
      const deleteFiles = req.query.deleteFiles === 'true';
      await this.clients.rdtclient.deleteTorrent(id, deleteFiles);
      res.status(204).send();
    } catch (error) {
      next(new ServiceError('Failed to delete RDTClient torrent', 'rdtclient', 500, error));
    }
  };
}
