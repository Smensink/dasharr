import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseGameSearchAgent, SearchAgentResult } from './BaseGameSearchAgent';
import { GameDownloadCandidate } from '@dasharr/shared-types';
import { logger } from '../../../utils/logger';

/**
 * SteamRIP Search Agent
 * 
 * SteamRIP provides clean Steam game files.
 * Site: https://steamrip.com/
 */
export class SteamRipAgent extends BaseGameSearchAgent {
  readonly name = 'SteamRIP';
  readonly baseUrl = 'https://steamrip.com';
  readonly requiresAuth = false;
  readonly priority = 80;
  readonly releaseTypes: ('repack' | 'rip' | 'scene' | 'p2p')[] = ['rip'];

  private axiosInstance = axios.create({
    timeout: 30000,
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
    return true;
  }

  async search(gameName: string): Promise<SearchAgentResult> {
    try {
      logger.info(`[SteamRIP] Searching for: ${gameName}`);
      
      // SteamRIP has a search page
      const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(gameName)}`;
      
      const response = await this.axiosInstance.get(searchUrl);
      const $ = cheerio.load(response.data);
      
      const candidates: GameDownloadCandidate[] = [];
      
      // SteamRIP uses article cards
      $('article').each((_, element) => {
        const $article = $(element);
        const title = $article.find('h2 a, h1 a, .entry-title a').first().text().trim();
        const link = $article.find('h2 a, h1 a, .entry-title a').first().attr('href');
        
        if (!title || !link) return;
        
        // Check match
        if (!this.isMatch(title, gameName)) return;
        
        candidates.push({
          title,
          source: this.name,
          releaseType: 'rip',
          quality: 'SteamRip',
        });
      });
      
      logger.info(`[SteamRIP] Found ${candidates.length} candidates`);
      
      return {
        success: true,
        candidates,
      };
    } catch (error) {
      logger.error('[SteamRIP] Search error:', error);
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getDownloadLinks(postUrl: string): Promise<Partial<GameDownloadCandidate>[]> {
    try {
      logger.info(`[SteamRIP] Getting download links from: ${postUrl}`);
      
      const response = await this.axiosInstance.get(postUrl);
      const $ = cheerio.load(response.data);
      
      const links: Partial<GameDownloadCandidate>[] = [];
      
      // SteamRIP typically uses direct download links or mirrors
      $('a[href*="download"], a[href*="mega.nz"], a[href*="drive.google"]').each((_, element) => {
        const url = $(element).attr('href');
        if (url) {
          links.push({ torrentUrl: url }); // Using torrentUrl field for DDL links
        }
      });
      
      return links;
    } catch (error) {
      logger.error('[SteamRIP] Get download links error:', error);
      return [];
    }
  }
}
