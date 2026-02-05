import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { CacheService } from './cache.service';
import { TMDBClient, TmdbMediaItem } from '../clients/TMDBClient';
import {
  TraktClient,
  TraktListItem,
  TraktTrendingItem,
  TraktListSearchResult,
} from '../clients/TraktClient';
import { OMDbClient, OmdbResponse } from '../clients/OMDbClient';
import { configService } from './config.service';
import { logger } from '../utils/logger';
import { RadarrService } from './radarr.service';
import { SonarrService } from './sonarr.service';
import {
  DiscoverMediaItem,
  DiscoverMediaType,
  DiscoverSection,
  DiscoverSectionsResponse,
} from '@dasharr/shared-types';

interface LibraryServices {
  radarr?: RadarrService;
  sonarr?: SonarrService;
}

interface LibraryIndex {
  moviesByTmdbId: Set<number>;
  moviesByImdbId: Set<string>;
  seriesByTvdbId: Set<number>;
  seriesByImdbId: Set<string>;
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

const TTL = {
  tmdbTrending: 21600,
  tmdbPopular: 43200,
  tmdbUpcoming: 86400,
  tmdbNowPlaying: 21600,
  tmdbExternalIds: 86400,
  tmdbDetails: 86400,
  tmdbAnticipated: 21600,
  traktTrending: 21600,
  traktAnticipated: 21600,
  traktAwards: 604800,
  traktListSearch: 86400,
  omdb: 21600,
  library: 300,
  discoverSections: 21600,
};
const DISCOVER_SECTIONS_REFRESH = 600;
const DISCOVER_CACHE_VERSION = 4;
const DISCOVER_CACHE_DIR = process.env.DASHARR_DATA_DIR || '/app/data';
const DISCOVER_CACHE_FILE = path.join(DISCOVER_CACHE_DIR, 'discover', 'sections.json');

const AWARD_LISTS: Record<
  string,
  { user?: string; list?: string; title: string; description?: string; query: string }
> = {
  oscars: {
    user: 'trakt',
    list: 'oscar-winners',
    title: 'Oscar Winners',
    description: 'Academy Award winning films',
    query: 'Oscar winners',
  },
  emmys: {
    user: 'trakt',
    list: 'emmy-winners',
    title: 'Emmy Winners',
    description: 'Awarded television series',
    query: 'Emmy winners',
  },
  'golden-globes': {
    user: 'trakt',
    list: 'golden-globe-winners',
    title: 'Golden Globe Winners',
    description: 'Golden Globe award recipients',
    query: 'Golden Globe winners',
  },
  cannes: {
    user: 'trakt',
    list: 'cannes-film-festival',
    title: 'Cannes Film Festival',
    description: 'Palme d’Or and Cannes selections',
    query: 'Cannes Film Festival winners',
  },
  'oscars-nominations': {
    user: 'trakt',
    list: 'oscar-nominees',
    title: 'Oscar Nominations',
    description: 'Oscar nominated films',
    query: 'Oscar nominees',
  },
  'emmys-nominations': {
    user: 'trakt',
    list: 'emmy-nominees',
    title: 'Emmy Nominations',
    description: 'Emmy nominated series',
    query: 'Emmy nominees',
  },
  'golden-globes-nominations': {
    user: 'trakt',
    list: 'golden-globe-nominees',
    title: 'Golden Globe Nominations',
    description: 'Golden Globe nominated films and series',
    query: 'Golden Globe nominees',
  },
  'cannes-nominations': {
    user: 'trakt',
    list: 'cannes-nominees',
    title: 'Cannes Nominations',
    description: 'Cannes Film Festival nominees',
    query: 'Cannes Film Festival nominees',
  },
  aacta: {
    title: 'AACTA Awards',
    description: 'Australian Academy of Cinema and Television Arts awards',
    query: 'AACTA awards winners',
  },
  'aacta-nominations': {
    title: 'AACTA Nominations',
    description: 'AACTA awards nominees',
    query: 'AACTA awards nominees',
  },
};

type AwardMeta = {
  source?: string;
  result?: 'winner' | 'nominee';
  categoriesByTitle?: Record<string, string[]>;
};

type AwardItemsResult = {
  items: TraktListItem[];
  listName?: string;
  listSlug?: string;
  batches?: Array<{
    items: TraktListItem[];
    listName?: string;
    listSlug?: string;
    awardYear?: number;
  }>;
};

export class DiscoverService {
  private cacheService: CacheService;
  private getLibraryServices: () => LibraryServices;
  private tmdbClient?: TMDBClient;
  private traktClient?: TraktClient;
  private omdbClient?: OMDbClient;
  private tmdbConfigKey?: string;
  private traktConfigKey?: string;
  private omdbConfigKey?: string;
  private inFlight = new Map<string, Promise<any>>();
  private omdbBackoffUntil = 0;

  constructor(cacheService: CacheService, getLibraryServices?: () => LibraryServices) {
    this.cacheService = cacheService;
    this.getLibraryServices = getLibraryServices || (() => ({}));
  }

  async getSections(): Promise<DiscoverSectionsResponse> {
    const cacheKey = 'discover:sections';
    const configHash = this.getDiscoverConfigHash();
    const cached = await this.cacheService.get<DiscoverSectionsResponse>(cacheKey);
    if (
      cached &&
      cached.configHash === configHash &&
      cached.cacheVersion === DISCOVER_CACHE_VERSION
    ) {
      const { data: pruned, changed } = await this.filterLibraryFromSections(cached);
      if (changed) {
        await this.cacheService.set(cacheKey, pruned, TTL.discoverSections);
        await this.writeSectionsFile(pruned);
        return pruned;
      }
      const generatedAt = cached.generatedAt
        ? new Date(cached.generatedAt).getTime()
        : 0;
      const ageSeconds = generatedAt ? (Date.now() - generatedAt) / 1000 : 0;
      if (ageSeconds >= DISCOVER_SECTIONS_REFRESH) {
        this.refreshSectionsInBackground(cacheKey);
      }
      return cached;
    } else if (cached) {
      await this.cacheService.del(cacheKey);
    }

    const fileCached = await this.readSectionsFile();
    if (
      fileCached &&
      fileCached.configHash === configHash &&
      fileCached.cacheVersion === DISCOVER_CACHE_VERSION
    ) {
      const { data: pruned, changed } = await this.filterLibraryFromSections(fileCached);
      if (changed) {
        await this.cacheService.set(cacheKey, pruned, TTL.discoverSections);
        await this.writeSectionsFile(pruned);
        return pruned;
      }
      const generatedAt = fileCached.generatedAt
        ? new Date(fileCached.generatedAt).getTime()
        : 0;
      const ageSeconds = generatedAt ? (Date.now() - generatedAt) / 1000 : 0;
      if (ageSeconds >= DISCOVER_SECTIONS_REFRESH) {
        this.refreshSectionsInBackground(cacheKey);
      }
      await this.cacheService.set(cacheKey, fileCached, TTL.discoverSections);
      return fileCached;
    } else if (fileCached) {
      await this.deleteSectionsFile();
    }

    const fresh = await this.buildSections();
    await this.cacheService.set(cacheKey, fresh, TTL.discoverSections);
    await this.writeSectionsFile(fresh);
    return fresh;
  }

