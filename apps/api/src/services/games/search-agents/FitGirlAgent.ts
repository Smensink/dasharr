import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseGameSearchAgent, SearchAgentResult, EnhancedMatchOptions } from './BaseGameSearchAgent';
import { GameDownloadCandidate } from '@dasharr/shared-types';
import { logger } from '../../../utils/logger';
import { getSteamDescriptionFromIGDB, getSteamSizeFromIGDB } from '../../../utils/steam';

/**
 * FitGirl Repacks Search Agent
 * 
 * FitGirl provides highly compressed repacks of games.
 * The site has a search function and also provides magnet links.
 */
export class FitGirlAgent extends BaseGameSearchAgent {
  readonly name = 'FitGirl';
  readonly baseUrl = 'https://fitgirl-repacks.site';
  readonly requiresAuth = false;
  readonly priority = 100; // Highest priority - best repacks
  readonly releaseTypes: ('repack' | 'rip' | 'scene' | 'p2p')[] = ['repack'];

  private axiosInstance = axios.create({
    timeout: 45000, // Increased to 45 seconds for fetching full descriptions
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
    },
  });

  isAvailable(): boolean {
    // FitGirl doesn't require authentication
    return true;
  }

  async search(gameName: string): Promise<SearchAgentResult> {
    try {
      logger.info(`[FitGirl] Searching for: ${gameName}`);
      
      // FitGirl search URL format
      const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(gameName)}&x=0&y=0`;
      
      const response = await this.axiosInstance.get(searchUrl);
      const $ = cheerio.load(response.data);
      
      const candidates: GameDownloadCandidate[] = [];
      
      // FitGirl search results are in article elements
      $('article').each((_, element) => {
        const $article = $(element);
        const title = $article.find('.entry-title a').text().trim();
        const link = $article.find('.entry-title a').attr('href');
        const excerpt = $article.find('.entry-content').text().trim();
        
        if (!title || !link) return;
        
        // Check if this is a game post (not a general info post)
        if (!this.isGamePost(title)) return;
        
        // Check if it matches our search
        if (!this.isMatch(title, gameName)) return;
        
        // Extract size from excerpt
        const sizeInfo = this.extractSize(excerpt);
        
        const candidate: GameDownloadCandidate = {
          title,
          source: this.name,
          releaseType: 'repack',
          quality: 'FitGirl',
          size: sizeInfo?.size,
          sizeBytes: sizeInfo?.bytes,
          platform: 'PC',
        };
        
        candidates.push(candidate);
      });
      
      logger.info(`[FitGirl] Found ${candidates.length} candidates`);
      
      return {
        success: true,
        candidates,
      };
    } catch (error) {
      logger.error('[FitGirl] Search error:', error);
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Enhanced search with IGDB game info for better matching
   */
  async searchEnhanced(
    gameName: string,
    options: EnhancedMatchOptions
  ): Promise<SearchAgentResult> {
    try {
      logger.info(`[FitGirl] Enhanced search for: ${gameName} (${options.igdbGame.name})`);

      // Fetch Steam data if available (description and size)
      let steamDescription: string | undefined;
      let steamSizeBytes: number | undefined;
      logger.info(`[FitGirl] Attempting to fetch Steam data...`);
      logger.info(`[FitGirl] IGDB game has ${options.igdbGame.websites?.length || 0} websites`);

      try {
        const [steamDesc, steamSize] = await Promise.all([
          getSteamDescriptionFromIGDB(options.igdbGame),
          getSteamSizeFromIGDB(options.igdbGame),
        ]);

        if (steamDesc) {
          steamDescription = steamDesc;
          logger.info(`[FitGirl] ✓ Using Steam description for matching (${steamDesc.length} chars)`);
        } else {
          logger.info(`[FitGirl] No Steam description found, using IGDB summary`);
        }

        if (steamSize) {
          steamSizeBytes = steamSize;
          const steamSizeGB = (steamSize / (1024 * 1024 * 1024)).toFixed(1);
          logger.info(`[FitGirl] ✓ Steam size: ${steamSizeGB} GB`);
        } else {
          logger.info(`[FitGirl] No Steam size found`);
        }
      } catch (error) {
        logger.warn(`[FitGirl] Error fetching Steam data: ${error instanceof Error ? error.message : 'Unknown'}`);
      }

      // Build search query - use main game name without edition info
      // Also try alternative names if available to improve search results
      let searchName = options.igdbGame.name;
      
      // For Spider-Man games, prefer alternative name with "Marvel's" prefix
      // as FitGirl's search works better with the full publisher name
      if (options.igdbGame.alternative_names && options.igdbGame.alternative_names.length > 0) {
        const marvelAlt = options.igdbGame.alternative_names.find(alt => 
          alt.name.toLowerCase().includes('marvel') || alt.name.toLowerCase().includes('spider')
        );
        if (marvelAlt) {
          logger.info(`[FitGirl] Using alternative name for search: "${marvelAlt.name}"`);
          searchName = marvelAlt.name;
        }
      }
      
      // Use original search name without aggressive cleaning for FitGirl search
      // FitGirl's search works better with original punctuation
      const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(searchName)}&x=0&y=0`;
      logger.info(`[FitGirl] Search URL: ${searchUrl}`);

      const response = await this.axiosInstance.get(searchUrl);
      const $ = cheerio.load(response.data);

      const candidates: GameDownloadCandidate[] = [];

      const articles = $('article').toArray();

      logger.info(`[FitGirl] Found ${articles.length} articles in search results`);

      // Limit to first 8 articles to prevent timeout
      const articlesToProcess = articles.slice(0, 8);
      logger.info(`[FitGirl] Processing ${articlesToProcess.length} articles (limited to prevent timeout)`);

      // Prepare article data first (quick pass)
      const articleData = articlesToProcess.map(element => {
        const $article = $(element);
        return {
          title: $article.find('.entry-title a').text().trim(),
          link: $article.find('.entry-title a').attr('href'),
          excerpt: $article.find('.entry-content').text().trim(),
        };
      });

      // Fetch full descriptions in parallel (limited to 5 concurrent requests)
      const descriptionsPromises = articleData.map(async (data) => {
        if (!data.link) return data.excerpt;
        try {
          return await this.fetchFullDescription(data.link);
        } catch (error) {
          logger.warn(`[FitGirl] Could not fetch full description for ${data.title}, using excerpt`);
          return data.excerpt;
        }
      });

      const fullDescriptions = await Promise.all(descriptionsPromises);

      // Process articles with fetched descriptions
      for (let i = 0; i < articleData.length; i++) {
        const data = articleData[i];
        const fullDescription = fullDescriptions[i];

        logger.info(`[FitGirl] Processing article: "${data.title}"`);
        logger.info(`[FitGirl] Link: ${data.link}`);

        if (!data.title || !data.link) {
          logger.warn(`[FitGirl] Skipping - missing title or link`);
          continue;
        }

        // Check if this is a game post
        if (!this.isGamePost(data.title)) {
          logger.info(`[FitGirl] Skipping - not a game post`);
          continue;
        }

        // Extract size from description (before matching so we can use it in validation)
        const sizeInfo = this.extractSize(fullDescription);

        // Use enhanced matching with IGDB data, full description, Steam size, and candidate size
        const optionsWithSteam = {
          ...options,
          steamDescription,
          steamSizeBytes,
          candidateSizeBytes: sizeInfo?.bytes
        };
        const matchResult = this.matchWithIGDB(data.title, optionsWithSteam, fullDescription);

        logger.info(`[FitGirl] Match result: score=${matchResult.score}, matches=${matchResult.matches}`);
        logger.info(`[FitGirl] Match reasons: [${matchResult.reasons.join(', ')}]`);

        if (!matchResult.matches) {
          logger.warn(`[FitGirl] Filtered out: "${data.title}" - score ${matchResult.score} below threshold`);
          continue;
        }

        // Fetch download links (magnet URLs) from the post page
        let magnetUrl: string | undefined;
        let infoUrl: string | undefined;
        try {
          logger.info(`[FitGirl] Fetching download links from: ${data.link}`);
          const downloadLinks = await this.getDownloadLinks(data.link!);
          if (downloadLinks.length > 0 && downloadLinks[0].magnetUrl) {
            magnetUrl = downloadLinks[0].magnetUrl;
            infoUrl = data.link;
            logger.info(`[FitGirl] Found magnet link for: ${data.title}`);
          } else {
            logger.warn(`[FitGirl] No magnet links found for: ${data.title}`);
          }
        } catch (error) {
          logger.error(`[FitGirl] Failed to fetch download links for ${data.title}:`, error);
        }

        const candidate: GameDownloadCandidate = {
          title: data.title,
          source: this.name,
          releaseType: 'repack',
          quality: 'FitGirl',
          size: sizeInfo?.size,
          sizeBytes: sizeInfo?.bytes,
          magnetUrl,
          infoUrl,
          platform: 'PC',
          // Store match score for sorting
          matchScore: matchResult.score,
          matchReasons: matchResult.reasons,
        };

        candidates.push(candidate);
      }
      
      // Sort by match score (highest first)
      candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
      
      logger.info(`[FitGirl] Enhanced search found ${candidates.length} candidates`);
      
      return {
        success: true,
        candidates,
      };
    } catch (error) {
      logger.error('[FitGirl] Enhanced search error:', error);
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get download links from a FitGirl post page
   */
  async getDownloadLinks(postUrl: string): Promise<Partial<GameDownloadCandidate>[]> {
    try {
      logger.info(`[FitGirl] Getting download links from: ${postUrl}`);
      
      const response = await this.axiosInstance.get(postUrl);
      const $ = cheerio.load(response.data);
      
      const links: Partial<GameDownloadCandidate>[] = [];
      
      // Look for magnet links
      $('a[href^="magnet:"]').each((_, element) => {
        const magnetUrl = $(element).attr('href');
        const text = $(element).text().trim();
        
        if (magnetUrl) {
          links.push({
            magnetUrl,
            title: text || undefined,
          });
        }
      });
      
      // Also look for .torrent file links
      $('a[href$=".torrent"]').each((_, element) => {
        const torrentUrl = $(element).attr('href');
        if (torrentUrl) {
          links.push({
            torrentUrl: torrentUrl.startsWith('http') ? torrentUrl : `${this.baseUrl}${torrentUrl}`,
          });
        }
      });
      
      logger.info(`[FitGirl] Found ${links.length} download links`);
      
      return links;
    } catch (error) {
      logger.error('[FitGirl] Get download links error:', error);
      return [];
    }
  }

  /**
   * Override matching to skip update penalties (FitGirl doesn't have separate update posts)
   */
  public matchWithIGDB(title: string, options: any, description?: string): any {
    const result = super.matchWithIGDB(title, options, description);

    // Remove update penalty for FitGirl - they include updates in main game posts
    if (result.reasons.includes('likely patch/update file')) {
      const penaltyIndex = result.reasons.indexOf('likely patch/update file');
      result.reasons.splice(penaltyIndex, 1);
      result.score = Math.min(100, result.score + 35); // Restore the -35 penalty
      logger.debug(`[FitGirl] Removed update penalty, new score: ${result.score}`);
    }

    return result;
  }

  /**
   * Fetch full game description from FitGirl post page
   */
  private async fetchFullDescription(postUrl: string): Promise<string> {
    try {
      const response = await this.axiosInstance.get(postUrl);
      const $ = cheerio.load(response.data);

      // Extract the main content - FitGirl uses .entry-content
      const $content = $('.entry-content');

      // Strategy 1: Look for "Game Description" div (most reliable)
      // FitGirl puts the actual game description in a div containing "Game Description" text
      let gameDescription: string | null = null;
      $content.find('div').each((_, element) => {
        const $el = $(element);
        const text = $el.text().trim();
        
        // Look for div containing "Game Description" header
        if (text.toLowerCase().startsWith('game description') || text.toLowerCase().includes('game description\n')) {
          // Take the longest one (there may be empty placeholders)
          if (!gameDescription || text.length > gameDescription.length) {
            gameDescription = text;
          }
        }
      });

      // Clean up the game description
      if (gameDescription) {
        gameDescription = gameDescription
          .replace(/^Game Description\s*/i, '')  // Remove header
          .replace(/\s+/g, ' ')                   // Normalize whitespace
          .trim();
        
        if (gameDescription.length > 100) {
          logger.info(`[FitGirl] Found Game Description div: ${gameDescription.length} chars`);
          return gameDescription;
        }
      }

      // Strategy 2: Find all paragraphs before "Repack Features" or download sections
      // (fallback for older posts without Game Description div)
      let descriptionParts: string[] = [];
      let foundRepackSection = false;

      $content.find('p, div').each((_, element): boolean | void => {
        const $el = $(element);
        const text = $el.text().trim();

        // Skip if we've reached repack features or download sections
        if (text.match(/Repack Features|Installation|Download Mirrors|Based on|System Requirements|Minimum:|Recommended:|Genres\/Tags:|Companies:|Languages:|Original Size:|Repack Size:/i)) {
          foundRepackSection = true;
          return false; // Stop iterating
        }

        // Skip metadata lines and download file names
        if (text.match(/^#\d+/) || text.length < 20) {
          return undefined; // Continue to next element
        }

        // Skip download file names (e.g., "game_name.part1.rar")
        if (text.match(/\.part\d+\.(rar|zip|7z)|fitgirl-repacks\.site.*\.(rar|zip|7z|exe)/i)) {
          return undefined; // Continue to next element
        }

        // Skip if already in repack section
        if (foundRepackSection) {
          return undefined;
        }

        // Get the text content
        if (text.length > 0) {
          descriptionParts.push(text);
        }
        return undefined;
      });

      let description = descriptionParts.join('\n\n').trim();

      // If we didn't get enough content, try extracting just from <p> tags
      if (description.length < 100) {
        descriptionParts = [];
        $content.find('p').each((_, element): void => {
          const $p = $(element);
          const text = $p.text().trim();

          // Skip short paragraphs and metadata
          if (text.length > 50 && !text.match(/^#\d+|Genres\/Tags:|Companies:|Languages:|Original Size:|Repack Size:/i)) {
            descriptionParts.push(text);
          }
        });
        description = descriptionParts.slice(0, 3).join('\n\n').trim();
      }

      // Clean up extra whitespace
      description = description
        .replace(/\s+/g, ' ')
        .replace(/\n\s+\n/g, '\n\n')
        .trim();

      // Remove common FitGirl metadata prefixes
      description = description
        .replace(/^Discussion and \(possible\) future updates on CS\.RIN\.RU thread\s*/i, '')
        .replace(/^Enter the [A-Za-z]+ realm:\s*/i, '')
        .trim();

      logger.info(`[FitGirl] Extracted description (fallback method): ${description.length} chars`);

      return description || '';
    } catch (error) {
      logger.error(`[FitGirl] Error fetching full description:`, error);
      throw error;
    }
  }

  /**
   * Check if a post is a game repack (not a general info post)
   */
  private isGamePost(title: string): boolean {
    const lower = title.toLowerCase();

    // Filter out non-game posts
    const nonGameKeywords = [
      'problem', 'announcement', 'faq', 'about', 'contact',
      'request', 'wishlist', 'repacks list', 'troubleshooting',
      'disclaimer', 'donation', 'copyright', 'dmca'
    ];

    // Check for non-game keywords
    if (nonGameKeywords.some(kw => lower.includes(kw))) return false;

    // Must look like a game title (not too short, not just numbers)
    if (title.length < 3) return false;

    return true;
  }
}
