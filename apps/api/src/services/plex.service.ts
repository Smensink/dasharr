import { PlexClient } from '../clients/PlexClient';
import { CacheService } from './cache.service';
import { ServiceConfig } from '../config/services.config';
import {
  PlexSession,
  PlexLibrary,
  PlexLibraryItem,
  PlexServerInfo,
} from '../types/plex.types';
import { logger } from '../utils/logger';

export interface PlexSessionTransformed {
  sessionKey: string;
  user: string;
  userThumb?: string;
  player: string;
  device: string;
  platform: string;
  state: string;
  title: string;
  type: string;
  year?: number;
  thumb?: string;
  art?: string;
  viewOffset?: number;
  duration?: number;
  progress?: number;
  transcoding?: boolean;
  bandwidth?: number;
  location?: string;
  secure?: boolean;
  relayed?: boolean;
}

export class PlexService {
  private client: PlexClient;
  private cacheService: CacheService;
  private serviceName = 'plex';

  constructor(config: ServiceConfig, cacheService: CacheService) {
    this.client = new PlexClient(config);
    this.cacheService = cacheService;
  }

  async getSessions(): Promise<PlexSession[]> {
    const cacheKey = `${this.serviceName}:sessions`;
    const cached = await this.cacheService.get<PlexSession[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const sessions = await this.client.getSessions();
    await this.cacheService.set(cacheKey, sessions, 10); // Cache for 10 seconds
    return sessions;
  }

  async getSessionsTransformed(): Promise<PlexSessionTransformed[]> {
    const sessions = await this.getSessions();
    return sessions.map((session) => this.transformSession(session));
  }

  async getLibraries(): Promise<PlexLibrary[]> {
    const cacheKey = `${this.serviceName}:libraries`;
    const cached = await this.cacheService.get<PlexLibrary[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const libraries = await this.client.getLibraries();
    await this.cacheService.set(cacheKey, libraries, 300); // Cache for 5 minutes
    return libraries;
  }

  async getLibraryItems(libraryKey: string): Promise<PlexLibraryItem[]> {
    const cacheKey = `${this.serviceName}:library:${libraryKey}:items`;
    const cached = await this.cacheService.get<PlexLibraryItem[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const items = await this.client.getLibraryItems(libraryKey);
    await this.cacheService.set(cacheKey, items, 300); // Cache for 5 minutes
    return items;
  }

  async searchMedia(query: string): Promise<PlexLibraryItem[]> {
    // No cache for search - always return fresh results
    return this.client.searchMedia(query);
  }

  async getMediaByGuid(guid: string, useCache: boolean = true): Promise<PlexLibraryItem[]> {
    const cacheKey = `${this.serviceName}:guid:${guid}`;
    
    if (useCache) {
      const cached = await this.cacheService.get<PlexLibraryItem[]>(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    const items = await this.client.getMediaByGuid(guid);
    if (useCache) {
      await this.cacheService.set(cacheKey, items, 300); // Cache for 5 minutes
    }
    return items;
  }

  async getMediaByGuidWithServer(guid: string): Promise<{ item: PlexLibraryItem; machineIdentifier: string } | null> {
    const items = await this.findMediaByGuidVariants(guid);
    if (!items || items.length === 0) {
      return null;
    }

    // If only one result, return it
    if (items.length === 1) {
      const serverInfo = await this.getServerInfo();
      return {
        item: items[0],
        machineIdentifier: serverInfo.machineIdentifier,
      };
    }

    // Multiple results - find best match
    logger.info(`[Plex] Found ${items.length} items matching GUID ${guid}, selecting best match`);

    // First, try to find exact GUID match (case-insensitive)
    const normalizedGuid = guid.toLowerCase().trim();
    const exactMatch = items.find(item => item.guid?.toLowerCase().trim() === normalizedGuid);

    if (exactMatch) {
      logger.info(`[Plex] Found exact GUID match: ${exactMatch.title} (${exactMatch.year || 'unknown year'})`);
      const serverInfo = await this.getServerInfo();
      return {
        item: exactMatch,
        machineIdentifier: serverInfo.machineIdentifier,
      };
    }

    // No exact match - log all candidates and return most recently added
    logger.warn(`[Plex] No exact GUID match, candidates:`);
    items.forEach((item, idx) => {
      logger.warn(`  ${idx + 1}. ${item.title} (${item.year || 'unknown year'}) - GUID: ${item.guid}`);
    });

    // Return most recently added item as fallback
    const mostRecent = items.reduce((latest, current) =>
      current.addedAt > latest.addedAt ? current : latest
    );

    logger.info(`[Plex] Selected most recent: ${mostRecent.title} (${mostRecent.year || 'unknown year'})`);
    const serverInfo = await this.getServerInfo();
    return {
      item: mostRecent,
      machineIdentifier: serverInfo.machineIdentifier,
    };
  }

  private async findMediaByGuidVariants(guid: string, useCache: boolean = true): Promise<PlexLibraryItem[]> {
    const candidates = this.buildGuidVariants(guid);
    for (const candidate of candidates) {
      if (!candidate) continue;
      const items = await this.tryGuidOrIdentifier(candidate, useCache);
      if (items.length > 0) {
        return items;
      }
    }
    return [];
  }

  private async tryGuidOrIdentifier(candidate: string, useCache: boolean = true): Promise<PlexLibraryItem[]> {
    const guidResults = await this.getMediaByGuid(candidate, useCache);
    if (guidResults.length > 0) {
      return guidResults;
    }
    return this.client.getMediaByIdentifier(candidate);
  }

  private buildGuidVariants(guid: string): string[] {
    const trimmed = guid?.trim();
    if (!trimmed) {
      return [];
    }

    const pairs = trimmed.split('://');
    const scheme = pairs[0]?.toLowerCase() || '';
    const rest = pairs[1] ?? '';
    const id = rest.split('?')[0];

    const variants = new Set<string>();
    variants.add(trimmed);
    if (rest) {
      variants.add(`${scheme}://${id}`);
    }

    const helper = (prefix: string, includeLang?: boolean) => {
      if (rest && id) {
        variants.add(`${prefix}://${id}`);
        if (includeLang) {
          variants.add(`${prefix}://${id}?lang=en`);
        }
      }
    };

    if (scheme === 'imdb') {
      helper('com.plexapp.agents.imdb', true);
    } else if (scheme === 'tvdb') {
      helper('com.plexapp.agents.thetvdb', true);
    } else if (scheme === 'tmdb') {
      helper('com.plexapp.agents.themoviedb', false);
    }

    return Array.from(variants);
  }

  async searchMediaWithServer(query: string): Promise<Array<PlexLibraryItem & { machineIdentifier: string }>> {
    const items = await this.searchMedia(query);
    const serverInfo = await this.getServerInfo();

    return items.map(item => ({
      ...item,
      machineIdentifier: serverInfo.machineIdentifier,
    }));
  }

  // Validate that an ID is not empty, undefined, or a placeholder
  private isValidId(id: string | number | undefined): boolean {
    if (id === undefined || id === null) return false;
    if (typeof id === 'string') {
      const trimmed = id.trim();
      if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null' || trimmed === '0') return false;
      return true;
    }
    if (typeof id === 'number') {
      return id > 0 && !isNaN(id);
    }
    return false;
  }

  // Find media by external IDs (IMDB, TVDB, TMDB)
  async findMediaByIds(params: {
    imdbId?: string;
    tmdbId?: number;
    tvdbId?: number;
    type?: 'movie' | 'episode';
    seasonNumber?: number;
    episodeNumber?: number;
    title?: string;
  }): Promise<Array<PlexLibraryItem & { machineIdentifier: string }> | null> {
    const { imdbId, tmdbId, tvdbId, type, seasonNumber, episodeNumber, title } = params;
    const serverInfo = await this.getServerInfo();

    console.log(`[Plex] findMediaByIds called: title="${title}", type=${type}, imdbId=${imdbId}, tmdbId=${tmdbId}, tvdbId=${tvdbId}, S${seasonNumber}E${episodeNumber}`);

    // Try IMDB ID first (best for movies)
    if (this.isValidId(imdbId)) {
      const guid = `imdb://${imdbId}`;
      console.log(`[Plex] Trying IMDB ID: ${guid}`);
      const items = await this.findMediaByGuidVariants(guid, false); // Don't cache
      console.log(`[Plex] IMDB search returned ${items.length} items:`, items.map(i => ({ title: i.title, type: i.type, guid: i.guid })));
      if (items.length > 0) {
        return items.map(item => ({ ...item, machineIdentifier: serverInfo.machineIdentifier }));
      }
    } else if (imdbId) {
      console.log(`[Plex] Skipping invalid IMDB ID: ${imdbId}`);
    }

    // Try TMDB ID
    if (this.isValidId(tmdbId)) {
      const guid = `tmdb://${tmdbId}`;
      console.log(`[Plex] Trying TMDB ID: ${guid}`);
      const items = await this.findMediaByGuidVariants(guid, false); // Don't cache
      console.log(`[Plex] TMDB search returned ${items.length} items:`, items.map(i => ({ title: i.title, type: i.type, guid: i.guid })));
      if (items.length > 0) {
        return items.map(item => ({ ...item, machineIdentifier: serverInfo.machineIdentifier }));
      }
    } else if (tmdbId) {
      console.log(`[Plex] Skipping invalid TMDB ID: ${tmdbId}`);
    }

    // Try TVDB ID (best for TV episodes)
    if (this.isValidId(tvdbId)) {
      // For episodes, try the specific episode GUID format
      if (type === 'episode' && seasonNumber !== undefined && episodeNumber !== undefined) {
        const episodeGuid = `tvdb://${tvdbId}/${seasonNumber}/${episodeNumber}`;
        console.log(`[Plex] Trying TVDB episode ID: ${episodeGuid}`);
        const items = await this.findMediaByGuidVariants(episodeGuid, false); // Don't cache
        console.log(`[Plex] TVDB episode search returned ${items.length} items:`, items.map(i => ({ title: i.title, type: i.type, guid: i.guid })));
        if (items.length > 0) {
          return items.map(item => ({ ...item, machineIdentifier: serverInfo.machineIdentifier }));
        }
      }
      
      // Try series-level GUID - but DON'T return it for episodes
      // We'll handle series search separately
      if (type !== 'episode') {
        const seriesGuid = `tvdb://${tvdbId}`;
        console.log(`[Plex] Trying TVDB series ID: ${seriesGuid}`);
        const items = await this.findMediaByGuidVariants(seriesGuid, false); // Don't cache
        console.log(`[Plex] TVDB series search returned ${items.length} items:`, items.map(i => ({ title: i.title, type: i.type, guid: i.guid })));
        if (items.length > 0) {
          return items.map(item => ({ ...item, machineIdentifier: serverInfo.machineIdentifier }));
        }
      }
    } else if (tvdbId) {
      console.log(`[Plex] Skipping invalid TVDB ID: ${tvdbId}`);
    }

    console.log(`[Plex] No ID-based matches found for: ${title}`);
    return null;
  }

  // Find an episode by searching for its series first
  async findEpisodeBySeries(
    seriesTitle: string,
    seasonNumber?: number,
    episodeNumber?: number
  ): Promise<(PlexLibraryItem & { machineIdentifier: string }) | null> {
    const serverInfo = await this.getServerInfo();
    
    console.log(`[Plex] findEpisodeBySeries: title="${seriesTitle}", S${seasonNumber}E${episodeNumber}`);
    
    // Search for series by title
    const seriesResults = await this.searchMedia(seriesTitle);
    console.log(`[Plex] Series search returned ${seriesResults.length} results:`, seriesResults.map(r => ({ title: r.title, type: r.type })));
    
    // Find the series (show) type
    const series = seriesResults.find(item => item.type === 'show');
    if (!series) {
      console.log(`[Plex] No series found in search results`);
      return null;
    }
    
    console.log(`[Plex] Found series: ${series.title} (ratingKey: ${series.ratingKey})`);

    // If we have season/episode numbers, try to find the specific episode
    if (seasonNumber !== undefined && episodeNumber !== undefined) {
      try {
        // Get all episodes of the series using allLeaves endpoint
        console.log(`[Plex] Fetching all episodes for series ${series.ratingKey}`);
        const episodes = await this.client.getAllLeaves(series.ratingKey);
        console.log(`[Plex] Got ${episodes.length} episodes`);
        
        // Find the matching episode
        const episode = episodes.find(ep => 
          ep.type === 'episode' && 
          ep.parentIndex === seasonNumber &&
          ep.index === episodeNumber
        );
        
        if (episode) {
          console.log(`[Plex] Found matching episode: ${episode.title}`);
          return { ...episode, machineIdentifier: serverInfo.machineIdentifier };
        } else {
          console.log(`[Plex] No matching episode found for S${seasonNumber}E${episodeNumber}`);
        }
      } catch (error) {
        console.error('[Plex] Failed to get episodes for series:', error);
      }
    }

    // Return the series if specific episode not found
    console.log(`[Plex] Falling back to returning series: ${series.title}`);
    return { ...series, machineIdentifier: serverInfo.machineIdentifier };
  }

  async getServerInfo(): Promise<PlexServerInfo> {
    const cacheKey = `${this.serviceName}:serverInfo`;
    const cached = await this.cacheService.get<PlexServerInfo>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const info = await this.client.getServerInfo();
    await this.cacheService.set(cacheKey, info, 300); // Cache for 5 minutes
    return info;
  }

  async getHealth(): Promise<{ healthy: boolean; message?: string }> {
    try {
      await this.client.getServerInfo();
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: 'Failed to connect to Plex Media Server',
      };
    }
  }

  // Transform Plex session to a simplified format
  private transformSession(session: PlexSession): PlexSessionTransformed {
    const progress = session.viewOffset && session.duration
      ? Math.round((session.viewOffset / session.duration) * 100)
      : undefined;

    return {
      sessionKey: session.sessionKey,
      user: session.User?.title || 'Unknown',
      userThumb: session.User?.thumb,
      player: session.Player?.title || session.Player?.device || 'Unknown',
      device: session.Player?.device || 'Unknown',
      platform: session.Player?.platform || 'Unknown',
      state: session.Player?.state || 'unknown',
      title: session.title,
      type: session.type,
      year: session.year,
      thumb: session.thumb || session.parentThumb || session.grandparentThumb,
      art: session.art || session.grandparentArt,
      viewOffset: session.viewOffset,
      duration: session.duration,
      progress,
      transcoding: session.Media?.[0]?.Part?.[0]?.Stream?.some(
        (stream) => stream.streamType === 1 && stream.codec !== session.Media?.[0]?.videoCodec
      ),
      bandwidth: session.Session?.bandwidth,
      location: session.Session?.location,
      secure: session.Player?.secure,
      relayed: session.Player?.relayed,
    };
  }
}