  private refreshSectionsInBackground(cacheKey: string): void {
    const key = `${cacheKey}:refresh`;
    if (this.inFlight.has(key)) return;

    const promise = (async () => {
      try {
        const fresh = await this.buildSections();
        await this.cacheService.set(cacheKey, fresh, TTL.discoverSections);
        await this.writeSectionsFile(fresh);
      } catch (error) {
        logger.warn(`Discover sections refresh failed: ${error}`);
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
  }

  private async buildSections(): Promise<DiscoverSectionsResponse> {
    const [
      trendingMovies,
      trendingSeries,
      popularMovies,
      popularSeries,
      nowPlaying,
      upcoming,
      anticipatedMovies,
      anticipatedSeries,
      oscars,
      emmys,
      goldenGlobes,
      cannes,
      oscarsNoms,
      emmysNoms,
      goldenGlobesNoms,
      cannesNoms,
      aacta,
      aactaNoms,
    ] = await Promise.all([
      this.getTrending('movie'),
      this.getTrending('series'),
      this.getPopular('movie'),
      this.getPopular('series'),
      this.getNowPlaying(),
      this.getUpcoming(),
      this.getAnticipated('movie'),
      this.getAnticipated('series'),
      this.getAwards('oscars'),
      this.getAwards('emmys'),
      this.getAwards('golden-globes'),
      this.getAwards('cannes'),
      this.getAwards('oscars-nominations'),
      this.getAwards('emmys-nominations'),
      this.getAwards('golden-globes-nominations'),
      this.getAwards('cannes-nominations'),
      this.getAwards('aacta'),
      this.getAwards('aacta-nominations'),
    ]);

    const sections: DiscoverSection[] = [
      {
        key: 'trending-movies',
        title: 'Trending Movies',
        description: 'Weekly trending movies from TMDB',
        mediaType: 'movie',
        items: trendingMovies,
      },
      {
        key: 'trending-series',
        title: 'Trending TV Shows',
        description: 'Weekly trending series from TMDB',
        mediaType: 'series',
        items: trendingSeries,
      },
      {
        key: 'popular-movies',
        title: 'Popular Movies',
        description: 'What everyone is watching right now',
        mediaType: 'movie',
        items: popularMovies,
      },
      {
        key: 'popular-series',
        title: 'Popular TV Shows',
        description: 'Top rated and popular series',
        mediaType: 'series',
        items: popularSeries,
      },
      {
        key: 'now-playing',
        title: 'Now Playing in Theaters',
        description: 'Currently in theaters',
        mediaType: 'movie',
        items: nowPlaying,
      },
      {
        key: 'upcoming',
        title: 'Coming Soon',
        description: 'Upcoming theatrical releases',
        mediaType: 'movie',
        items: upcoming,
      },
      {
        key: 'anticipated-movies',
        title: 'Most Anticipated Movies',
        description: 'Highly anticipated upcoming movies',
        mediaType: 'movie',
        items: anticipatedMovies,
      },
      {
        key: 'anticipated-series',
        title: 'Most Anticipated TV',
        description: 'Upcoming shows to watch for',
        mediaType: 'series',
        items: anticipatedSeries,
      },
      {
        key: 'oscars',
        title: AWARD_LISTS.oscars.title,
        description: AWARD_LISTS.oscars.description,
        mediaType: 'movie',
        items: oscars,
      },
      {
        key: 'emmys',
        title: AWARD_LISTS.emmys.title,
        description: AWARD_LISTS.emmys.description,
        mediaType: 'series',
        items: emmys,
      },
      {
        key: 'golden-globes',
        title: AWARD_LISTS['golden-globes'].title,
        description: AWARD_LISTS['golden-globes'].description,
        mediaType: 'movie',
        items: goldenGlobes,
      },
      {
        key: 'cannes',
        title: AWARD_LISTS.cannes.title,
        description: AWARD_LISTS.cannes.description,
        mediaType: 'movie',
        items: cannes,
      },
      {
        key: 'oscars-nominations',
        title: AWARD_LISTS['oscars-nominations'].title,
        description: AWARD_LISTS['oscars-nominations'].description,
        mediaType: 'movie',
        items: oscarsNoms,
      },
      {
        key: 'emmys-nominations',
        title: AWARD_LISTS['emmys-nominations'].title,
        description: AWARD_LISTS['emmys-nominations'].description,
        mediaType: 'series',
        items: emmysNoms,
      },
      {
        key: 'golden-globes-nominations',
        title: AWARD_LISTS['golden-globes-nominations'].title,
        description: AWARD_LISTS['golden-globes-nominations'].description,
        mediaType: 'movie',
        items: goldenGlobesNoms,
      },
      {
        key: 'cannes-nominations',
        title: AWARD_LISTS['cannes-nominations'].title,
        description: AWARD_LISTS['cannes-nominations'].description,
        mediaType: 'movie',
        items: cannesNoms,
      },
      {
        key: 'aacta',
        title: AWARD_LISTS.aacta.title,
        description: AWARD_LISTS.aacta.description,
        mediaType: 'movie',
        items: aacta,
      },
      {
        key: 'aacta-nominations',
        title: AWARD_LISTS['aacta-nominations'].title,
        description: AWARD_LISTS['aacta-nominations'].description,
        mediaType: 'movie',
        items: aactaNoms,
      },
    ];

    return {
      generatedAt: new Date().toISOString(),
      configHash: this.getDiscoverConfigHash(),
      cacheVersion: DISCOVER_CACHE_VERSION,
      sections,
    };
  }

  private async readSectionsFile(): Promise<DiscoverSectionsResponse | null> {
    try {
      const raw = await fs.promises.readFile(DISCOVER_CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.sections)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async deleteSectionsFile(): Promise<void> {
    try {
      await fs.promises.unlink(DISCOVER_CACHE_FILE);
    } catch {
      // ignore missing file
    }
  }

  private async writeSectionsFile(
    data: DiscoverSectionsResponse
  ): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(DISCOVER_CACHE_FILE), { recursive: true });
      await fs.promises.writeFile(
        DISCOVER_CACHE_FILE,
        JSON.stringify(data),
        'utf-8'
      );
    } catch (error) {
      logger.warn(`Failed to persist Discover cache: ${error}`);
    }
  }

  async getTrending(mediaType: DiscoverMediaType): Promise<DiscoverMediaItem[]> {
    const tmdbClient = this.getTmdbClient();
    if (!tmdbClient) return [];

    const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
    const cacheKey = `discover:tmdb:trending:${tmdbType}`;

    try {
      const response = await this.withCache(cacheKey, TTL.tmdbTrending, () =>
        tmdbClient.getTrending(tmdbType, 'week')
      );

      return this.enrichItems(
        this.mapTmdbResults(response.results || [], mediaType),
        tmdbType
      );
    } catch (error) {
      logger.warn(`Discover trending failed for ${tmdbType}: ${error}`);
      return [];
    }
  }

  async getPopular(mediaType: DiscoverMediaType): Promise<DiscoverMediaItem[]> {
    const tmdbClient = this.getTmdbClient();
    if (!tmdbClient) return [];

    const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
    const cacheKey = `discover:tmdb:popular:${tmdbType}`;

    try {
      const response = await this.withCache(cacheKey, TTL.tmdbPopular, () =>
        tmdbClient.getPopular(tmdbType)
      );

      return this.enrichItems(
        this.mapTmdbResults(response.results || [], mediaType),
        tmdbType
      );
    } catch (error) {
      logger.warn(`Discover popular failed for ${tmdbType}: ${error}`);
      return [];
    }
  }

  async getUpcoming(): Promise<DiscoverMediaItem[]> {
    const tmdbClient = this.getTmdbClient();
    if (!tmdbClient) return [];

    const cacheKey = 'discover:tmdb:upcoming';
    try {
      const response = await this.withCache(cacheKey, TTL.tmdbUpcoming, () =>
        tmdbClient.getUpcoming()
      );

      return this.enrichItems(
        this.mapTmdbResults(response.results || [], 'movie'),
        'movie'
      );
    } catch (error) {
      logger.warn(`Discover upcoming failed: ${error}`);
      return [];
    }
  }

  async getNowPlaying(): Promise<DiscoverMediaItem[]> {
    const tmdbClient = this.getTmdbClient();
    if (!tmdbClient) return [];

    const cacheKey = 'discover:tmdb:nowPlaying';
    try {
      const response = await this.withCache(cacheKey, TTL.tmdbNowPlaying, () =>
        tmdbClient.getNowPlaying()
      );

      return this.enrichItems(
        this.mapTmdbResults(response.results || [], 'movie'),
        'movie'
      );
    } catch (error) {
      logger.warn(`Discover now playing failed: ${error}`);
      return [];
    }
  }

  async getAnticipated(mediaType: DiscoverMediaType): Promise<DiscoverMediaItem[]> {
    const traktClient = this.getTraktClient();
    if (!traktClient) {
      return this.getAnticipatedFallback(mediaType, 'Trakt not configured');
    }

    const traktType = mediaType === 'movie' ? 'movies' : 'shows';
    const targetCount = 30;
    const pageLimit = 50;
    const maxPages = 6;

    try {
      const libraryIndex = await this.getLibraryIndex();
      const collected: DiscoverMediaItem[] = [];
      const seen = new Set<string>();
      for (let page = 1; page <= maxPages; page += 1) {
        const cacheKey = `discover:trakt:anticipated:${traktType}:p${page}:l${pageLimit}`;
        const response = await this.withCache(
          cacheKey,
          TTL.traktAnticipated,
          () => traktClient.getAnticipated(traktType, { page, limit: pageLimit }),
          { emptyTtl: 300 }
        );
        if (!Array.isArray(response)) {
          await this.cacheService.del(cacheKey);
          logger.warn(
            `Discover anticipated returned non-array for ${traktType}: ${typeof response}`
          );
          return this.getAnticipatedFallback(
            mediaType,
            'Trakt returned non-array response'
          );
        }

        const mapped = this.mapTraktResults(response, mediaType);
        for (const item of mapped) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          let candidate = item;
          if (libraryIndex) {
            candidate = this.applyLibraryStatusWithIndex([item], libraryIndex)[0];
          }
          if (!candidate.inLibrary) {
            collected.push(candidate);
          }
          if (collected.length >= targetCount) break;
        }
        if (response.length < pageLimit) break;
        if (collected.length >= targetCount) break;
      }

      const enriched = await this.enrichItems(collected);
      if (!enriched.length) {
        return this.getAnticipatedFallback(mediaType, 'Trakt returned empty list');
      }
      return enriched.slice(0, targetCount);
    } catch (error) {
      logger.warn(`Discover anticipated failed for ${traktType}: ${error}`);
      return this.getAnticipatedFallback(mediaType, 'Trakt error');
    }
  }

  private async getAnticipatedFallback(
    mediaType: DiscoverMediaType,
    reason: string
  ): Promise<DiscoverMediaItem[]> {
    logger.info(`[discover] Anticipated fallback for ${mediaType}: ${reason}`);
    if (mediaType === 'movie') {
      return this.getUpcoming();
    }
    return this.getTrending('series');
  }

  async getAwards(category: string): Promise<DiscoverMediaItem[]> {
    const traktClient = this.getTraktClient();
    if (!traktClient) return [];

    const award = AWARD_LISTS[category];
    if (!award) {
      throw new Error(`Unknown awards category: ${category}`);
    }

    const cacheKey = `discover:trakt:awards:${category}`;
    try {
      const preferredYears = this.getPreferredAwardYears();
      const response = await this.withCache(
        cacheKey,
        TTL.traktAwards,
        () => {
          if (category.startsWith('oscars')) {
            return this.fetchAwardListItemsMultiYear(award, category, preferredYears);
          }
          return this.fetchAwardListItems(award, category);
        },
        { emptyTtl: 3600 }
      );

      const mediaType: DiscoverMediaType =
        category === 'emmys' || category === 'emmys-nominations'
          ? 'series'
          : 'movie';
      const awardMeta: AwardMeta = {
        source: this.getAwardSource(category),
        result: category.includes('nominations') ? 'nominee' : 'winner',
      };
      let oscarsCategories:
        | { year: number; categoriesByTitle: Record<string, string[]> }
        | undefined;
      let goldenGlobesCategories:
        | { year: number; categoriesByTitle: Record<string, string[]> }
        | undefined;
      let emmysCategories:
        | { year: number; categoriesByTitle: Record<string, string[]> }
        | undefined;
      let aactaCategories:
        | { year: number; categoriesByTitle: Record<string, string[]> }
        | undefined;
      if (category.startsWith('oscars')) {
        oscarsCategories = await this.getOscarsNomineeCategories(preferredYears);
        if (oscarsCategories?.categoriesByTitle) {
          awardMeta.categoriesByTitle = oscarsCategories.categoriesByTitle;
        }
      }
      if (category.startsWith('golden-globes')) {
        goldenGlobesCategories = await this.getGoldenGlobesCategories(
          preferredYears,
          awardMeta.result === 'winner' ? 'winners' : 'nominees'
        );
        if (goldenGlobesCategories?.categoriesByTitle) {
          awardMeta.categoriesByTitle = goldenGlobesCategories.categoriesByTitle;
        }
      }
      if (category.startsWith('emmys')) {
        emmysCategories = await this.getEmmysCategories(
          preferredYears,
          awardMeta.result === 'winner' ? 'winners' : 'nominees'
        );
        if (emmysCategories?.categoriesByTitle) {
          awardMeta.categoriesByTitle = emmysCategories.categoriesByTitle;
        }
      }
      if (category.startsWith('aacta')) {
        aactaCategories = await this.getAactaCategories(
          preferredYears,
          awardMeta.result === 'winner' ? 'winners' : 'nominees'
        );
        if (aactaCategories?.categoriesByTitle) {
          awardMeta.categoriesByTitle = aactaCategories.categoriesByTitle;
        }
      }
      if (response.batches?.length) {
        const mapped = response.batches.flatMap((batch) => {
          const batchYear =
            batch.awardYear ||
            this.extractAwardYear(batch.listSlug) ||
            this.extractAwardYear(batch.listName);
          return this.mapTraktListResults(
            batch.items,
            mediaType,
            batchYear,
            awardMeta
          );
        });
        const deduped = this.dedupeAwardItems(mapped);
        const enriched = await this.enrichItems(deduped);
        return this.sortByReleaseYearDesc(enriched);
      }

      const awardYear =
        oscarsCategories?.year ||
        goldenGlobesCategories?.year ||
        emmysCategories?.year ||
        aactaCategories?.year ||
        this.extractAwardYear(response.listSlug) ||
        this.extractAwardYear(response.listName) ||
        this.extractAwardYear(award.list) ||
        this.extractAwardYear(award.title);
      const items = this.mapTraktListResults(
        response.items,
        mediaType,
        awardYear,
        awardMeta
      );
      const enriched = await this.enrichItems(items);
      return this.sortByReleaseYearDesc(enriched);
    } catch (error) {
      logger.warn(`Discover awards failed for ${category}: ${error}`);
      return [];
    }
  }

  async resolveExternalIds(
    mediaType: DiscoverMediaType,
    tmdbId: number
  ): Promise<{ imdbId?: string; tvdbId?: number }> {
    const tmdbClient = this.getTmdbClient();
    if (!tmdbClient) {
      throw new Error('TMDB service is not configured');
    }

    const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
    const cacheKey = `discover:tmdb:external:${tmdbType}:${tmdbId}`;
    const external = await this.withCache(cacheKey, TTL.tmdbExternalIds, () =>
      tmdbClient.getExternalIds(tmdbType, tmdbId)
    );

    return {
      imdbId: external.imdb_id || undefined,
      tvdbId: external.tvdb_id || undefined,
    };
  }

  private getTmdbClient(): TMDBClient | null {
    const cfg = configService.getServiceConfig('tmdb');
    if (!cfg?.enabled || !cfg.baseUrl || !cfg.apiKey) return null;

    const key = JSON.stringify({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      timeout: cfg.timeout,
    });

    if (!this.tmdbClient || this.tmdbConfigKey !== key) {
      this.tmdbClient = new TMDBClient(cfg);
      this.tmdbConfigKey = key;
    }
    return this.tmdbClient;
  }

  private getTraktClient(): TraktClient | null {
    const cfg = configService.getServiceConfig('trakt');
    if (!cfg?.enabled || !cfg.apiKey) return null;

    const normalizedBaseUrl = this.normalizeTraktBaseUrl(cfg.baseUrl);
    if (!normalizedBaseUrl) return null;

    const key = JSON.stringify({
      baseUrl: normalizedBaseUrl,
      apiKey: cfg.apiKey,
      timeout: cfg.timeout,
    });

    if (!this.traktClient || this.traktConfigKey !== key) {
      this.traktClient = new TraktClient({
        ...cfg,
        baseUrl: normalizedBaseUrl,
      });
      this.traktConfigKey = key;
    }
    return this.traktClient;
  }

  private normalizeTraktBaseUrl(baseUrl?: string): string | null {
    if (!baseUrl) return null;
    let normalized = baseUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
    normalized = normalized.replace(/\/+$/, '');
    if (
      normalized.includes('trakt.tv') &&
      !normalized.includes('api.trakt.tv')
    ) {
      logger.warn(
        `[discover] Trakt baseUrl "${baseUrl}" is not the API endpoint. Using https://api.trakt.tv.`
      );
      normalized = 'https://api.trakt.tv';
    }
    return normalized;
  }

  private getDiscoverConfigHash(): string {
    const tmdb = configService.getServiceConfig('tmdb');
    const trakt = configService.getServiceConfig('trakt');
    const omdb = configService.getServiceConfig('omdb');
    const payload = {
      tmdb: {
        enabled: tmdb?.enabled,
        baseUrl: tmdb?.baseUrl,
        apiKey: tmdb?.apiKey,
      },
      trakt: {
        enabled: trakt?.enabled,
        baseUrl: this.normalizeTraktBaseUrl(trakt?.baseUrl),
        apiKey: trakt?.apiKey,
      },
      omdb: {
        enabled: omdb?.enabled,
        baseUrl: omdb?.baseUrl,
        apiKey: omdb?.apiKey,
      },
    };
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private getOmdbClient(): OMDbClient | null {
    const cfg = configService.getServiceConfig('omdb');
    if (!cfg?.enabled || !cfg.baseUrl || !cfg.apiKey) return null;

    const key = JSON.stringify({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      timeout: cfg.timeout,
    });

    if (!this.omdbClient || this.omdbConfigKey !== key) {
      this.omdbClient = new OMDbClient(cfg);
      this.omdbConfigKey = key;
    }
    return this.omdbClient;
  }

  private mapTmdbResults(
    items: TmdbMediaItem[],
    mediaType: DiscoverMediaType
  ): DiscoverMediaItem[] {
    return items.map((item) => {
      const title = mediaType === 'movie' ? item.title : item.name;
      const date =
        mediaType === 'movie' ? item.release_date : item.first_air_date;
      const year = date ? Number(date.slice(0, 4)) : undefined;
      return {
        id: `tmdb:${mediaType}:${item.id}`,
        mediaType,
        title: title || 'Untitled',
        year,
        overview: item.overview,
        posterUrl: item.poster_path
          ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}`
          : undefined,
        backdropUrl: item.backdrop_path
          ? `${TMDB_IMAGE_BASE}/w780${item.backdrop_path}`
          : undefined,
        releaseDate: date,
        tmdbId: item.id,
        source: {
          provider: 'tmdb',
          id: item.id,
        },
      };
    });
  }

  private mapTraktResults(
    items: TraktTrendingItem[],
    mediaType: DiscoverMediaType
  ): DiscoverMediaItem[] {
    return items
      .map((item) => (mediaType === 'movie' ? item.movie : item.show))
      .filter(Boolean)
      .map((media) => this.mapTraktMedia(mediaType, media!));
  }

  private mapTraktListResults(
    items: TraktListItem[],
    _mediaType: DiscoverMediaType,
    awardYear?: number,
    awardMeta?: AwardMeta
  ): DiscoverMediaItem[] {
    return items
      .map((item) => {
        const media = item.type === 'movie' ? item.movie : item.show;
        if (!media) return null;
        const itemMediaType: DiscoverMediaType =
          item.type === 'movie' ? 'movie' : 'series';
        const normalizedTitle = this.normalizeAwardTitle(media.title);
        const categories = awardMeta?.categoriesByTitle?.[normalizedTitle];
        const resolvedAwardNote =
          item.notes ||
          (awardMeta?.source && awardMeta?.result
            ? `${awardMeta.source} ${
                awardMeta.result === 'winner' ? 'Winner' : 'Nominee'
              }`
            : undefined);
        return this.mapTraktMedia(
          itemMediaType,
          media,
          resolvedAwardNote,
          this.extractAwardYear(item.notes) || awardYear,
          {
            source: awardMeta?.source,
            result: awardMeta?.result,
            categories,
          }
        );
      })
      .filter(Boolean) as DiscoverMediaItem[];
  }

  private async fetchAwardListItems(
    award: { user?: string; list?: string; title: string; query: string },
    category: string
  ): Promise<AwardItemsResult> {
    const traktClient = this.getTraktClient();
    if (!traktClient) return { items: [] };
    const intent = category.includes('nominations') ? 'nominations' : 'winners';

    if (award.user && award.list) {
      try {
        const items = await traktClient.getListItems(award.user, award.list);
        if (items?.length) {
          return { items, listSlug: award.list };
        }
      } catch (error) {
        logger.warn(
          `Trakt list ${award.user}/${award.list} not available for ${category}: ${error}`
        );
      }
    }

    const preferredYears = this.getPreferredAwardYears();
    for (const year of preferredYears) {
      const cacheKey = `discover:trakt:listSearch:${category}:${year}`;
      const yearResults = await this.withCache(
        cacheKey,
        TTL.traktListSearch,
        () => traktClient.searchLists(`${award.query} ${year}`, 8),
        { emptyTtl: 21600 }
      );
      const best = this.selectBestList(yearResults, preferredYears, intent);
      if (best) {
        const items = await this.fetchListItemsById(best, category);
        if (items) {
          return items;
        }
      }
    }

    const cacheKey = `discover:trakt:listSearch:${category}:base`;
    const searchResults = await this.withCache(
      cacheKey,
      TTL.traktListSearch,
      () => traktClient.searchLists(award.query, 8),
      { emptyTtl: 21600 }
    );

    const best = this.selectBestList(searchResults, preferredYears, intent);
    if (best) {
      const items = await this.fetchListItemsById(best, category);
      if (items) {
        return items;
      }
    }

    logger.warn(`No Trakt awards list results for ${category}`);
    return { items: [] };
  }

  private async fetchAwardListItemsMultiYear(
    award: { user?: string; list?: string; title: string; query: string },
    category: string,
    years: number[]
  ): Promise<AwardItemsResult> {
    const traktClient = this.getTraktClient();
    if (!traktClient) return { items: [] };
    const intent = category.includes('nominations') ? 'nominations' : 'winners';
    const batches: AwardItemsResult['batches'] = [];

    for (const year of years) {
      const cacheKey = `discover:trakt:listSearch:${category}:${year}`;
      const yearResults = await this.withCache(
        cacheKey,
        TTL.traktListSearch,
        () => traktClient.searchLists(`${award.query} ${year}`, 8),
        { emptyTtl: 21600 }
      );
      const best = this.selectBestList(yearResults, [year], intent);
      if (best) {
        const items = await this.fetchListItemsById(best, category);
        if (items?.items?.length) {
          batches.push({
            items: items.items,
            listName: items.listName,
            listSlug: items.listSlug,
            awardYear: year,
          });
        }
      }
    }

    if (batches.length > 0) {
      return { items: batches.flatMap((batch) => batch.items), batches };
    }

    return this.fetchAwardListItems(award, category);
  }

  private dedupeAwardItems(items: DiscoverMediaItem[]): DiscoverMediaItem[] {
    const seen = new Set<string>();
    const results: DiscoverMediaItem[] = [];
    for (const item of items) {
      const key =
        item.tmdbId
          ? `tmdb:${item.tmdbId}`
          : item.imdbId
            ? `imdb:${item.imdbId}`
            : `title:${this.normalizeAwardTitle(item.title)}:${item.year ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(item);
    }
    return results;
  }

  private selectBestList(
    results: TraktListSearchResult[] | undefined,
    preferredYears: number[],
    intent: 'winners' | 'nominations'
  ):
    | {
        username: string;
        listId: string;
        listName?: string;
        listSlug?: string;
      }
    | undefined {
    if (!results?.length) return undefined;

    let bestScore = -Infinity;
    let best:
      | {
          username: string;
          listId: string;
          listName?: string;
          listSlug?: string;
        }
      | undefined;

    for (const result of results) {
      const list = result.list;
      const username = list?.user?.username;
      const listSlug = list?.ids?.slug;
      const listId = listSlug || (list?.ids?.trakt?.toString() ?? '');
      if (!username || !listId) continue;

      const listText = `${list?.name || ''} ${listSlug || ''}`.toLowerCase();
      const listYear =
        this.extractAwardYear(list?.name) ||
        this.extractAwardYear(listSlug) ||
        undefined;

      let score = 0;
      if (typeof result.score === 'number') {
        score += result.score;
      }
      if (listYear) {
        score += listYear;
        const preferredIndex = preferredYears.indexOf(listYear);
        if (preferredIndex >= 0) {
          score += (preferredYears.length - preferredIndex) * 10000;
        }
      }

      if (intent === 'nominations') {
        if (listText.includes('nominee') || listText.includes('nomination')) {
          score += 5000;
        }
      } else if (listText.includes('winner') || listText.includes('winners')) {
        score += 5000;
      }

      if (score > bestScore) {
        bestScore = score;
        best = { username, listId, listName: list?.name, listSlug };
      }
    }

    return best;
  }

  private async fetchListItemsById(
    listInfo: { username: string; listId: string; listName?: string; listSlug?: string },
    category: string
  ): Promise<{ items: TraktListItem[]; listName?: string; listSlug?: string } | undefined> {
    const traktClient = this.getTraktClient();
    if (!traktClient) return undefined;

    try {
      const items = await traktClient.getListItems(
        listInfo.username,
        listInfo.listId
      );
      if (items?.length) {
        logger.info(
          `Discover awards fallback list for ${category}: ${listInfo.username}/${listInfo.listId}`
        );
        return {
          items,
          listName: listInfo.listName,
          listSlug: listInfo.listSlug || listInfo.listId,
        };
      }
    } catch (error) {
      logger.warn(
        `Trakt list fallback failed for ${category} (${listInfo.username}/${listInfo.listId}): ${error}`
      );
    }

    return undefined;
  }

  private getPreferredAwardYears(): number[] {
    const year = new Date().getFullYear();
    return [year, year - 1, year - 2];
  }

  private getAwardSource(category: string): string | undefined {
    switch (category) {
      case 'oscars':
      case 'oscars-nominations':
        return 'Oscars';
      case 'emmys':
      case 'emmys-nominations':
        return 'Emmys';
      case 'golden-globes':
      case 'golden-globes-nominations':
        return 'Golden Globes';
      case 'cannes':
      case 'cannes-nominations':
        return 'Cannes Film Festival';
      case 'aacta':
      case 'aacta-nominations':
        return 'AACTA Awards';
      default:
        return AWARD_LISTS[category]?.title;
    }
  }

  private normalizeAwardTitle(value?: string): string {
    if (!value) return '';
    const stripped = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\(\s*(19|20)\d{2}\s*\)/g, ' ')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    return stripped.replace(/^(the|a|an)\s+/, '');
  }

  private async getOscarsNomineeCategories(
    preferredYears: number[]
  ): Promise<{ year: number; categoriesByTitle: Record<string, string[]> } | undefined> {
    for (const year of preferredYears) {
      const cacheKey = `discover:oscars:nominees:${year}`;
      const data = await this.withCache(
        cacheKey,
        TTL.traktAwards,
        () => this.fetchOscarsNomineeData(year),
        { emptyTtl: 3600 }
      );
      if (data && Object.keys(data.categoriesByTitle).length > 0) {
        return data;
      }
    }
    return undefined;
  }

  private async fetchOscarsNomineeData(
    year: number
  ): Promise<{ year: number; categoriesByTitle: Record<string, string[]> }> {
    const url = `https://www.oscars.org/oscars/ceremonies/${year}`;
    const content = await this.fetchOscarsContent(url);
    const text = this.extractOscarsText(content);
    return {
      year,
      categoriesByTitle: this.parseOscarsNominees(text),
    };
  }

  private async fetchOscarsContent(url: string): Promise<string> {
    const jinaUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`;
    try {
      const response = await axios.get(jinaUrl, { timeout: 15000 });
      if (typeof response.data === 'string') {
        return response.data;
      }
    } catch (error) {
      logger.warn(`Oscars fetch via jina failed for ${url}: ${error}`);
    }

    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (typeof response.data === 'string') {
        return response.data;
      }
    } catch (error) {
      logger.warn(`Oscars fetch failed for ${url}: ${error}`);
    }
    return '';
  }

  private extractOscarsText(content: string): string {
    const marker = 'Markdown Content:';
    const index = content.indexOf(marker);
    if (index >= 0) {
      return content.slice(index + marker.length);
    }
    return this.stripHtml(content);
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  private parseOscarsNominees(text: string): Record<string, string[]> {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const startIndex = lines.findIndex(
      (line) => line.toUpperCase() === 'NOMINEES'
    );
    if (startIndex === -1) return {};

    const categoriesByTitle: Record<string, string[]> = {};
    let index = startIndex + 1;

    while (index < lines.length) {
      const category = lines[index];
      if (lines[index + 1] !== 'Nominees') {
        index += 1;
        continue;
      }
      index += 2;
      const nominees: string[] = [];
      while (index < lines.length) {
        if (lines[index + 1] === 'Nominees') {
          break;
        }
        nominees.push(lines[index]);
        index += 1;
      }
      this.collectOscarsNominees(categoriesByTitle, category, nominees);
    }

    return categoriesByTitle;
  }

  private collectOscarsNominees(
    categoriesByTitle: Record<string, string[]>,
    category: string,
    nomineeLines: string[]
  ) {
    for (let idx = 0; idx < nomineeLines.length; idx += 2) {
      const primary = nomineeLines[idx];
      const secondary = nomineeLines[idx + 1];
      if (!primary || !secondary) break;
      const title = this.resolveOscarsNomineeTitle(category, primary, secondary);
      if (!title || this.isOscarsNoise(title)) continue;
      const normalized = this.normalizeAwardTitle(title);
      if (!normalized) continue;
      if (!categoriesByTitle[normalized]) {
        categoriesByTitle[normalized] = [];
      }
      if (!categoriesByTitle[normalized].includes(category)) {
        categoriesByTitle[normalized].push(category);
      }
    }
  }

  private resolveOscarsNomineeTitle(
    category: string,
    primary: string,
    secondary: string
  ): string | undefined {
    const categoryLower = category.toLowerCase();
    if (categoryLower.includes('actor') || categoryLower.includes('actress')) {
      return secondary;
    }
    if (categoryLower.includes('international feature')) {
      return secondary;
    }
    if (categoryLower.includes('original song')) {
      const match = secondary.match(/from\s+([^;]+?)(?:;|$)/i);
      return match ? match[1].trim() : secondary;
    }
    return primary;
  }

  private isOscarsNoise(value: string): boolean {
    const lower = value.toLowerCase();
    return lower === 'nominees to be determined' || lower === 'tbd';
  }

  private async getGoldenGlobesCategories(
    preferredYears: number[],
    intent: 'winners' | 'nominees'
  ): Promise<{ year: number; categoriesByTitle: Record<string, string[]> } | undefined> {
    for (const year of preferredYears) {
      const cacheKey = `discover:golden-globes:${intent}:${year}`;
      const data = await this.withCache(
        cacheKey,
        TTL.traktAwards,
        () => this.fetchGoldenGlobesData(year, intent),
        { emptyTtl: 3600 }
      );
      if (data && Object.keys(data.categoriesByTitle).length > 0) {
        return data;
      }
    }
    return undefined;
  }

  private async fetchGoldenGlobesData(
    year: number,
    intent: 'winners' | 'nominees'
  ): Promise<{ year: number; categoriesByTitle: Record<string, string[]> }> {
    const urls = this.getGoldenGlobesCandidateUrls(year, intent);
    for (const url of urls) {
      const content = await this.fetchAwardPage(url, `Golden Globes ${intent}`);
      if (!content) continue;
      const text = this.extractOscarsText(content);
      const categoriesByTitle = this.parseGoldenGlobesNominees(text);
      if (Object.keys(categoriesByTitle).length > 0) {
        return { year, categoriesByTitle };
      }
    }
    return { year, categoriesByTitle: {} };
  }

  private getGoldenGlobesCandidateUrls(
    year: number,
    intent: 'winners' | 'nominees'
  ): string[] {
    const ordinal = this.toOrdinal(year - 1943);
    if (intent === 'nominees') {
      return [
        `https://goldenglobes.com/articles/nominations-announced-for-the-${ordinal}-annual-golden-globes/`,
        `https://goldenglobes.com/articles/nominations-announced-for-${ordinal}-annual-golden-globes/`,
        `https://goldenglobes.com/articles/nominations-announced-for-the-${ordinal}-golden-globes/`,
        `https://goldenglobes.com/articles/nominations-announced-for-${ordinal}-golden-globes/`,
      ];
    }
    return [
      `https://goldenglobes.com/articles/the-${ordinal}-golden-globe-awards-winners/`,
      `https://goldenglobes.com/articles/the-${ordinal}-annual-golden-globe-awards-winners/`,
      `https://goldenglobes.com/articles/the-${ordinal}-golden-globes-awards-winners/`,
      `https://goldenglobes.com/articles/${ordinal}-golden-globe-awards-winners/`,
    ];
  }

  private parseGoldenGlobesNominees(text: string): Record<string, string[]> {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const categoriesByTitle: Record<string, string[]> = {};
    let currentCategory: string | undefined;
    let started = false;

    for (const line of lines) {
      if (!started && /complete list of nominees/i.test(line)) {
        started = true;
        continue;
      }
      if (this.isGoldenGlobesCategory(line)) {
        currentCategory = this.normalizeCategory(line);
        started = true;
        continue;
      }
      if (!started || !currentCategory) continue;

      const title = this.extractGoldenGlobesTitle(currentCategory, line);
      if (!title) continue;
      const normalized = this.normalizeAwardTitle(title);
      if (!normalized) continue;
      if (!categoriesByTitle[normalized]) {
        categoriesByTitle[normalized] = [];
      }
      if (!categoriesByTitle[normalized].includes(currentCategory)) {
        categoriesByTitle[normalized].push(currentCategory);
      }
    }

    return categoriesByTitle;
  }

  private isGoldenGlobesCategory(line: string): boolean {
    const normalized = line.replace(/[–—]/g, '-');
    if (!/^[A-Z0-9][A-Z0-9 '&:,.-]+$/.test(normalized)) return false;
    return line.includes('BEST') || line.includes('CINEMATIC');
  }

  private extractGoldenGlobesTitle(category: string, line: string): string | undefined {
    if (!line || line.length < 2) return undefined;
    if (/^BEST\b/.test(line)) return undefined;
    const cleaned = line.replace(/^["“”']+|["“”']+$/g, '').trim();
    const categoryUpper = category.toUpperCase();

    const dashMatch = cleaned.split(/\s(?:–|—|-){1,2}\s/);
    if (dashMatch.length > 1 && categoryUpper.includes('SONG')) {
      return dashMatch[dashMatch.length - 1].replace(/["“”']/g, '').trim();
    }

    const parenMatch = cleaned.match(/\(([^)]+)\)/);
    if (parenMatch && categoryUpper.match(/ACTOR|ACTRESS|DIRECTOR|SCREENPLAY|SCORE|SONG/)) {
      return parenMatch[1].trim();
    }

    if (parenMatch) {
      return cleaned.split('(')[0].trim();
    }

    return cleaned;
  }

  private normalizeCategory(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private async getEmmysCategories(
    preferredYears: number[],
    intent: 'winners' | 'nominees'
  ): Promise<{ year: number; categoriesByTitle: Record<string, string[]> } | undefined> {
    for (const year of preferredYears) {
      const cacheKey = `discover:emmys:${intent}:${year}`;
      const data = await this.withCache(
        cacheKey,
        TTL.traktAwards,
        () => this.fetchEmmysData(year),
        { emptyTtl: 3600 }
      );
      const categoriesByTitle =
        intent === 'winners' ? data.winnersByTitle : data.nomineesByTitle;
      if (categoriesByTitle && Object.keys(categoriesByTitle).length > 0) {
        return { year, categoriesByTitle };
      }
    }
    return undefined;
  }

  private async fetchEmmysData(year: number): Promise<{
    winnersByTitle: Record<string, string[]>;
    nomineesByTitle: Record<string, string[]>;
  }> {
    const categories = [
      {
        slug: 'outstanding-drama-series',
        name: 'Outstanding Drama Series',
      },
      {
        slug: 'outstanding-comedy-series',
        name: 'Outstanding Comedy Series',
      },
      {
        slug: 'outstanding-animated-program',
        name: 'Outstanding Animated Program',
      },
    ];

    const winnersByTitle: Record<string, string[]> = {};
    const nomineesByTitle: Record<string, string[]> = {};

    for (const category of categories) {
      const url = `https://www.televisionacademy.com/awards/nominees-winners/${year}/${category.slug}`;
      const content = await this.fetchAwardPage(url, `Emmys ${category.name}`);
      if (!content) continue;
      const text = this.extractOscarsText(content);
      const parsed = this.parseEmmysCategory(text, category.name);
      this.mergeAwardCategories(winnersByTitle, parsed.winners, category.name);
      this.mergeAwardCategories(nomineesByTitle, parsed.nominees, category.name);
    }

    return { winnersByTitle, nomineesByTitle };
  }

  private parseEmmysCategory(
    text: string,
    categoryName: string
  ): { winners: string[]; nominees: string[] } {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const winners: string[] = [];
    const nominees: string[] = [];
    let inCategory = false;
    let lastLabel: 'winner' | 'nominee' | undefined;

    for (const line of lines) {
      if (line.startsWith('##')) {
        const heading = line.replace(/^#+\s*/, '');
        if (heading === categoryName) {
          inCategory = true;
          lastLabel = undefined;
          continue;
        }
        if (inCategory) {
          break;
        }
      }
      if (!inCategory) continue;

      if (/\bWinner\b/i.test(line)) {
        lastLabel = 'winner';
      } else if (/\bNominee\b/i.test(line)) {
        lastLabel = 'nominee';
      }

      if (line.startsWith('###')) {
        const title = line.replace(/^###\s*/, '').trim();
        if (!title) continue;
        if (lastLabel === 'winner') {
          winners.push(title);
        } else {
          nominees.push(title);
        }
      }
    }

    return { winners, nominees };
  }

  private async getAactaCategories(
    preferredYears: number[],
    intent: 'winners' | 'nominees'
  ): Promise<{ year: number; categoriesByTitle: Record<string, string[]> } | undefined> {
    for (const year of preferredYears) {
      const cacheKey = `discover:aacta:${intent}:${year}`;
      const data = await this.withCache(
        cacheKey,
        TTL.traktAwards,
        () => this.fetchAactaData(year),
        { emptyTtl: 3600 }
      );
      const categoriesByTitle =
        intent === 'winners' ? data.winnersByTitle : data.nomineesByTitle;
      if (categoriesByTitle && Object.keys(categoriesByTitle).length > 0) {
        return { year, categoriesByTitle };
      }
    }
    return undefined;
  }

  private async fetchAactaData(year: number): Promise<{
    winnersByTitle: Record<string, string[]>;
    nomineesByTitle: Record<string, string[]>;
  }> {
    const winnersByTitle: Record<string, string[]> = {};
    const nomineesByTitle: Record<string, string[]> = {};

    const winnerUrls = [
      `https://www.aacta.org/media-room/winners-announced-at-the-${year}-aacta-awards-ceremony/`,
      `https://www.aacta.org/media-room/winners-announced-at-the-${year}-aacta-awards/`,
    ];
    for (const url of winnerUrls) {
      const content = await this.fetchAwardPage(url, 'AACTA winners');
      if (!content) continue;
      const text = this.extractOscarsText(content);
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^(AACTA[^:]+):\s*(.+)$/i);
        if (!match) continue;
        const category = this.normalizeCategory(match[1]);
        const rest = match[2];
        const winner = rest.split(/\s[–—-]\s/)[0].trim();
        if (!winner) continue;
        this.mergeAwardCategories(
          winnersByTitle,
          [winner.replace(/["“”']+/g, '').trim()],
          category
        );
      }
      if (Object.keys(winnersByTitle).length > 0) break;
    }

    const nomineesUrl = `https://www.aacta.org/aacta-awards/winners-and-nominees/${year}-aacta-awards/`;
    const nomineesContent = await this.fetchAwardPage(nomineesUrl, 'AACTA nominees');
    if (nomineesContent) {
      const text = this.extractOscarsText(nomineesContent);
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      let currentCategory: string | undefined;
      for (const line of lines) {
        if (/^AACTA Award/i.test(line)) {
          currentCategory = this.normalizeCategory(line);
          continue;
        }
        if (!currentCategory) continue;
        if (/^Nominees$/i.test(line) || /^Winner$/i.test(line)) continue;
        if (/^List of all winners/i.test(line)) continue;
        if (/^View all winners/i.test(line)) continue;
        if (/^Select an event/i.test(line)) continue;
        if (/^Back to/i.test(line)) continue;
        if (/^\d{4} AACTA Awards/i.test(line)) continue;
        if (/^AACTA$/i.test(line)) continue;
        if (/^AACTA Award/i.test(line)) {
          currentCategory = this.normalizeCategory(line);
          continue;
        }
        if (line.length < 2) continue;
        this.mergeAwardCategories(nomineesByTitle, [line], currentCategory);
      }
    }

    return { winnersByTitle, nomineesByTitle };
  }

  private mergeAwardCategories(
    target: Record<string, string[]>,
    titles: string[],
    category: string
  ) {
    for (const title of titles) {
      const normalized = this.normalizeAwardTitle(title);
      if (!normalized) continue;
      if (!target[normalized]) {
        target[normalized] = [];
      }
      if (!target[normalized].includes(category)) {
        target[normalized].push(category);
      }
    }
  }

  private toOrdinal(value: number): string {
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
    switch (value % 10) {
      case 1:
        return `${value}st`;
      case 2:
        return `${value}nd`;
      case 3:
        return `${value}rd`;
      default:
        return `${value}th`;
    }
  }

  private async fetchAwardPage(url: string, label: string): Promise<string | undefined> {
    const jinaUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`;
    try {
      const response = await axios.get(jinaUrl, { timeout: 15000 });
      if (typeof response.data === 'string' && response.data.length > 0) {
        return response.data;
      }
    } catch (error) {
      logger.warn(`${label} fetch via jina failed for ${url}: ${error}`);
    }

    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (typeof response.data === 'string' && response.data.length > 0) {
        return response.data;
      }
    } catch (error) {
      logger.warn(`${label} fetch failed for ${url}: ${error}`);
    }
    return undefined;
  }

  private mapTraktMedia(
    mediaType: DiscoverMediaType,
    media: TraktTrendingItem['movie'],
    awardNote?: string,
    awardYear?: number,
    awardMeta?: { source?: string; result?: 'winner' | 'nominee'; categories?: string[] }
  ): DiscoverMediaItem {
    return {
      id: `trakt:${mediaType}:${media?.ids?.trakt || media?.ids?.imdb || media?.title}`,
      mediaType,
      title: media?.title || 'Untitled',
      year: media?.year,
      overview: media?.overview,
      imdbId: media?.ids?.imdb,
      tmdbId: media?.ids?.tmdb,
      tvdbId: media?.ids?.tvdb,
      traktId: media?.ids?.trakt,
      awardNote: awardNote || undefined,
      awardYear,
      awardSource: awardMeta?.source,
      awardResult: awardMeta?.result,
      awardCategories: awardMeta?.categories,
      source: {
        provider: 'trakt',
        id: media?.ids?.trakt,
      },
    };
  }

  private extractAwardYear(value?: string): number | undefined {
    if (!value) return undefined;
    const match = value.match(/\b(19|20)\d{2}\b/);
    if (!match) return undefined;
    const parsed = Number(match[0]);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private async enrichItems(
    items: DiscoverMediaItem[],
    tmdbType?: 'movie' | 'tv'
  ): Promise<DiscoverMediaItem[]> {
    let enriched = items;
    if (tmdbType) {
      enriched = await this.enrichWithExternalIds(enriched, tmdbType);
    }
    enriched = await this.enrichWithTmdbImages(enriched);
    enriched = await this.enrichWithOmdb(enriched);
    enriched = await this.applyLibraryStatus(enriched);
    return enriched.filter((item) => !item.inLibrary);
  }

  private async enrichWithTmdbImages(
    items: DiscoverMediaItem[]
  ): Promise<DiscoverMediaItem[]> {
    const tmdbClient = this.getTmdbClient();
    if (!tmdbClient) return items;

    const results: DiscoverMediaItem[] = [];
    const maxEnrich = Math.min(items.length, 20);

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (i >= maxEnrich || !item.tmdbId) {
        results.push(item);
        continue;
      }
      if (item.posterUrl && item.backdropUrl) {
        results.push(item);
        continue;
      }

      const tmdbType = item.mediaType === 'series' ? 'tv' : 'movie';
      const cacheKey = `discover:tmdb:details:${tmdbType}:${item.tmdbId}`;
      try {
        const details = await this.withCache(cacheKey, TTL.tmdbDetails, () =>
          tmdbClient.getDetails(tmdbType, item.tmdbId!)
        );
        results.push({
          ...item,
          posterUrl:
            item.posterUrl ||
            (details.poster_path
              ? `${TMDB_IMAGE_BASE}/w500${details.poster_path}`
              : undefined),
          backdropUrl:
            item.backdropUrl ||
            (details.backdrop_path
              ? `${TMDB_IMAGE_BASE}/w780${details.backdrop_path}`
              : undefined),
        });
      } catch (error) {
        logger.warn(`TMDB details failed for ${item.tmdbId}: ${error}`);
        results.push(item);
      }
    }

    return results;
  }

  private async enrichWithExternalIds(
    items: DiscoverMediaItem[],
    tmdbType: 'movie' | 'tv'
  ): Promise<DiscoverMediaItem[]> {
    const tmdbClient = this.getTmdbClient();
    if (!tmdbClient) return items;

    const results: DiscoverMediaItem[] = [];
    const maxEnrich = Math.min(items.length, 20);

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (i >= maxEnrich || !item.tmdbId || item.imdbId || item.tvdbId) {
        results.push(item);
        continue;
      }

      const cacheKey = `discover:tmdb:external:${tmdbType}:${item.tmdbId}`;
      try {
        const external = await this.withCache(cacheKey, TTL.tmdbExternalIds, () =>
          tmdbClient.getExternalIds(tmdbType, item.tmdbId!)
        );
        results.push({
          ...item,
          imdbId: external.imdb_id || item.imdbId,
          tvdbId: external.tvdb_id || item.tvdbId,
        });
      } catch (error) {
        logger.warn(`TMDB external ids failed for ${item.tmdbId}: ${error}`);
        results.push(item);
      }
    }

    return results;
  }

  private async enrichWithOmdb(
    items: DiscoverMediaItem[]
  ): Promise<DiscoverMediaItem[]> {
    const omdbClient = this.getOmdbClient();
    if (!omdbClient) return items;
    if (Date.now() < this.omdbBackoffUntil) {
      return items;
    }

    const results: DiscoverMediaItem[] = [];
    const maxEnrich = Math.min(items.length, 12);

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (index >= maxEnrich) {
        results.push(item);
        continue;
      }
      if (!item.imdbId) {
        results.push(item);
        continue;
      }

      const cacheKey = `discover:omdb:${item.imdbId}`;
      try {
        const omdb = await this.withCache(
          cacheKey,
          TTL.omdb,
          () => omdbClient.getByImdbId(item.imdbId!),
          { emptyTtl: 900 }
        );
        results.push(this.applyOmdb(item, omdb));
      } catch (error) {
        const status = (error as any)?.response?.status;
        if (status === 401 || status === 403) {
          this.omdbBackoffUntil = Date.now() + 60 * 60 * 1000;
          logger.warn('OMDb auth failed; pausing OMDb enrichment for 1 hour');
        } else if (status === 429) {
          this.omdbBackoffUntil = Date.now() + 15 * 60 * 1000;
          logger.warn('OMDb rate limited; pausing OMDb enrichment for 15 minutes');
        }
        logger.warn(`OMDb lookup failed for ${item.imdbId}: ${error}`);
        results.push(item);
      }
    }

    return results;
  }

  private applyOmdb(item: DiscoverMediaItem, omdb: OmdbResponse): DiscoverMediaItem {
    if (!omdb || omdb.Response === 'False') {
      return item;
    }

    let ratingValue: number | undefined;
    if (omdb.imdbRating && omdb.imdbRating !== 'N/A') {
      const parsed = Number(omdb.imdbRating);
      ratingValue = isNaN(parsed) ? undefined : parsed;
    }

    let voteCount: number | undefined;
    if (omdb.imdbVotes && omdb.imdbVotes !== 'N/A') {
      const parsed = Number(omdb.imdbVotes.replace(/,/g, ''));
      voteCount = isNaN(parsed) ? undefined : parsed;
    }

    const posterUrl =
      !item.posterUrl && omdb.Poster && omdb.Poster !== 'N/A'
        ? omdb.Poster
        : item.posterUrl;

    return {
      ...item,
      posterUrl,
      rating: {
        imdb: {
          value: ratingValue,
          votes: voteCount,
        },
      },
    };
  }

  private async applyLibraryStatus(
    items: DiscoverMediaItem[]
  ): Promise<DiscoverMediaItem[]> {
    const libraryIndex = await this.getLibraryIndex();
    if (!libraryIndex) return items;

    return this.applyLibraryStatusWithIndex(items, libraryIndex);
  }

  private applyLibraryStatusWithIndex(
    items: DiscoverMediaItem[],
    libraryIndex: LibraryIndex
  ): DiscoverMediaItem[] {
    return items.map((item) => {
      if (item.mediaType === 'movie') {
        const inLibrary =
          (item.tmdbId && libraryIndex.moviesByTmdbId.has(item.tmdbId)) ||
          (item.imdbId && libraryIndex.moviesByImdbId.has(item.imdbId));
        return {
          ...item,
          inLibrary,
          libraryService: inLibrary ? 'radarr' : undefined,
        };
      }

      const inLibrary =
        (item.tvdbId && libraryIndex.seriesByTvdbId.has(item.tvdbId)) ||
        (item.imdbId && libraryIndex.seriesByImdbId.has(item.imdbId));
      return {
        ...item,
        inLibrary,
        libraryService: inLibrary ? 'sonarr' : undefined,
      };
    });
  }

  private async filterLibraryFromSections(
    data: DiscoverSectionsResponse
  ): Promise<{ data: DiscoverSectionsResponse; changed: boolean }> {
    const libraryIndex = await this.getLibraryIndex();
    if (!libraryIndex) {
      return { data, changed: false };
    }

    let changed = false;
    const sections = data.sections.map((section) => {
      const items = Array.isArray(section.items) ? section.items : [];
      const updated = this.applyLibraryStatusWithIndex(items, libraryIndex);
      const filtered = updated.filter((item) => !item.inLibrary);
      if (filtered.length !== items.length) {
        changed = true;
      }
      return {
        ...section,
        items: filtered,
      };
    });

    if (!changed) {
      return { data, changed: false };
    }

    return {
      data: {
        ...data,
        sections,
      },
      changed: true,
    };
  }

  private async getLibraryIndex(): Promise<LibraryIndex | null> {
    const services = this.getLibraryServices();
    if (!services.radarr && !services.sonarr) return null;

    const cacheKey = 'discover:library:index';
    return this.withCache(cacheKey, TTL.library, async () => {
      const index: LibraryIndex = {
        moviesByTmdbId: new Set(),
        moviesByImdbId: new Set(),
        seriesByTvdbId: new Set(),
        seriesByImdbId: new Set(),
      };

      if (services.radarr) {
        try {
          const movies = await services.radarr.getMovies();
          movies.forEach((movie: any) => {
            if (movie.tmdbId) index.moviesByTmdbId.add(movie.tmdbId);
            if (movie.imdbId) index.moviesByImdbId.add(movie.imdbId);
          });
        } catch (error) {
          logger.warn(`Failed to load Radarr library for Discover: ${error}`);
        }
      }

      if (services.sonarr) {
        try {
          const series = await services.sonarr.getSeries();
          series.forEach((show: any) => {
            if (show.tvdbId) index.seriesByTvdbId.add(show.tvdbId);
            if (show.imdbId) index.seriesByImdbId.add(show.imdbId);
          });
        } catch (error) {
          logger.warn(`Failed to load Sonarr library for Discover: ${error}`);
        }
      }

      return index;
    });
  }

  private async withCache<T>(
    key: string,
    ttl: number,
    fn: () => Promise<T>,
    options?: { emptyTtl?: number }
  ): Promise<T> {
    const cached = await this.cacheService.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      try {
        const result = await fn();
        const resolvedTtl =
          options?.emptyTtl &&
          Array.isArray(result) &&
          result.length === 0
            ? options.emptyTtl
            : ttl;
        await this.cacheService.set(key, result, resolvedTtl);
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  private sortByReleaseYearDesc(items: DiscoverMediaItem[]): DiscoverMediaItem[] {
    return [...items].sort((a, b) => this.getReleaseYear(b) - this.getReleaseYear(a));
  }

  private getReleaseYear(item: DiscoverMediaItem): number {
    if (item.year) return item.year;
    if (item.releaseDate) {
      const parsed = new Date(item.releaseDate).getFullYear();
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }
}
