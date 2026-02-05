import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseGameSearchAgent, SearchAgentResult, EnhancedMatchOptions } from './BaseGameSearchAgent';
import { GameDownloadCandidate } from '@dasharr/shared-types';
import { logger } from '../../../utils/logger';
import { FlareSolverrClient } from '../../../clients/FlareSolverrClient';

export interface DODIConfig {
  flaresolverrUrl?: string;
  searchOnly?: boolean;
}

/**
 * DODI Repacks Search Agent
 * 
 * DODI provides repacks similar to FitGirl.
 * Site: https://dodi-repacks.site/
 * 
 * Note: DODI uses Cloudflare protection, so we use FlareSolverr to bypass it.
 */
export class DODIAgent extends BaseGameSearchAgent {
  readonly name = 'DODI';
  readonly baseUrl = 'https://dodi-repacks.site';
  readonly requiresAuth = false;
  readonly priority = 90;
  readonly releaseTypes: ('repack' | 'rip' | 'scene' | 'p2p')[] = ['repack'];

  private searchOnly: boolean;

  private axiosInstance = axios.create({
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://dodi-repacks.site/',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  private flaresolverr?: FlareSolverrClient;

  constructor(config?: DODIConfig) {
    super();
    this.searchOnly = Boolean(config?.searchOnly);
    if (config?.flaresolverrUrl) {
      this.flaresolverr = new FlareSolverrClient({ baseUrl: config.flaresolverrUrl });
      logger.info(`[DODI] FlareSolverr configured: ${config.flaresolverrUrl}`);
    } else {
      logger.warn(`[DODI] No FlareSolverr URL configured - direct requests will likely fail`);
    }
  }

  isAvailable(): boolean {
    return true;
  }

  /**
   * Check if FlareSolverr is configured and available
   */
  async isFlareSolverrAvailable(): Promise<boolean> {
    if (!this.flaresolverr) {
      logger.debug('[DODI] FlareSolverr not configured');
      return false;
    }
    const available = await this.flaresolverr.isAvailable();
    logger.debug(`[DODI] FlareSolverr availability: ${available}`);
    return available;
  }

  async search(gameName: string): Promise<SearchAgentResult> {
    try {
      logger.info(`[DODI] Searching for: ${gameName}`);

      // Try FlareSolverr first if available
      if (await this.isFlareSolverrAvailable()) {
        return this.searchWithFlareSolverr(gameName);
      }

      // Fallback to direct request (will likely fail due to Cloudflare)
      logger.warn('[DODI] FlareSolverr not available, attempting direct search (likely to fail)');
      return this.searchDirect(gameName);
    } catch (error) {
      logger.error('[DODI] Search error:', error);
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Search using FlareSolverr to bypass Cloudflare
   */
  private async searchWithFlareSolverr(gameName: string): Promise<SearchAgentResult> {
    if (!this.flaresolverr) {
      throw new Error('FlareSolverr not configured');
    }

    logger.info(`[DODI] Using FlareSolverr for search`);

    // DODI search URL format
    const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(gameName)}`;
    logger.info(`[DODI] Search URL: ${searchUrl}`);

    try {
      const response = await this.flaresolverr.get(searchUrl, {
        headers: {
          'Referer': this.baseUrl,
        },
        maxTimeout: 60000, // Cloudflare can take a while
      });

      logger.info(`[DODI] FlareSolverr response status: ${response.solution?.status}`);
      
      if (!response.solution?.response) {
        logger.error('[DODI] FlareSolverr returned no response HTML');
        return {
          success: false,
          candidates: [],
          error: 'No response from FlareSolverr',
        };
      }

      return await this.parseSearchResults(response.solution.response);
    } catch (error) {
      logger.error('[DODI] FlareSolverr request failed:', error);
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'FlareSolverr request failed',
      };
    }
  }

  /**
   * Direct search (likely to fail with 403)
   */
  private async searchDirect(gameName: string): Promise<SearchAgentResult> {
    logger.warn(`[DODI] Attempting direct search (may fail due to Cloudflare)`);

    const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(gameName)}`;

    try {
      const response = await this.axiosInstance.get(searchUrl);
      return await this.parseSearchResults(response.data);
    } catch (error) {
      logger.error('[DODI] Direct search failed:', error);
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Direct search failed',
      };
    }
  }

  /**
   * Parse search results HTML
   */
  private async parseSearchResults(html: string): Promise<SearchAgentResult> {
    const $ = cheerio.load(html);
    const candidates: GameDownloadCandidate[] = [];

    // Log HTML structure for debugging (first 500 chars)
    logger.debug(`[DODI] HTML snippet: ${html.substring(0, 500)}...`);

    // Check for "No results" message
    const noResultsText = $('body').text();
    if (noResultsText.includes('Nothing Found') || noResultsText.includes('No results')) {
      logger.info('[DODI] Search returned no results');
      return { success: true, candidates: [] };
    }

    // DODI uses WordPress structure with article elements
    // Try multiple selectors for robustness
    const articleSelectors = [
      'article.post',
      'article.type-post',
      'article.status-publish',
      'article.hentry',
      'article',
      '.post',
      '.entry',
      '.search-result'
    ];

    let foundArticles = 0;

    for (const selector of articleSelectors) {
      const articles = $(selector);
      if (articles.length > 0) {
        logger.info(`[DODI] Found ${articles.length} articles with selector: ${selector}`);
        foundArticles = articles.length;

        // Use for...of loop for async iteration instead of .each()
        const articleElements = articles.toArray();
        for (const element of articleElements) {
          const $article = $(element);
          
          // Try multiple title selectors
          const titleSelectors = [
            'h2.entry-title a',
            'h1.entry-title a',
            '.entry-title a',
            'h2 a',
            'h1 a',
            'a[rel="bookmark"]',
            '.post-title a',
            'a.entry-title'
          ];

          let title = '';
          let link = '';

          for (const titleSel of titleSelectors) {
            const $titleEl = $article.find(titleSel).first();
            if ($titleEl.length) {
              title = $titleEl.text().trim();
              link = $titleEl.attr('href') || '';
              if (title) break;
            }
          }

          // If no title found, try the article itself
          if (!title) {
            title = $article.find('.entry-title').text().trim() ||
                    $article.find('.post-title').text().trim() ||
                    $article.attr('title') || '';
          }

          if (!title) {
            logger.debug('[DODI] Skipping article - no title found');
            continue;
          }

          logger.debug(`[DODI] Processing article: "${title}"`);

          // Check if this is a game repack
          if (!this.isGamePost(title)) {
            logger.debug(`[DODI] Skipping non-game post: "${title}"`);
            continue;
          }

          // Try to extract size from multiple sources
          let sizeInfo: { size: string; bytes?: number } | undefined;
          
          // Try excerpt/content first
          const excerptSelectors = [
            '.entry-content',
            '.entry-summary',
            '.post-content',
            '.post-excerpt',
            '.content',
            'p'
          ];

          for (const excerptSel of excerptSelectors) {
            const excerpt = $article.find(excerptSel).text().trim();
            if (excerpt) {
              sizeInfo = this.extractSize(excerpt);
              if (sizeInfo) break;
            }
          }

          // Fall back to title
          if (!sizeInfo) {
            sizeInfo = this.extractSize(title);
          }

          logger.debug(`[DODI] Adding candidate: "${title}" (${sizeInfo?.size || 'no size'})`);

          // Fetch download links from the post page
          let magnetUrl: string | undefined;
          let torrentUrl: string | undefined;
          if (link && !this.searchOnly) {
            try {
              const downloadLinks = await this.getDownloadLinks(link);
              if (downloadLinks.length > 0) {
                magnetUrl = downloadLinks[0].magnetUrl;
                torrentUrl = downloadLinks[0].torrentUrl;
                logger.info(`[DODI] Found download link for: ${title}`);
              }
            } catch (error) {
              logger.warn(`[DODI] Could not fetch download links for ${title}: ${error}`);
            }
          }

          candidates.push({
            title,
            source: this.name,
            releaseType: 'repack',
            quality: 'DODI',
            size: sizeInfo?.size,
            sizeBytes: sizeInfo?.bytes,
            platform: 'PC',
            infoUrl: link || undefined,
            magnetUrl,
            torrentUrl,
          });
        }

        if (candidates.length > 0) {
          break; // Found candidates, no need to try other selectors
        }
      }
    }

    if (foundArticles === 0) {
      logger.warn('[DODI] No articles found with any selector - site structure may have changed');
      // Log the HTML structure for debugging
      const bodyText = $('body').text().substring(0, 500);
      logger.debug(`[DODI] Page text: ${bodyText}...`);
    }

    logger.info(`[DODI] Found ${candidates.length} candidates`);

    return {
      success: true,
      candidates,
    };
  }

  /**
   * Enhanced search with IGDB matching
   */
  async searchEnhanced(
    gameName: string,
    options: EnhancedMatchOptions
  ): Promise<SearchAgentResult> {
    try {
      logger.info(`[DODI] Enhanced search for: ${gameName} (${options.igdbGame.name})`);

      // Get search results first
      let html: string;
      const searchQuery = this.cleanGameName(options.igdbGame.name);

      if (await this.isFlareSolverrAvailable()) {
        const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(searchQuery)}`;
        logger.info(`[DODI] Searching with FlareSolverr: ${searchUrl}`);
        
        try {
          const response = await this.flaresolverr!.get(searchUrl, {
            headers: { 'Referer': this.baseUrl },
            maxTimeout: 60000,
          });
          html = response.solution.response;
        } catch (error) {
          logger.error('[DODI] FlareSolverr enhanced search failed:', error);
          return {
            success: false,
            candidates: [],
            error: error instanceof Error ? error.message : 'FlareSolverr request failed',
          };
        }
      } else {
        const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(searchQuery)}`;
        logger.warn(`[DODI] FlareSolverr not available, trying direct request`);
        
        try {
          const response = await this.axiosInstance.get(searchUrl);
          html = response.data;
        } catch (error) {
          logger.error('[DODI] Direct enhanced search failed:', error);
          return {
            success: false,
            candidates: [],
            error: error instanceof Error ? error.message : 'Direct request failed',
          };
        }
      }

      const $ = cheerio.load(html);
      const candidates: GameDownloadCandidate[] = [];

      // Check for "No results" message
      const noResultsText = $('body').text();
      if (noResultsText.includes('Nothing Found') || noResultsText.includes('No results')) {
        logger.info('[DODI] Enhanced search returned no results');
        return { success: true, candidates: [] };
      }

      // Use the same robust selectors as parseSearchResults
      const articleSelectors = [
        'article.post',
        'article.type-post',
        'article.status-publish',
        'article.hentry',
        'article',
        '.post',
        '.entry',
      ];

      for (const selector of articleSelectors) {
        const articles = $(selector);
        
        if (articles.length > 0) {
          // Use for...of loop for async iteration instead of .each()
          const articleElements = articles.toArray();
          for (const element of articleElements) {
            const $article = $(element);
            
            // Try multiple title selectors
            const titleSelectors = [
              'h2.entry-title a',
              'h1.entry-title a',
              '.entry-title a',
              'h2 a',
              'h1 a',
              'a[rel="bookmark"]',
              '.post-title a',
            ];

            let title = '';
            let link = '';

            for (const titleSel of titleSelectors) {
              const $titleEl = $article.find(titleSel).first();
              if ($titleEl.length) {
                title = $titleEl.text().trim();
                link = $titleEl.attr('href') || '';
                if (title) break;
              }
            }

            if (!title) continue;
            if (!this.isGamePost(title)) continue;

            // Use DODI-specific matching
            const matchResult = this.matchWithDODI(title, options);

            if (!matchResult.matches) {
              logger.debug(`[DODI] Match rejected: "${title}" (score: ${matchResult.score})`);
              continue;
            }

            // Try to extract size
            const excerptSelectors = ['.entry-content', '.entry-summary', '.post-content', 'p'];
            let sizeInfo: { size: string; bytes?: number } | undefined;
            
            for (const excerptSel of excerptSelectors) {
              const excerpt = $article.find(excerptSel).text().trim();
              if (excerpt) {
                sizeInfo = this.extractSize(excerpt);
                if (sizeInfo) break;
              }
            }

            if (!sizeInfo) {
              sizeInfo = this.extractSize(title);
            }

            logger.info(`[DODI] Match accepted: "${title}" (score: ${matchResult.score}, reasons: ${matchResult.reasons.join(', ')})`);

            // Fetch download links from the post page
            let magnetUrl: string | undefined;
            let torrentUrl: string | undefined;
            if (link && !this.searchOnly) {
              try {
                const downloadLinks = await this.getDownloadLinks(link);
                if (downloadLinks.length > 0) {
                  magnetUrl = downloadLinks[0].magnetUrl;
                  torrentUrl = downloadLinks[0].torrentUrl;
                  logger.info(`[DODI] Found download link for: ${title}`);
                }
              } catch (error) {
                logger.warn(`[DODI] Could not fetch download links for ${title}: ${error}`);
              }
            }

            candidates.push({
              title,
              source: this.name,
              releaseType: 'repack',
              quality: 'DODI',
              size: sizeInfo?.size,
              sizeBytes: sizeInfo?.bytes,
              platform: 'PC',
              matchScore: matchResult.score,
              matchReasons: matchResult.reasons,
              infoUrl: link || undefined,
              magnetUrl,
              torrentUrl,
            });
          }

          if (candidates.length > 0) {
            break;
          }
        }
      }

      // Sort by score
      candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

      logger.info(`[DODI] Enhanced search found ${candidates.length} candidates`);

      return {
        success: true,
        candidates,
      };
    } catch (error) {
      logger.error('[DODI] Enhanced search error:', error);
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * DODI-specific matching algorithm
   * 
   * DODI uses specific naming conventions:
   * - "Game Name – [DODI Repack]"
   * - Often includes version numbers and language info
   */
  private matchWithDODI(
    title: string,
    options: EnhancedMatchOptions
  ): { matches: boolean; score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    // Remove DODI-specific suffixes for cleaner matching
    const cleanTitle = title
      .replace(/\s*[-–]\s*\[?DODI\s*Repack\]?/gi, '')
      .replace(/\s*[-–]\s*\[?Repack\]?/gi, '')
      .trim();

    // Use base matching algorithm with cleaned title
    const baseResult = this.matchWithIGDB(cleanTitle, options);
    
    if (baseResult.matches) {
      score = baseResult.score;
      reasons.push(...baseResult.reasons);
    }

    // DODI-specific bonuses
    if (title.toLowerCase().includes('dodi')) {
      score += 5;
      reasons.push('DODI verified release');
    }

    // Multi-language indicator often means it's the full game
    if (/\b(multi\d*|multi-language)\b/i.test(title)) {
      score += 3;
      reasons.push('multi-language release');
    }

    return {
      matches: score >= (options.minMatchScore || 70),
      score: Math.min(score, 100),
      reasons,
    };
  }

  async getDownloadLinks(postUrl: string): Promise<Partial<GameDownloadCandidate>[]> {
    try {
      logger.info(`[DODI] Getting download links from: ${postUrl}`);

      let html: string;

      if (await this.isFlareSolverrAvailable()) {
        try {
          const response = await this.flaresolverr!.get(postUrl, {
            headers: { 'Referer': this.baseUrl },
            maxTimeout: 60000,
          });
          html = response.solution.response;
        } catch (error) {
          logger.error('[DODI] FlareSolverr failed to get download links:', error);
          return [];
        }
      } else {
        try {
          const response = await this.axiosInstance.get(postUrl);
          html = response.data;
        } catch (error) {
          logger.error('[DODI] Direct request failed to get download links:', error);
          return [];
        }
      }

      const $ = cheerio.load(html);
      const links: Partial<GameDownloadCandidate>[] = [];

      // Look for magnet links
      $('a[href^="magnet:"]').each((_, element) => {
        const magnetUrl = $(element).attr('href');
        if (magnetUrl) {
          links.push({ magnetUrl });
          logger.info(`[DODI] Found magnet link`);
        }
      });

      // Look for download buttons/shorteners
      const downloadSelectors = [
        'a[href*="1fichier"]',
        'a[href*="mega.nz"]',
        'a[href*="drive.google"]',
        'a[href*="mediafire"]',
        'a[href*="zippyshare"]',
        'a[href*="pixeldrain"]',
        'a[href*="gofile"]',
        'a[href*="bayfiles"]',
        'a[href*="anonfiles"]',
        // DODI often uses shorteners or torrent hosts
        'a[href*="3upload.com"]',
        'a[href*="zovo.ink"]',
        'a[href*="file-upload.org"]',
        'a[href*="up-4ever.net"]',
        'a[href*="filecrypt."]',
        'a[href*="buzzheavier.com"]',
        'a[href*="dodi-repacks.download"]',
        'a[href*="links.gamesdrive.net"]',
        'a[href*="multiup.io"]',
        'a[href*="tpi.li"]',
        'a[href*="tvi.la"]',
        'a[href*="lpi.li"]'
      ];

      downloadSelectors.forEach(selector => {
        $(selector).each((_, element) => {
          const url = $(element).attr('href');
          if (url) {
            links.push({ torrentUrl: url });
            logger.info(`[DODI] Found download link: ${url.substring(0, 50)}...`);
          }
        });
      });

      logger.info(`[DODI] Found ${links.length} download links`);
      return links;
    } catch (error) {
      logger.error('[DODI] Get download links error:', error);
      return [];
    }
  }

  private isGamePost(title: string): boolean {
    const lower = title.toLowerCase();
    return lower.includes('repack') || lower.includes('dodi');
  }
}
