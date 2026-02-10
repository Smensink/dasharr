import axios from 'axios';
import {
  BaseGameSearchAgent,
  SearchAgentResult,
  EnhancedMatchOptions,
} from './BaseGameSearchAgent';
import { GameDownloadCandidate } from '@dasharr/shared-types';
import { logger } from '../../../utils/logger';
import { PlatformDetector, GamePlatform } from '../../../utils/PlatformDetector';

export interface ReziConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxResults?: number;
}

type ReziSearchHit = Record<string, unknown> & {
  id?: string | number;
  title?: string;
  name?: string;
  game?: string;
  release?: string;
  url?: string;
  link?: string;
  download?: string;
  download_url?: string;
  downloadUrl?: string;
  magnet?: string;
  torrent?: string;
  size?: string | number;
  filesize?: string | number;
  fileSize?: string | number;
  sizeBytes?: number;
  source?: string;
  platform?: string;
};

type ReziSearchResponse = {
  hits?: ReziSearchHit[];
};

/**
 * Direct Download Link (DDL) detection result
 */
export interface DDLDetectionResult {
  isDirectDownload: boolean;
  directDownloadUrl?: string;
  isPageLink: boolean;
  pageUrl?: string;
  hostType: 'archive.org' | 'buzzheavier' | 'pixeldrain' | 'gofile' | '1fichier' | 'mediafire' | 'mega' | 'other' | 'unknown';
}

/**
 * Rezi Search Agent
 *
 * Rezi provides a Meilisearch-backed index of game/ROM sources.
 * API docs: https://docs.rezi.one
 */
export class ReziAgent extends BaseGameSearchAgent {
  readonly name = 'Rezi';
  readonly baseUrl: string;
  readonly requiresAuth = true;
  readonly priority = 65;
  readonly releaseTypes: ('repack' | 'rip' | 'scene' | 'p2p')[] = ['rip', 'p2p'];

  private axiosInstance: ReturnType<typeof axios.create>;
  private apiKey: string;
  private maxResults: number;

