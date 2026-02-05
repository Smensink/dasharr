import { TautulliClient } from '../clients/TautulliClient';
import { CacheService } from './cache.service';
import { ServiceConfig } from '../config/services.config';
import {
  TautulliActivity,
  TautulliHistory,
  TautulliLibraryWatchStats,
  TautulliHomeStat,
  TautulliSession,
} from '../types/tautulli.types';

export interface TautulliSessionTransformed {
  sessionKey: string;
  user: string;
  friendlyName: string;
  userThumb: string;
  player: string;
  platform: string;
  product: string;
  state: string;
  title: string;
  fullTitle: string;
  mediaType: string;
  year: number;
  thumb: string;
  viewOffset: number;
  duration: number;
  progressPercent: number;
  transcodeDecision: string;
  videoDecision: string;
  audioDecision: string;
  bandwidth: number;
  videoResolution: string;
  videoCodec: string;
  audioCodec: string;
  container: string;
  libraryName: string;
}

export class TautulliService {
  private client: TautulliClient;
  private cacheService: CacheService;
  private serviceName = 'tautulli';

  constructor(config: ServiceConfig, cacheService: CacheService) {
    this.client = new TautulliClient(config);
    this.cacheService = cacheService;
  }

  async getActivity(): Promise<TautulliActivity> {
    const cacheKey = `${this.serviceName}:activity`;
    const cached = await this.cacheService.get<TautulliActivity>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const activity = await this.client.getActivity();
    await this.cacheService.set(cacheKey, activity, 10); // Cache for 10 seconds
    return activity;
  }

  async getActivityTransformed(): Promise<{
    streamCount: number;
    transcodeCount: number;
    directPlayCount: number;
    directStreamCount: number;
    totalBandwidth: number;
    lanBandwidth: number;
    wanBandwidth: number;
    sessions: TautulliSessionTransformed[];
  }> {
    const activity = await this.getActivity();

    return {
      streamCount: activity.stream_count,
      transcodeCount: activity.stream_count_transcode,
      directPlayCount: activity.stream_count_direct_play,
      directStreamCount: activity.stream_count_direct_stream,
      totalBandwidth: activity.total_bandwidth,
      lanBandwidth: activity.lan_bandwidth,
      wanBandwidth: activity.wan_bandwidth,
      sessions: (activity.sessions || []).map((session) => this.transformSession(session)),
    };
  }

  async getHistory(limit?: number): Promise<TautulliHistory> {
    const cacheKey = `${this.serviceName}:history:${limit || 25}`;
    const cached = await this.cacheService.get<TautulliHistory>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const history = await this.client.getHistory(limit);
    await this.cacheService.set(cacheKey, history, 60); // Cache for 1 minute
    return history;
  }

  async getLibraryWatchStats(libraryId?: string): Promise<TautulliLibraryWatchStats> {
    const cacheKey = `${this.serviceName}:watchStats:${libraryId || 'all'}`;
    const cached = await this.cacheService.get<TautulliLibraryWatchStats>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const stats = await this.client.getLibraryWatchStats(libraryId);
    await this.cacheService.set(cacheKey, stats, 300); // Cache for 5 minutes
    return stats;
  }

  async getHomeStats(): Promise<TautulliHomeStat[]> {
    const cacheKey = `${this.serviceName}:homeStats`;
    const cached = await this.cacheService.get<TautulliHomeStat[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const stats = await this.client.getHomeStats();
    await this.cacheService.set(cacheKey, stats, 300); // Cache for 5 minutes
    return stats;
  }

  async getHomeStatsTransformed(): Promise<{
    stream_count: number;
    plays_today: number;
    plays_week: number;
    most_watched: Array<{ title: string; plays: number; thumb?: string }>;
  }> {
    const [activity, homeStats] = await Promise.all([
      this.getActivity(),
      this.getHomeStats(),
    ]);

    // Extract plays for today and week
    let playsToday = 0;
    let playsWeek = 0;
    const mostWatched: Array<{ title: string; plays: number; thumb?: string }> = [];

    // Parse home stats to find plays
    for (const stat of homeStats) {
      if (stat.stat_id === 'popular_tv' || stat.stat_id === 'popular_movies') {
        // Get most watched from popular stats
        if (stat.rows && stat.rows.length > 0) {
          stat.rows.forEach((row) => {
            mostWatched.push({
              title: row.title || row.grandparent_title || 'Unknown',
              plays: row.total_plays || row.plays || 0,
              thumb: row.thumb,
            });
          });
        }
      } else if (stat.stat_id === 'top_tv' || stat.stat_id === 'top_movies' || stat.stat_id === 'top_music') {
        // Also check top stats for most watched
        if (stat.rows && stat.rows.length > 0 && mostWatched.length === 0) {
          stat.rows.forEach((row) => {
            mostWatched.push({
              title: row.title || row.grandparent_title || 'Unknown',
              plays: row.total_plays || row.plays || 0,
              thumb: row.thumb,
            });
          });
        }
      }
    }

    // Get play counts from history
    try {
      const history = await this.getHistory(100);
      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - 86400;
      const oneWeekAgo = now - 604800;

      if (history.data) {
        history.data.forEach((record) => {
          if (record.stopped >= oneDayAgo) {
            playsToday++;
          }
          if (record.stopped >= oneWeekAgo) {
            playsWeek++;
          }
        });
      }
    } catch (error) {
      // If history fails, just return 0s
      console.error('Failed to fetch history for play counts:', error);
    }

    // Sort and limit most watched
    mostWatched.sort((a, b) => b.plays - a.plays);

    return {
      stream_count: activity.stream_count || 0,
      plays_today: playsToday,
      plays_week: playsWeek,
      most_watched: mostWatched.slice(0, 5),
    };
  }

  async getHealth(): Promise<{ healthy: boolean; message?: string }> {
    try {
      await this.client.getActivity();
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: 'Failed to connect to Tautulli',
      };
    }
  }

  // Transform Tautulli session to a simplified format
  private transformSession(session: TautulliSession): TautulliSessionTransformed {
    return {
      sessionKey: session.session_key,
      user: session.user,
      friendlyName: session.friendly_name,
      userThumb: session.user_thumb,
      player: session.player,
      platform: session.platform,
      product: session.product,
      state: session.state,
      title: session.title,
      fullTitle: session.full_title,
      mediaType: session.media_type,
      year: session.year,
      thumb: session.thumb,
      viewOffset: session.view_offset,
      duration: session.duration,
      progressPercent: session.progress_percent,
      transcodeDecision: session.transcode_decision,
      videoDecision: session.video_decision,
      audioDecision: session.audio_decision,
      bandwidth: session.stream_bitrate,
      videoResolution: session.stream_video_resolution,
      videoCodec: session.stream_video_codec,
      audioCodec: session.stream_audio_codec,
      container: session.stream_container,
      libraryName: session.library_name,
    };
  }
}
