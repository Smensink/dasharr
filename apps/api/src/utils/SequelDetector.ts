/**
 * Sequel Detection Utility
 * 
 * Detects sequels and related games to prevent false positive matches.
 * Uses IGDB franchise/collection data combined with name parsing.
 * 
 * Example: Searching "Hollow Knight" should not match "Hollow Knight: Silksong"
 */

import { IGDBClient } from '../clients/IGDBClient';
import { logger } from './logger';

interface SequelInfo {
  igdbId: number;
  name: string;
  slug: string;
  releaseDate?: number;
}

export interface SequelPatterns {
  exactNames: string[];        // Exact game names to exclude
  namePatterns: RegExp[];      // Regex patterns to match sequels
  confidence: 'high' | 'medium' | 'low'; // How confident we are these are sequels
}

export class SequelDetector {
  private igdbClient: IGDBClient;
  private cache: Map<number, SequelPatterns> = new Map();
  private cacheExpiry: Map<number, number> = new Map();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Common sequel indicators in game names
  private readonly SEQUEL_PATTERNS = {
    // Numbers: "Game 2", "Game II", "Game 3", etc.
    numberSuffix: /\s+(2|3|4|5|6|7|8|9|10|11|12|13|14|15)\s*$/i,
    romanNumerals: /\s+(II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\s*$/i,
    
    // Common sequel words
    sequelWords: /\b(sequel|episode\s+2|part\s+2|book\s+2|chapter\s+2)\b/i,
    
    // Year-based (if original doesn't have year)
    yearSuffix: /\s+20\d{2}\s*$/,
  };

  // Known sequels that don't follow standard patterns
  private readonly KNOWN_SEQUELS: Record<string, string[]> = {
    'Hollow Knight': ['Hollow Knight: Silksong', 'Silksong'],
    'Hades': ['Hades II', 'Hades 2'],
    'Cyberpunk 2077': ['Cyberpunk 2077: Edgerunners', 'Edgerunners'],
    'The Witcher': ['The Witcher 2', 'The Witcher 3'],
    'Red Dead Redemption': ['Red Dead Redemption 2'],
    'Portal': ['Portal 2'],
    'Left 4 Dead': ['Left 4 Dead 2'],
    'Half-Life': ['Half-Life 2'],
    'Team Fortress': ['Team Fortress 2'],
    'Payday': ['Payday 2', 'Payday 3'],
    'Dying Light': ['Dying Light 2'],
    'Watch Dogs': ['Watch Dogs 2', 'Watch Dogs: Legion'],
    'Borderlands': ['Borderlands 2', 'Borderlands 3'],
    'Mass Effect': ['Mass Effect 2', 'Mass Effect 3', 'Mass Effect: Andromeda'],
    'Dragon Age': ['Dragon Age II', 'Dragon Age: Inquisition'],
    'Dark Souls': ['Dark Souls II', 'Dark Souls III'],
    'Sekiro': ['Sekiro: Shadows Die Twice'], // Not a sequel but might confuse
  };

  constructor(igdbClient: IGDBClient) {
    this.igdbClient = igdbClient;
  }

  /**
   * Get sequel patterns for a game
   * Uses cached data if available and not expired
   */
  async getSequelPatterns(gameId: number, gameName: string): Promise<SequelPatterns> {
    // Check cache
    const cached = this.cache.get(gameId);
    const expiry = this.cacheExpiry.get(gameId);
    
    if (cached && expiry && Date.now() < expiry) {
      logger.debug(`[SequelDetector] Using cached patterns for ${gameName}`);
      return cached;
    }

    try {
      const patterns = await this.fetchSequelPatterns(gameId, gameName);
      
      // Cache the result
      this.cache.set(gameId, patterns);
      this.cacheExpiry.set(gameId, Date.now() + this.CACHE_TTL_MS);
      
      return patterns;
    } catch (error) {
      logger.warn(`[SequelDetector] Failed to fetch sequel patterns for ${gameName}:`, error);
      // Return basic patterns from known sequels as fallback
      return this.getFallbackPatterns(gameName);
    }
  }

  /**
   * Fetch sequel patterns from IGDB and analyze names
   */
  private async fetchSequelPatterns(gameId: number, gameName: string): Promise<SequelPatterns> {
    const exactNames: string[] = [];
    const namePatterns: RegExp[] = [];
    
    // 1. Add known sequels from hardcoded list
    const knownSequels = this.KNOWN_SEQUELS[gameName] || [];
    for (const sequel of knownSequels) {
      exactNames.push(sequel.toLowerCase());
      // Also add as pattern for partial matching
      namePatterns.push(new RegExp(`\\b${this.escapeRegex(sequel)}\\b`, 'i'));
    }

    // Also check for partial name matches in known sequels
    for (const [baseName, sequels] of Object.entries(this.KNOWN_SEQUELS)) {
      if (gameName.toLowerCase().includes(baseName.toLowerCase()) || 
          baseName.toLowerCase().includes(gameName.toLowerCase())) {
        for (const sequel of sequels) {
          if (!exactNames.includes(sequel.toLowerCase())) {
            exactNames.push(sequel.toLowerCase());
            namePatterns.push(new RegExp(`\\b${this.escapeRegex(sequel)}\\b`, 'i'));
          }
        }
      }
    }

    // 2. Fetch franchise games from IGDB
    try {
      const franchiseGames = await this.fetchFranchiseGames(gameId);
      
      for (const game of franchiseGames) {
        // Skip the original game itself
        if (game.igdbId === gameId) continue;
        
        // Check if this looks like a sequel based on name patterns
        const isLikelySequel = this.isLikelySequel(gameName, game.name);
        
        if (isLikelySequel.isSequel) {
          exactNames.push(game.name.toLowerCase());
          
          // Create patterns for matching
          // Match full name and also common variations
          namePatterns.push(new RegExp(`\\b${this.escapeRegex(game.name)}\\b`, 'i'));
          
          // If sequel has subtitle, also match just the subtitle
          if (isLikelySequel.subtitle) {
            namePatterns.push(new RegExp(`\\b${this.escapeRegex(isLikelySequel.subtitle)}\\b`, 'i'));
          }
        }
      }
    } catch (error) {
      logger.debug(`[SequelDetector] Could not fetch franchise games for ${gameName}:`, error);
    }

    // 3. Generate regex patterns from original game name
    // These will match common sequel patterns
    const basePatterns = this.generateSequelPatterns(gameName);
    namePatterns.push(...basePatterns);

    // Deduplicate
    const uniqueExactNames = [...new Set(exactNames)];
    const uniquePatterns = this.deduplicatePatterns(namePatterns);

    // Calculate confidence based on data source
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (uniqueExactNames.length > 5) {
      confidence = 'high';
    } else if (knownSequels.length > 0) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      exactNames: uniqueExactNames,
      namePatterns: uniquePatterns,
      confidence,
    };
  }