  constructor(config: ReziConfig) {
    super();
    this.baseUrl = (config.baseUrl || 'https://search.rezi.one').replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.maxResults = Math.max(1, config.maxResults || 50);

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeoutMs || 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Meili-API-Key': this.apiKey,
      },
    });
  }

  isAvailable(): boolean {
    return !!(this.baseUrl && this.apiKey);
  }

  async search(gameName: string): Promise<SearchAgentResult> {
    try {
      logger.info(`[Rezi] Searching for: ${gameName}`);

      const hits = await this.fetchSearchResults(gameName);
      const candidates = this.parseResults(hits, gameName);

      logger.info(`[Rezi] Found ${candidates.length} candidates`);

      return { success: true, candidates };
    } catch (error) {
      logger.error('[Rezi] Search error:', error);
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async searchEnhanced(
    gameName: string,
    options: EnhancedMatchOptions
  ): Promise<SearchAgentResult> {
    try {
      logger.info(`[Rezi] Enhanced search for: ${gameName} (${options.igdbGame.name})`);

      const hits = await this.fetchSearchResults(this.cleanGameName(options.igdbGame.name));
      const candidates = this.parseResultsEnhanced(hits, options);

      candidates.sort((a, b) => {
        const matchDiff = (b.matchScore || 0) - (a.matchScore || 0);
        if (matchDiff !== 0) return matchDiff;
        return (b.platformScore || 0) - (a.platformScore || 0);
      });

      logger.info(`[Rezi] Enhanced search found ${candidates.length} candidates`);

      return { success: true, candidates };
    } catch (error) {
      logger.error('[Rezi] Enhanced search error:', error);
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getDownloadLinks(resultUrl: string): Promise<Partial<GameDownloadCandidate>[]> {
    if (!resultUrl) return [];
    return [{ infoUrl: resultUrl }];
  }

  /**
   * Detect if a URL is a direct download link or a page link
   * Returns detailed information about the link type
   */
  detectDDL(url: string): DDLDetectionResult {
    if (!url || typeof url !== 'string') {
      return { isDirectDownload: false, isPageLink: false, hostType: 'unknown' };
    }

    const lowerUrl = url.toLowerCase();

    // archive.org - direct downloads
    if (lowerUrl.includes('archive.org')) {
      // archive.org/download/ paths are direct downloads
      if (lowerUrl.includes('/download/')) {
        return {
          isDirectDownload: true,
          directDownloadUrl: url,
          isPageLink: false,
          hostType: 'archive.org',
        };
      }
      // archive.org/details/ paths are page links
      if (lowerUrl.includes('/details/')) {
        return {
          isDirectDownload: false,
          isPageLink: true,
          pageUrl: url,
          hostType: 'archive.org',
        };
      }
    }

    // Buzzheavier - direct downloads
    if (lowerUrl.includes('buzzheavier.com')) {
      // /d/ or /download/ paths are direct
      if (lowerUrl.includes('/d/') || lowerUrl.includes('/download/')) {
        return {
          isDirectDownload: true,
          directDownloadUrl: url,
          isPageLink: false,
          hostType: 'buzzheavier',
        };
      }
      // Other paths are likely page links
      return {
        isDirectDownload: false,
        isPageLink: true,
        pageUrl: url,
        hostType: 'buzzheavier',
      };
    }

    // Pixeldrain - direct downloads
    if (lowerUrl.includes('pixeldrain.com')) {
      // /u/ paths are direct file downloads
      if (lowerUrl.includes('/u/')) {
        return {
          isDirectDownload: true,
          directDownloadUrl: url,
          isPageLink: false,
          hostType: 'pixeldrain',
        };
      }
      return {
        isDirectDownload: false,
        isPageLink: true,
        pageUrl: url,
        hostType: 'pixeldrain',
      };
    }

    // GoFile - usually page links that need extraction
    if (lowerUrl.includes('gofile.io')) {
      return {
        isDirectDownload: false,
        isPageLink: true,
        pageUrl: url,
        hostType: 'gofile',
      };
    }

    // 1fichier - can be direct or page
    if (lowerUrl.includes('1fichier.com')) {
      // URLs with ?download=1 or similar are direct
      if (lowerUrl.includes('?download') || lowerUrl.includes('&download')) {
        return {
          isDirectDownload: true,
          directDownloadUrl: url,
          isPageLink: false,
          hostType: '1fichier',
        };
      }
      return {
        isDirectDownload: false,
        isPageLink: true,
        pageUrl: url,
        hostType: '1fichier',
      };
    }

    // MediaFire - usually page links
    if (lowerUrl.includes('mediafire.com')) {
      return {
        isDirectDownload: false,
        isPageLink: true,
        pageUrl: url,
        hostType: 'mediafire',
      };
    }

    // Mega.nz - direct download client needed
    if (lowerUrl.includes('mega.nz') || lowerUrl.includes('mega.co.nz')) {
      return {
        isDirectDownload: false, // Requires mega client
        isPageLink: true,
        pageUrl: url,
        hostType: 'mega',
      };
    }

    // Direct file extensions indicate direct download
    const directExtensions = ['.zip', '.rar', '.7z', '.iso', '.exe', '.msi', '.bin', '.dmg'];
    const hasDirectExtension = directExtensions.some(ext => lowerUrl.endsWith(ext));
    
    if (hasDirectExtension) {
      return {
        isDirectDownload: true,
        directDownloadUrl: url,
        isPageLink: false,
        hostType: 'other',
      };
    }

    // Default: treat as page link if looks like HTTP URL
    if (lowerUrl.startsWith('http')) {
      return {
        isDirectDownload: false,
        isPageLink: true,
        pageUrl: url,
        hostType: 'unknown',
      };
    }

    return {
      isDirectDownload: false,
      isPageLink: false,
      hostType: 'unknown',
    };
  }

  /**
   * Check if any URL in the list is a direct download link
   */
  hasDirectDownloadLink(urls: string[]): boolean {
    return urls.some(url => this.detectDDL(url).isDirectDownload);
  }

  /**
   * Get the first direct download URL from a list
   */
  getDirectDownloadUrl(urls: string[]): string | undefined {
    for (const url of urls) {
      const detection = this.detectDDL(url);
      if (detection.isDirectDownload && detection.directDownloadUrl) {
        return detection.directDownloadUrl;
      }
    }
    return undefined;
  }

  /**
   * Filter to only return candidates with direct download links
   */
  filterDirectDownloads(candidates: GameDownloadCandidate[]): GameDownloadCandidate[] {
    return candidates.filter(c => c.directDownloadUrl);
  }

  private async fetchSearchResults(query: string): Promise<ReziSearchHit[]> {
    const response = await this.axiosInstance.post<ReziSearchResponse>(
      '/indexes/rezi/search',
      {
        q: query,
        limit: this.maxResults,
      }
    );

    return response.data?.hits || [];
  }

  private parseResults(hits: ReziSearchHit[], gameName: string): GameDownloadCandidate[] {
    const candidates: GameDownloadCandidate[] = [];
    const platformDetector = new PlatformDetector();

    for (const hit of hits) {
      const title = this.extractTitle(hit);
      if (!title) continue;
      if (!this.isMatch(title, gameName)) continue;

      const candidate = this.buildCandidate(hit, title, platformDetector);
      candidates.push(candidate);
    }

    return candidates;
  }

  private parseResultsEnhanced(
    hits: ReziSearchHit[],
    options: EnhancedMatchOptions
  ): GameDownloadCandidate[] {
    const candidates: GameDownloadCandidate[] = [];
    const platformDetector = new PlatformDetector(options.platform as GamePlatform);

    for (const hit of hits) {
      const title = this.extractTitle(hit);
      if (!title) continue;

      const matchResult = this.matchWithIGDB(title, options);
      if (!matchResult.matches) continue;

      const candidate = this.buildCandidate(hit, title, platformDetector, matchResult);
      candidates.push(candidate);
    }

    return candidates;
  }

  private buildCandidate(
    hit: ReziSearchHit,
    title: string,
    platformDetector: PlatformDetector,
    matchResult?: { matches: boolean; score: number; reasons: string[] }
  ): GameDownloadCandidate {
    const urls = this.extractUrls(hit);
    const magnetUrl = urls.find((url) => url.startsWith('magnet:'));
    const torrentUrl = urls.find((url) => url.endsWith('.torrent') && !url.startsWith('magnet:'));
    const infoUrl = urls.find((url) => !url.startsWith('magnet:') && !url.endsWith('.torrent'));
    
    // Detect direct download links
    const directDownloadUrl = this.getDirectDownloadUrl(urls);
    const ddlDetection = urls.map(url => this.detectDDL(url));
    const hasDDL = ddlDetection.some(d => d.isDirectDownload);

    const sizeInfo = this.extractSizeFromHit(hit);
    const platformMatch = platformDetector.detectPlatform(`${title} ${hit.platform || ''}`);

    const sourceLabel = hit.source ? `${this.name} (${hit.source})` : this.name;

    return {
      title,
      source: sourceLabel,
      releaseType: this.detectReleaseType(title),
      size: sizeInfo?.size,
      sizeBytes: sizeInfo?.bytes,
      magnetUrl,
      torrentUrl,
      infoUrl,
      directDownloadUrl,
      hasDirectDownload: hasDDL,
      platform: platformMatch.platform,
      platformScore: platformDetector.getPlatformScore(platformMatch.platform),
      quality: this.name,
      matchScore: matchResult?.score,
      matchReasons: matchResult?.reasons,
    };
  }

  private extractTitle(hit: ReziSearchHit): string | undefined {
    const title =
      hit.title ||
      hit.name ||
      hit.game ||
      hit.release ||
      (typeof hit.id === 'string' ? hit.id : undefined);

    return title?.toString().trim() || undefined;
  }

  private extractUrls(hit: ReziSearchHit): string[] {
    const urls = new Set<string>();

    const add = (value?: unknown) => {
      if (!value) return;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) urls.add(trimmed);
        return;
      }
      if (Array.isArray(value)) {
        for (const entry of value) add(entry);
      }
    };

    add(hit.url);
    add(hit.link);
    add(hit.download);
    add(hit.download_url);
    add(hit.downloadUrl);
    add(hit.magnet);
    add(hit.torrent);

    const extraFields = ['links', 'mirrors', 'files', 'uris', 'urls'];
    for (const field of extraFields) {
      add((hit as Record<string, unknown>)[field]);
    }

    return Array.from(urls);
  }

  private extractSizeFromHit(
    hit: ReziSearchHit
  ): { size: string; bytes?: number } | undefined {
    const candidates = [
      hit.size,
      hit.filesize,
      hit.fileSize,
      hit.sizeBytes,
    ];

    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      if (typeof candidate === 'number' && candidate > 0) {
        return { size: `${candidate} bytes`, bytes: candidate };
      }
      if (typeof candidate === 'string') {
        const parsed = this.extractSize(candidate);
        if (parsed) return parsed;
      }
    }

    return undefined;
  }
}
