import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { IGDBGame, GamePlatform, GameGenre, GameCover } from '@dasharr/shared-types';

export interface IGDBConfig {
  clientId: string;
  clientSecret: string;
}

export class IGDBClient {
  private axiosInstance: AxiosInstance;
  private serviceName = 'igdb';
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: IGDBConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;

    this.axiosInstance = axios.create({
      baseURL: 'https://api.igdb.com/v4',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        // Ensure we have a valid access token
        await this.ensureAuthenticated();
        
        config.headers['Client-ID'] = this.clientId;
        config.headers['Authorization'] = `Bearer ${this.accessToken}`;
        
        logger.debug(`[${this.serviceName}] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error(`[${this.serviceName}] Request error:`, error);
        return Promise.reject(error);
      }
    );

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          logger.error(
            `[${this.serviceName}] Response error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
          );
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Authenticate with Twitch OAuth to get an access token
   */
  private async authenticate(): Promise<void> {
    try {
      logger.debug('[IGDB] Authenticating with Twitch OAuth...');
      
      const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
        },
        timeout: 10000,
      });

      this.accessToken = response.data.access_token;
      // Set token expiry with a 60-second buffer
      this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
      
      logger.debug('[IGDB] Successfully authenticated with Twitch OAuth');
    } catch (error) {
      logger.error('[IGDB] Failed to authenticate:', error);
      throw new Error('IGDB authentication failed. Check your Client ID and Client Secret.');
    }
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  /**
   * Test the connection to IGDB
   */
  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      await this.ensureAuthenticated();
      // Try a simple search to verify connection
      await this.searchGames('test', 1);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message };
    }
  }

  /**
   * Search for games by name
   */
  async searchGames(query: string, limit: number = 20): Promise<IGDBGame[]> {
    const searchQuery = query
      .replace(/"/g, '\\"') // Escape quotes
      .trim();

    const body = `
      search "${searchQuery}";
      fields id, name, slug, category, summary, storyline, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, status;
      fields cover.id, cover.url, cover.width, cover.height;
      fields platforms.id, platforms.name, platforms.abbreviation;
      fields genres.id, genres.name;
      fields alternative_names.id, alternative_names.name, alternative_names.comment;
      fields websites.id, websites.url, websites.category;
      fields franchises, collections, version_title, version_parent;
      limit ${limit};
    `;

    const response = await this.axiosInstance.post<IGDBGame[]>('/games', body);
    return response.data;
  }

  /**
   * Get upcoming games (released in the future or recent releases)
   */
  async getUpcomingGames(limit: number = 20): Promise<IGDBGame[]> {
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
    const ninetyDaysFromNow = now + (90 * 24 * 60 * 60);

    const body = `
      fields id, name, slug, category, summary, storyline, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, status;
      fields cover.id, cover.url, cover.width, cover.height;
      fields platforms.id, platforms.name, platforms.abbreviation;
      fields genres.id, genres.name;
      fields version_title, version_parent;
      where first_release_date > ${thirtyDaysAgo} & first_release_date < ${ninetyDaysFromNow} & status != 6 & status != 8;
      sort first_release_date asc;
      limit ${limit};
    `;

    const response = await this.axiosInstance.post<IGDBGame[]>('/games', body);
    return response.data;
  }

  /**
   * Get popular/highly rated games
   */
  async getPopularGames(limit: number = 20): Promise<IGDBGame[]> {
    const body = `
      fields id, name, slug, category, summary, storyline, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, status;
      fields cover.id, cover.url, cover.width, cover.height;
      fields platforms.id, platforms.name, platforms.abbreviation;
      fields genres.id, genres.name;
      fields version_title, version_parent;
      where rating_count > 100 & aggregated_rating > 75;
      sort aggregated_rating desc;
      limit ${limit};
    `;

    const response = await this.axiosInstance.post<IGDBGame[]>('/games', body);
    return response.data;
  }

  /**
   * Get popular games with pagination support
   */
  async getPopularGamesPage(limit: number, offset: number): Promise<IGDBGame[]> {
    const body = `
      fields id, name, slug, category, summary, storyline, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, status;
      fields cover.id, cover.url, cover.width, cover.height;
      fields platforms.id, platforms.name, platforms.abbreviation;
      fields genres.id, genres.name;
      fields version_title, version_parent;
      where rating_count > 100 & aggregated_rating > 75;
      sort aggregated_rating desc;
      limit ${limit};
      offset ${offset};
    `;

    const response = await this.axiosInstance.post<IGDBGame[]>('/games', body);
    return response.data;
  }

  /**
   * Get highly anticipated games
   */
  async getAnticipatedGames(limit: number = 20): Promise<IGDBGame[]> {
    const now = Math.floor(Date.now() / 1000);
    const twoYearsFromNow = now + (730 * 24 * 60 * 60);

    const body = `
      fields id, name, slug, category, summary, storyline, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, status, hypes;
      fields cover.id, cover.url, cover.width, cover.height;
      fields platforms.id, platforms.name, platforms.abbreviation;
      fields genres.id, genres.name;
      fields websites.url, websites.category;
      fields version_title, version_parent;
      where first_release_date > ${now} & first_release_date < ${twoYearsFromNow};
      sort hypes desc;
      limit ${limit * 3};
    `;

    try {
      logger.info(`[IGDB] Anticipated games query: ${body.trim()}`);
      const response = await this.axiosInstance.post<IGDBGame[]>('/games', body);
      logger.info(`[IGDB] Anticipated games query returned ${response.data.length} results`);
      if (response.data.length > 0) {
        logger.info(`[IGDB] First game: ${JSON.stringify(response.data[0])}`);
      } else {
        logger.warn(`[IGDB] Query returned empty array. Status: ${response.status}`);
      }
      return response.data;
    } catch (error: any) {
      logger.error(`[IGDB] Anticipated games query failed:`, error.response?.data || error.message);
      logger.error(`[IGDB] Query was: ${body.trim()}`);
      return [];
    }
  }

  /**
   * Get top rated games of all time
   */
  async getTopRatedGames(limit: number = 20): Promise<IGDBGame[]> {
    const body = `
      fields id, name, slug, category, summary, storyline, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, status;
      fields cover.id, cover.url, cover.width, cover.height;
      fields platforms.id, platforms.name, platforms.abbreviation;
      fields genres.id, genres.name;
      fields websites.url, websites.category;
      fields version_title, version_parent;
      where aggregated_rating_count > 10 & aggregated_rating > 75;
      sort aggregated_rating desc;
      limit ${limit * 3};
    `;

    try {
      logger.info(`[IGDB] Top-rated games query: ${body.trim()}`);
      const response = await this.axiosInstance.post<IGDBGame[]>('/games', body);
      logger.info(`[IGDB] Top-rated games query returned ${response.data.length} results`);
      if (response.data.length > 0) {
        logger.info(`[IGDB] First game: ${JSON.stringify(response.data[0])}`);
      } else {
        logger.warn(`[IGDB] Query returned empty array. Status: ${response.status}`);
      }
      return response.data;
    } catch (error: any) {
      logger.error(`[IGDB] Top-rated games query failed:`, error.response?.data || error.message);
      logger.error(`[IGDB] Query was: ${body.trim()}`);
      return [];
    }
  }

  /**
   * Get trending/popular games (based on recent popularity metrics)
   */
  async getTrendingGames(limit: number = 20): Promise<IGDBGame[]> {
    const sixMonthsAgo = Math.floor(Date.now() / 1000) - (180 * 24 * 60 * 60);

    const body = `
      fields id, name, slug, category, summary, storyline, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, status, hypes, follows;
      fields cover.id, cover.url, cover.width, cover.height;
      fields platforms.id, platforms.name, platforms.abbreviation;
      fields genres.id, genres.name;
      fields websites.url, websites.category;
      fields version_title, version_parent;
      where first_release_date > ${sixMonthsAgo};
      sort follows desc;
      limit ${limit * 3};
    `;

    try {
      const response = await this.axiosInstance.post<IGDBGame[]>('/games', body);
      logger.info(`[IGDB] Trending games query returned ${response.data.length} results`);
      return response.data;
    } catch (error: any) {
      logger.error(`[IGDB] Trending games query failed:`, error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get game details by ID
   */
  async getGameById(id: number): Promise<IGDBGame | null> {
    const body = `
      fields id, name, slug, category, summary, storyline, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, status;
      fields cover.id, cover.url, cover.width, cover.height;
      fields platforms.id, platforms.name, platforms.abbreviation;
      fields genres.id, genres.name;
      fields alternative_names.id, alternative_names.name, alternative_names.comment;
      fields websites.id, websites.url, websites.category;
      fields franchises, collections, version_title, version_parent;
      fields similar_games, remakes, remasters, expansions, dlcs, bundles, ports, forks, standalone_expansions, parent_game, version_parent;
      where id = ${id};
    `;

    const response = await this.axiosInstance.post<IGDBGame[]>('/games', body);
    return response.data[0] || null;
  }

  /**
   * Get games by IDs (batch)
   */
  async getGamesByIds(ids: number[]): Promise<IGDBGame[]> {
    if (ids.length === 0) return [];
    
    const idList = ids.join(',');
    const body = `
      fields id, name, slug, category, summary, storyline, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, status;
      fields cover.id, cover.url, cover.width, cover.height;
      fields platforms.id, platforms.name, platforms.abbreviation;
      fields genres.id, genres.name;
      fields alternative_names.id, alternative_names.name, alternative_names.comment;
      fields websites.id, websites.url, websites.category;
      fields franchises, collections;
      where id = (${idList});
    `;

    const response = await this.axiosInstance.post<IGDBGame[]>('/games', body);
    return response.data;
  }

  /**
   * Get games by franchise ID
   * Used for sequel detection
   */
  async getGamesByFranchise(franchiseId: number): Promise<Array<{
    id: number;
    name: string;
    slug: string;
    first_release_date?: number;
  }>> {
    const body = `
      fields id, name, slug, category, first_release_date;
      where franchises = (${franchiseId});
      limit 100;
    `;

    const response = await this.axiosInstance.post<Array<{
      id: number;
      name: string;
      slug: string;
      first_release_date?: number;
    }>>('/games', body);
    
    return response.data;
  }

  /**
   * Get games by collection ID
   * Collections are often used for series (similar to franchises).
   */
  async getGamesByCollection(collectionId: number): Promise<Array<{
    id: number;
    name: string;
    slug: string;
    first_release_date?: number;
  }>> {
    const body = `
      fields id, name, slug, category, first_release_date;
      where collections = (${collectionId});
      limit 100;
    `;

    const response = await this.axiosInstance.post<Array<{
      id: number;
      name: string;
      slug: string;
      first_release_date?: number;
    }>>('/games', body);
    
    return response.data;
  }

  /**
   * Get game versions for a base game ID
   * Versions typically represent editions or variants (e.g., "Director's Cut")
   */
  async getGameVersionsByGameId(gameId: number): Promise<Array<{
    id: number;
    game: number;
    version_title?: string;
    category?: number;
  }>> {
    const body = `
      fields id, game, version_title, category;
      where game = ${gameId};
      limit 100;
    `;

    const response = await this.axiosInstance.post<Array<{
      id: number;
      game: number;
      version_title?: string;
      category?: number;
    }>>('/game_versions', body);

    return response.data;
  }

  /**
   * Convert IGDB cover URL to full size
   * IGDB URLs look like: //images.igdb.com/igdb/image/upload/t_cover/co1r8v.jpg
   * We want to change 't_cover' to 't_1080p' or 't_original' for full size
   */
  getCoverUrl(cover?: GameCover, size: 'thumb' | 'cover' | '1080p' | 'original' = 'cover'): string | undefined {
    if (!cover?.url) return undefined;
    
    const sizeMap = {
      thumb: 't_thumb',
      cover: 't_cover_big',
      '1080p': 't_1080p',
      original: 't_original',
    };

    // IGDB URLs look like: //images.igdb.com/igdb/image/upload/t_thumb/co1r8v.jpg
    // We need to replace the size token (t_thumb or t_cover) with the desired size
    // Use regex to match exact token to avoid partial replacements
    const url = cover.url.replace(/\bt_thumb\b/, sizeMap[size]).replace(/\bt_cover\b/, sizeMap[size]);
    return `https:${url}`;
  }

  /**
   * Format release date from Unix timestamp
   */
  formatReleaseDate(timestamp?: number): string | undefined {
    if (!timestamp) return undefined;
    return new Date(timestamp * 1000).toISOString().split('T')[0];
  }

  /**
   * Check if game is released
   */
  isReleased(game: IGDBGame): boolean {
    if (!game.first_release_date) return false;
    const releaseDate = new Date(game.first_release_date * 1000);
    return releaseDate <= new Date();
  }

  /**
   * Check if game is upcoming
   */
  isUpcoming(game: IGDBGame): boolean {
    if (!game.first_release_date) return true; // No date = treat as upcoming
    const releaseDate = new Date(game.first_release_date * 1000);
    return releaseDate > new Date();
  }
}