  /**
   * Fetch all games in the same franchise from IGDB
   */
  private async fetchFranchiseGames(gameId: number): Promise<SequelInfo[]> {
    // First, get the game to find its franchises
    const game = await this.igdbClient.getGameById(gameId);
    
    if (!game || !game.franchises || game.franchises.length === 0) {
      return [];
    }

    const games: SequelInfo[] = [];
    
    // Fetch all games in each franchise
    for (const franchiseId of game.franchises) {
      try {
        const franchiseGames = await this.fetchGamesByFranchise(franchiseId);
        games.push(...franchiseGames);
      } catch (error) {
        logger.debug(`[SequelDetector] Failed to fetch franchise ${franchiseId}:`, error);
      }
    }

    // Remove duplicates
    const seen = new Set<number>();
    return games.filter(g => {
      if (seen.has(g.igdbId)) return false;
      seen.add(g.igdbId);
      return true;
    });
  }

  /**
   * Fetch games by franchise ID from IGDB
   */
  private async fetchGamesByFranchise(franchiseId: number): Promise<SequelInfo[]> {
    try {
      const games = await this.igdbClient.getGamesByFranchise(franchiseId);
      return games.map(g => ({
        igdbId: g.id,
        name: g.name,
        slug: g.slug,
        releaseDate: g.first_release_date,
      }));
    } catch (error) {
      logger.debug(`[SequelDetector] Failed to fetch franchise ${franchiseId}:`, error);
      return [];
    }
  }

  /**
   * Determine if a game name looks like a sequel to the base game
   */
  private isLikelySequel(baseName: string, candidateName: string): { 
    isSequel: boolean; 
    subtitle?: string;
    reason: string;
  } {
    const base = baseName.toLowerCase().trim();
    const candidate = candidateName.toLowerCase().trim();

    // Exact match is not a sequel
    if (base === candidate) {
      return { isSequel: false, reason: 'same game' };
    }

    // Check if candidate starts with base name
    if (!candidate.startsWith(base)) {
      // Check for "Base Name: Subtitle" format
      if (!candidate.includes(base)) {
        return { isSequel: false, reason: 'different game' };
      }
    }

    // Check for number suffixes
    if (this.SEQUEL_PATTERNS.numberSuffix.test(candidateName) ||
        this.SEQUEL_PATTERNS.romanNumerals.test(candidateName)) {
      return { 
        isSequel: true, 
        reason: 'number suffix (2, 3, II, III, etc.)' 
      };
    }

    // Check for sequel words
    if (this.SEQUEL_PATTERNS.sequelWords.test(candidateName)) {
      return { 
        isSequel: true, 
        reason: 'sequel keywords' 
      };
    }

    // Check for subtitle pattern (Base Name: Subtitle)
    const colonIndex = candidateName.indexOf(':');
    if (colonIndex > 0) {
      const beforeColon = candidateName.substring(0, colonIndex).trim().toLowerCase();
      if (beforeColon === base || base.startsWith(beforeColon)) {
        const subtitle = candidateName.substring(colonIndex + 1).trim();
        return { 
          isSequel: true, 
          subtitle,
          reason: 'subtitle format' 
        };
      }
    }

    // Check if candidate is longer (might be expanded version)
    if (candidate.length > base.length + 3) {
      // Check for year suffix that base doesn't have
      const baseHasYear = this.SEQUEL_PATTERNS.yearSuffix.test(baseName);
      const candidateHasYear = this.SEQUEL_PATTERNS.yearSuffix.test(candidateName);
      
      if (candidateHasYear && !baseHasYear) {
        return { 
          isSequel: true, 
          reason: 'year suffix on expanded version' 
        };
      }
    }

    return { isSequel: false, reason: 'no sequel indicators' };
  }

  /**
   * Generate regex patterns for detecting sequels based on game name
   */
  private generateSequelPatterns(gameName: string): RegExp[] {
    const patterns: RegExp[] = [];
    const escaped = this.escapeRegex(gameName);
    
    // Match "Game Name 2", "Game Name II", etc.
    patterns.push(new RegExp(`\\b${escaped}\\s+(2|3|4|5|II|III|IV|V)\\b`, 'i'));
    
    // Match "Game Name: Subtitle" (likely a sequel/spinoff)
    patterns.push(new RegExp(`\\b${escaped}\\s*:\\s*\\w+`, 'i'));
    
    // Match just the subtitle part if the game has a colon
    const colonIndex = gameName.indexOf(':');
    if (colonIndex > 0) {
      const baseName = gameName.substring(0, colonIndex).trim();
      patterns.push(new RegExp(`\\b${this.escapeRegex(baseName)}\\s+(2|3|4|5|II|III|IV|V)\\b`, 'i'));
    }

    return patterns;
  }

  /**
   * Get fallback patterns when IGDB fetch fails
   */
  private getFallbackPatterns(gameName: string): SequelPatterns {
    const exactNames: string[] = [];
    const namePatterns: RegExp[] = [];

    // Add known sequels
    const knownSequels = this.KNOWN_SEQUELS[gameName] || [];
    for (const sequel of knownSequels) {
      exactNames.push(sequel.toLowerCase());
      namePatterns.push(new RegExp(`\\b${this.escapeRegex(sequel)}\\b`, 'i'));
    }

    // Check for partial matches
    for (const [baseName, sequels] of Object.entries(this.KNOWN_SEQUELS)) {
      if (gameName.toLowerCase().includes(baseName.toLowerCase()) || 
          baseName.toLowerCase().includes(gameName.toLowerCase())) {
        for (const sequel of sequels) {
          if (!exactNames.includes(sequel.toLowerCase())) {
            exactNames.push(sequel.toLowerCase());
            namePatterns.push(new RegExp(`\\b${this.escapeRegex(sequel)}\\b`, 'i'));
          }
        }
      }
    }

    // Generate base patterns
    namePatterns.push(...this.generateSequelPatterns(gameName));

    return {
      exactNames,
      namePatterns,
      confidence: 'low',
    };
  }

  /**
   * Check if a release title matches a sequel (and should be excluded)
   */
  isSequel(releaseTitle: string, patterns: SequelPatterns): boolean {
    const lower = releaseTitle.toLowerCase();

    // Check exact names first
    for (const exactName of patterns.exactNames) {
      if (lower.includes(exactName)) {
        logger.debug(`[SequelDetector] Matched exact sequel name: "${exactName}" in "${releaseTitle}"`);
        return true;
      }
    }

    // Check patterns
    for (const pattern of patterns.namePatterns) {
      if (pattern.test(releaseTitle)) {
        logger.debug(`[SequelDetector] Matched sequel pattern: ${pattern} in "${releaseTitle}"`);
        return true;
      }
    }

    return false;
  }

  /**
   * Clear the cache for a specific game or all games
   */
  clearCache(gameId?: number): void {
    if (gameId) {
      this.cache.delete(gameId);
      this.cacheExpiry.delete(gameId);
    } else {
      this.cache.clear();
      this.cacheExpiry.clear();
    }
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Deduplicate regex patterns
   */
  private deduplicatePatterns(patterns: RegExp[]): RegExp[] {
    const seen = new Set<string>();
    return patterns.filter(p => {
      const key = p.source;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// Export singleton instance creator
export function createSequelDetector(igdbClient: IGDBClient): SequelDetector {
  return new SequelDetector(igdbClient);
}
