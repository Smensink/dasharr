import { GameDownloadCandidate, IGDBGame } from '@dasharr/shared-types';
import { PlatformDetector, GamePlatform } from '../../../utils/PlatformDetector';
import { logger } from '../../../utils/logger';
import { SequelPatterns } from '../../../utils/SequelDetector';

const IGDB_CATEGORY = {
  MAIN_GAME: 0,
  DLC_ADDON: 1,
  EXPANSION: 2,
  BUNDLE: 3,
  STANDALONE_EXPANSION: 4,
  MOD: 5,
  EPISODE: 6,
  SEASON: 7,
  REMAKE: 8,
  REMASTER: 9,
  EXPANDED_GAME: 10,
  PORT: 11,
  FORK: 12,
  PACK: 13,
  UPDATE: 14,
};

export interface SearchAgentResult {
  success: boolean;
  candidates: GameDownloadCandidate[];
  error?: string;
}

export interface EnhancedMatchOptions {
  igdbGame: IGDBGame;
  minMatchScore?: number;
  platform?: string; // Preferred platform (PC, PS5, Xbox, Switch, etc.)
  strictPlatform?: boolean; // If true, only return matches for the specified platform
  steamDescription?: string; // Steam "About This Game" text for better matching
  steamSizeBytes?: number; // Steam game size in bytes for size comparison
  candidateSizeBytes?: number; // Candidate download size in bytes
  sequelPatterns?: SequelPatterns; // IGDB-derived sequel patterns to avoid false matches
  editionTitles?: string[]; // IGDB-derived edition/version titles
}

export interface MatchResult {
  matches: boolean;
  score: number; // 0-100
  reasons: string[];
}

export abstract class BaseGameSearchAgent {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly requiresAuth: boolean;
  
  // Priority order - higher is better
  abstract readonly priority: number;
  
  // What types of releases this agent provides
  abstract readonly releaseTypes: ('repack' | 'rip' | 'scene' | 'p2p')[];

  /**
   * Search for a game by name
   */
  abstract search(gameName: string, options?: {
    platform?: string;
    includeUpcoming?: boolean;
  }): Promise<SearchAgentResult>;

  /**
   * Enhanced search with IGDB game info for better matching
   */
  async searchEnhanced(
    gameName: string,
    options: EnhancedMatchOptions
  ): Promise<SearchAgentResult> {
    // Default implementation falls back to regular search
    // Agents can override this for custom logic
    return this.search(gameName, {
      platform: options.igdbGame.platforms?.[0]?.name,
    });
  }

  /**
   * Check if this agent is available/configured
   */
  abstract isAvailable(): boolean;

  /**
   * Get direct download/torrent link from a result page
   */
  abstract getDownloadLinks?(resultUrl: string): Promise<Partial<GameDownloadCandidate>[]>;

  /**
   * Normalize game name for better matching
   */
  protected normalizeGameName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract year from title if present
   */
  protected extractYear(title: string): number | undefined {
    // Match standalone 4-digit years (1900-2099) that look like release years
    const match = title.match(/\b(19\d{2}|20\d{2})\b/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Remove common suffixes/prefixes from game names for better matching
   */
  protected cleanGameName(name: string): string {
    return name
      .toLowerCase()
      // Normalize special characters (ö→o, ä→a, ü→u, etc.) - simple character map
      .replace(/[öøōŏő]/g, 'o')
      .replace(/[äåāăą]/g, 'a')
      .replace(/[üûùúūŭů]/g, 'u')
      .replace(/[éèêëēĕė]/g, 'e')
      .replace(/[íìîïīĭį]/g, 'i')
      .replace(/[ñń]/g, 'n')
      .replace(/[çć]/g, 'c')
      .replace(/[ß]/g, 'ss')
      // Normalize apostrophes (straight U+0027 and curly U+2019)
      .replace(/[\u0027\u2019]/g, '')
      // Remove hyphens in game names (spider-man -> spiderman)
      .replace(/([a-z])-([a-z])/g, '$1$2')
      // Normalize punctuation to spaces for consistent matching
      .replace(/[^a-z0-9\s]/g, ' ')
      // Remove version/build info (e.g., v1.1116.0.0, build 12345)
      // Handle en-dash (–), em-dash (—), and regular hyphen (-)
      .replace(/\s*[–—-]\s*v?\d+[\d.]*.*$/i, '')
      // Remove everything after + (DLC, bonus content lists)
      .replace(/\s+\+.*$/, '')
      // Remove edition suffixes
      .replace(/\s*(?:-\s*)?(?:complete|goty|game of the year|enhanced|definitive|ultimate|digital deluxe|premium|standard|gold)\s*(?:edition|version)?\s*$/i, '')
      // Remove year suffixes (keep for comparison)
      .replace(/\s*\(\s*\d{4}\s*\)\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }


  protected classifyTitleTokens(title: string, options: EnhancedMatchOptions): {
    normalizedTitle: string;
    normalizedGame: string;
    cleanTitle: string;
    cleanGame: string;
    titleWords: string[];
    gameWords: string[];
    extraWords: string[];
    isSingleWordGame: boolean;
    matchesAlternativeName: boolean;
    hasUpdateToken: boolean;
    hasDlcToken: boolean;
    hasSoundtrackToken: boolean;
    hasNonGameMediaToken: boolean;
    hasModToken: boolean;
    hasFanToken: boolean;
    hasDemoToken: boolean;
    hasEpisodicToken: boolean;
    hasCrackOrFixToken: boolean;
    hasLanguagePackToken: boolean;
    hasFullBundleIndicator: boolean;
    hasMultiGameIndicator: boolean;
    hasEmulatorToken: boolean;
  } {
    const gameName = options.igdbGame.name;
    const cleanTitle = this.cleanGameName(title);
    const cleanGame = this.cleanGameName(gameName);

    const normalizedTitle = this.normalizeGameName(title);
    const normalizedGame = this.normalizeGameName(gameName);
    const titleWords = normalizedTitle.split(/\s+/).filter(Boolean);
    const gameWords = normalizedGame.split(/\s+/).filter(Boolean);
    const matchesAlternativeName = this.matchesAlternativeName(title, options.igdbGame);

    const extraWords = titleWords
      .filter(word => !gameWords.includes(word))
      .filter(word => !this.isAllowedResidualWord(word));

    const lower = normalizedTitle;
    const rawLower = title.toLowerCase();
    const hasUpdateToken = /\b(update|patch|hotfix)\b/.test(lower);
    const hasDlcToken = /\b(dlc|expansion|addon|add-on|season\s*pass|story\s*pack)\b/.test(lower);
    const hasSoundtrackToken = /\b(ost|soundtrack)\b/.test(lower);
    const hasNonGameMediaToken = /\b(artbook|art\s*book|manual|guide|strategy\s*guide|wallpaper|soundtrack|ost)\b/.test(lower);
    const hasModToken = /\b(mod|mods|modded|workshop|trainer|cheat|cheats|savegame|save\s*game|reshade|texture\s*pack|skin)\b/.test(lower);
    const hasFanToken = /\b(fan\s*made|fanmade|fangame|unofficial|tribute|demake)\b/.test(lower);
    const hasDemoToken = /\b(demo|alpha|beta|prototype|test\s*build)\b/.test(lower);
    const hasEpisodicToken = /\b(episode|episodic|season\s*\d+)\b/.test(lower);
    const hasCrackOrFixToken = /\b(crack\s*only|fix\s*only|crackfix|no\s*steam|steamless)\b/.test(lower);
    const hasLanguagePackToken = /\b(language\s*pack|translation|subtitles?)\b/.test(lower);
    const hasFullBundleIndicator = /\b(repack|complete|edition|bundle|collection|goty|definitive|ultimate|deluxe|full|all\s+dlc|all\s+expansions|anthology|trilogy|duology)\b/.test(lower);
    const hasMultiGameIndicator = /(\d+\s*\+\s*\d+|\bduology\b|\btrilogy\b|\banthology\b|\bcollection\b|\bbundle\b)/i.test(rawLower) ||
      /\s[+&]\s/.test(rawLower);
    const hasEmulatorToken = /\b(emu|emulator|emulators|yuzu|ryujinx|rpcs3|xenia|suyu|citra|dolphin)\b/.test(lower);

    return {
      normalizedTitle,
      normalizedGame,
      cleanTitle,
      cleanGame,
      titleWords,
      gameWords,
      extraWords,
      isSingleWordGame: gameWords.length === 1,
      matchesAlternativeName,
      hasUpdateToken,
      hasDlcToken,
      hasSoundtrackToken,
      hasNonGameMediaToken,
      hasModToken,
      hasFanToken,
      hasDemoToken,
      hasEpisodicToken,
      hasCrackOrFixToken,
      hasLanguagePackToken,
      hasFullBundleIndicator,
      hasMultiGameIndicator,
      hasEmulatorToken,
    };
  }

  protected shouldRejectCandidate(title: string, options: EnhancedMatchOptions): { rejected: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const classification = this.classifyTitleTokens(title, options);
    const categoryFlags = this.getCategoryFlags(options.igdbGame);

    const preferredPlatform = this.normalizePreferredPlatform(options.platform);
    if (preferredPlatform) {
      const detector = new PlatformDetector(preferredPlatform);
      const platformMatch = detector.detectPlatform(title);
      const strict = options.strictPlatform === true;
      if (platformMatch.platform !== preferredPlatform && (strict || platformMatch.confidence !== 'low')) {
        reasons.push(`platform mismatch (${platformMatch.platform} vs ${preferredPlatform})`);
      }
    }

    if (classification.hasNonGameMediaToken && !classification.hasFullBundleIndicator) {
      reasons.push('non-game media');
    }
    if (classification.hasLanguagePackToken && !classification.hasFullBundleIndicator) {
      reasons.push('language pack');
    }
    if (classification.hasCrackOrFixToken && !classification.hasFullBundleIndicator) {
      reasons.push('crack/fix only');
    }
    if (classification.hasUpdateToken && !categoryFlags.allowsUpdate && !classification.hasFullBundleIndicator) {
      reasons.push('update/patch only');
    }
    if (classification.hasDlcToken && !categoryFlags.allowsDlc && !classification.hasFullBundleIndicator) {
      reasons.push('dlc/expansion only');
    }
    if (classification.hasEpisodicToken && !categoryFlags.allowsEpisodic) {
      reasons.push('episode/season only');
    }
    if ((classification.hasModToken || classification.hasFanToken) && !categoryFlags.allowsMod) {
      const nameMatch =
        classification.cleanTitle.includes(classification.cleanGame) ||
        classification.matchesAlternativeName;
      if (!(nameMatch && (classification.hasEmulatorToken || classification.hasFullBundleIndicator))) {
        reasons.push('mod/fan content');
      }
    }
    if (classification.hasDemoToken && categoryFlags.isMainLike) {
      reasons.push('demo/alpha/beta');
    }

    if (classification.isSingleWordGame && classification.extraWords.length > 0 && !classification.matchesAlternativeName) {
      reasons.push('single-word title has extra words');
    }

    return { rejected: reasons.length > 0, reasons };
  }

  private normalizePreferredPlatform(platform?: string): GamePlatform | undefined {
    if (!platform) return undefined;
    const lower = platform.toLowerCase();
    if (lower.includes('pc') || lower.includes('windows')) return 'PC';
    if (lower.includes('playstation 5') || lower === 'ps5') return 'PS5';
    if (lower.includes('playstation 4') || lower === 'ps4') return 'PS4';
    if (lower.includes('playstation 3') || lower === 'ps3') return 'PS3';
    if (lower.includes('playstation vita') || lower === 'psvita' || lower === 'vita') return 'PSVita';
    if (lower.includes('xbox 360') || lower === 'xbox360') return 'Xbox360';
    if (lower.includes('xbox')) return 'Xbox';
    if (lower.includes('switch') || lower.includes('nintendo switch')) return 'Switch';
    if (lower.includes('wii u')) return 'WiiU';
    if (lower == 'wii') return 'Wii';
    return undefined;
  }

  protected getCategoryFlags(igdbGame: IGDBGame): {
    isMainLike: boolean;
    allowsDlc: boolean;
    allowsUpdate: boolean;
    allowsMod: boolean;
    allowsEpisodic: boolean;
  } {
    const category = igdbGame.category;
    const isMainLike = category == null || [
      IGDB_CATEGORY.MAIN_GAME,
      IGDB_CATEGORY.REMAKE,
      IGDB_CATEGORY.REMASTER,
      IGDB_CATEGORY.EXPANDED_GAME,
      IGDB_CATEGORY.PORT,
      IGDB_CATEGORY.FORK,
    ].includes(category);

    return {
      isMainLike,
      allowsDlc: [
        IGDB_CATEGORY.DLC_ADDON,
        IGDB_CATEGORY.EXPANSION,
        IGDB_CATEGORY.BUNDLE,
        IGDB_CATEGORY.STANDALONE_EXPANSION,
        IGDB_CATEGORY.PACK,
      ].includes(category || -1),
      allowsUpdate: category === IGDB_CATEGORY.UPDATE,
      allowsMod: category === IGDB_CATEGORY.MOD,
      allowsEpisodic: [IGDB_CATEGORY.EPISODE, IGDB_CATEGORY.SEASON].includes(category || -1),
    };
  }

  private getIGDBPlatforms(igdbGame: IGDBGame): Set<GamePlatform> {
    const platforms = new Set<GamePlatform>();
    if (!igdbGame.platforms) return platforms;

    for (const platform of igdbGame.platforms) {
      const name = platform.name?.toLowerCase() || '';
      const abbr = platform.abbreviation?.toLowerCase() || '';
      const value = `${name} ${abbr}`;

      if (value.includes('pc') || value.includes('windows')) platforms.add('PC');
      if (value.includes('playstation 5') || value.includes('ps5')) platforms.add('PS5');
      if (value.includes('playstation 4') || value.includes('ps4')) platforms.add('PS4');
      if (value.includes('playstation 3') || value.includes('ps3')) platforms.add('PS3');
      if (value.includes('ps vita') || value.includes('psvita') || value.includes('vita')) platforms.add('PSVita');
      if (value.includes('xbox 360') || value.includes('x360') || value.includes('xb360')) platforms.add('Xbox360');
      if (value.includes('xbox')) platforms.add('Xbox');
      if (value.includes('switch') || value.includes('nintendo switch')) platforms.add('Switch');
      if (value.includes('wii u') || value.includes('wiiu')) platforms.add('WiiU');
      if (value.includes('wii')) platforms.add('Wii');
    }

    return platforms;
  }

  private matchesAlternativeName(title: string, igdbGame: IGDBGame): boolean {
    if (!igdbGame.alternative_names || igdbGame.alternative_names.length === 0) return false;
    const cleanTitle = this.cleanGameName(title);
    const normalizedTitle = this.normalizeGameName(title);

    return igdbGame.alternative_names.some(alt => {
      const cleanAlt = this.cleanGameName(alt.name);
      if (!cleanAlt) return false;
      const altWordCount = cleanAlt.split(/\s+/).filter(Boolean).length;
      if (altWordCount < 2) return false;

      const normalizedAlt = this.normalizeGameName(alt.name);
      return cleanTitle.includes(cleanAlt) || cleanAlt.includes(cleanTitle) ||
        normalizedTitle.includes(normalizedAlt) || normalizedAlt.includes(normalizedTitle);
    });
  }

  private isAllowedResidualWord(word: string): boolean {
    if (!word) return true;
    if (this.isCommonExtraWord(word)) return true;
    if (/^v?\d+(?:\.\d+)*$/i.test(word)) return true;
    if (/^\d{4}$/.test(word)) return true;
    if (/^build\d+$/i.test(word)) return true;

    const allowed = new Set([
      'pc', 'windows', 'win', 'linux', 'mac', 'macos',
      'steam', 'gog', 'epic',
      'x64', 'x86', '64bit', '32bit',
      'multi', 'multilang', 'multilanguage', 'english', 'eng', 'en',
      'russian', 'rus', 'ru', 'french', 'fr', 'german', 'de', 'spanish', 'es',
      'italian', 'it', 'portuguese', 'pt', 'polish', 'pl', 'japanese', 'jpn',
      'korean', 'kor', 'chinese', 'chs', 'cht',
      'setup', 'installer', 'portable', 'exe', 'msi', 'dmg', 'pkg', 'sh',
      'standard', 'gold', 'platinum', 'goty', 'repack', 'fitgirl', 'dodi',
      'build', 'version'
    ]);

    return allowed.has(word.toLowerCase());
  }

  /**
   * Enhanced matching algorithm using IGDB game data
   */
  public matchWithIGDB(title: string, options: EnhancedMatchOptions, description?: string): MatchResult {
    const { igdbGame, minMatchScore = 70 } = options; // Keep at 70 - fix description matching instead
    const reasons: string[] = [];
    let score = 0;
    const classification = this.classifyTitleTokens(title, options);

    const gameName = igdbGame.name;
    const releaseYear = igdbGame.first_release_date
      ? new Date(igdbGame.first_release_date * 1000).getFullYear()
      : undefined;

    const normalizedTitle = this.normalizeGameName(title);
    const normalizedGame = this.normalizeGameName(gameName);
    const cleanTitle = this.cleanGameName(title);
    const cleanGame = this.cleanGameName(gameName);

    const rejection = this.shouldRejectCandidate(title, options);
    if (rejection.rejected) {
      return { matches: false, score: 0, reasons: rejection.reasons };
    }


    // === NAME MATCHING ===

    // Exact match (case insensitive)
    if (cleanTitle === cleanGame) {
      score += 50;
      reasons.push('exact name match');
    }

    // Exact phrase match (game name appears as contiguous words in title)
    const gameNamePattern = new RegExp(`\\b${cleanGame.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const gameWordCount = cleanGame.split(/\s+/).length;

    if (gameNamePattern.test(cleanTitle)) {
      // For short names (1-2 words), be more strict - require the match to be significant
      // relative to the full title to avoid "Stray" matching "Stray Souls"
      if (gameWordCount <= 2) {
        const titleWordCount = cleanTitle.split(/\s+/).length;
        const matchRatio = gameWordCount / titleWordCount;

        if (matchRatio >= 0.5) {
          // Game name is at least 50% of the title - strong match
          score += 35;
          reasons.push('exact phrase in title');
        } else if (matchRatio >= 0.3) {
          // Game name is 30-50% of title - moderate match
          score += 20;
          reasons.push('phrase partially matches');
        } else {
          // Game name is <30% of title - weak match (might be different game)
          score += 10;
          reasons.push('phrase weakly matches');
        }
      } else {
        // For longer names (3+ words), exact phrase is strong signal
        score += 35;
        reasons.push('exact phrase in title');
      }
    }

    // Title contains full game name
    if (cleanTitle.includes(cleanGame)) {
      score += 25;
      reasons.push('title contains game name');
    }

    // Penalize partial matches for single-word titles (e.g., "Inside" vs "Insiders")
    if (gameWordCount == 1 && cleanTitle.includes(cleanGame)) {
      const wholeWordPattern = new RegExp(`\b${cleanGame.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\b`, 'i');
      if (!wholeWordPattern.test(cleanTitle)) {
        score -= 30;
        reasons.push('single-word partial match');
      }
    }

    // Extra bonus for very strong title match (almost exact)
    // This helps when description extraction fails (e.g., FitGirl page has no game description)
    if (cleanTitle.startsWith(cleanGame) || 
        cleanTitle.replace(/[^a-z0-9]/g, '').startsWith(cleanGame.replace(/[^a-z0-9]/g, ''))) {
      score += 10;
      reasons.push('strong title match');
    }

    // Handle prefixed titles like "Marvel's Spider-Man: Miles Morales" matching "Spider-Man Miles Morales"
    // When the title contains the full game name plus a publisher/brand prefix
    if (!cleanTitle.startsWith(cleanGame) && cleanTitle.includes(cleanGame)) {
      // Check if the game name appears after a common prefix pattern
      const prefixMatch = cleanTitle.match(new RegExp(`^(\\w+(?:'s)?)\\s+(${cleanGame.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})$`));
      if (prefixMatch) {
        score += 15;
        reasons.push('prefixed title match');
      }
    }

    // Handle colon-separated titles like "God of War: Ragnarök – Edition..."
    // where the game name is followed by a colon
    // Only apply if the part after the colon doesn't indicate a different game/sequel
    if (cleanTitle.includes(cleanGame + ':')) {
      // Check if the title has sequel indicators after the colon that don't match the game
      const afterColon = cleanTitle.split(cleanGame + ':')[1] || '';
      const sequelIndicators = ['ragnarok', 'ragnarök', '2', 'ii', 'iii', '3', 'part 2', 'part ii'];
      const hasDifferentSequel = sequelIndicators.some(ind => afterColon.toLowerCase().includes(ind));
      
      if (!hasDifferentSequel) {
        score += 25;
        reasons.push('title contains game name');
      }
    }

    // Handle case where title has "Game Name: Subtitle" format
    // and the game name is "Game Name Subtitle" (colon separates parts of the game name)
    // Example: "God of War: Ragnarök" should match "God of War Ragnarök"
    if (!cleanTitle.includes(cleanGame) && cleanTitle.includes(':')) {
      // Remove colon and check if that matches
      const titleWithoutColon = cleanTitle.replace(/:\s*/g, ' ').replace(/\s+/g, ' ').trim();
      if (titleWithoutColon.includes(cleanGame)) {
        score += 25;
        reasons.push('title contains game name');
      }
    }

    // Check alternative names from IGDB (e.g., "God of War: Ragnarok" for "God of War Ragnarök")
    // Only check if title is long enough to be meaningful (avoid false positives with short/spam titles)
    if (igdbGame.alternative_names && igdbGame.alternative_names.length > 0 && cleanTitle.length >= 10) {
      logger.info(`[Match] Checking ${igdbGame.alternative_names.length} alternative names for title: "${title}" (clean: "${cleanTitle}")`);
      const matchingAltName = igdbGame.alternative_names.find(alt => {
        const cleanAlt = this.cleanGameName(alt.name);
        const normalizedAlt = this.normalizeGameName(alt.name);
        const normalizedTitleCheck = this.normalizeGameName(title);
        logger.info(`[Match] Checking alt: "${alt.name}" -> clean: "${cleanAlt}"`);
        
        // Require at least 3 words in the alternative name to avoid partial matches
        const altWordCount = cleanAlt.split(/\s+/).filter(w => w.length > 0).length;
        if (altWordCount < 3) {
          logger.info(`[Match] Skipping alt (only ${altWordCount} words): "${alt.name}"`);
          return false;
        }
        
        const exactMatch = cleanTitle === cleanAlt;
        const titleIncludesAlt = cleanTitle.includes(cleanAlt);
        const altIncludesTitle = cleanAlt.includes(cleanTitle) && cleanTitle.split(/\s+/).filter(w => w.length > 0).length >= 3;
        const normalizedMatch = normalizedTitleCheck.includes(normalizedAlt) ||
               (normalizedAlt.includes(normalizedTitleCheck) && normalizedTitleCheck.split(/\s+/).filter(w => w.length > 0).length >= 3);
        
        logger.info(`[Match] exact=${exactMatch}, titleInc=${titleIncludesAlt}, altInc=${altIncludesTitle}, norm=${normalizedMatch}`);
        
        return exactMatch || titleIncludesAlt || altIncludesTitle || normalizedMatch;
      });
      
      if (matchingAltName) {
        score += 30;
        reasons.push('matches alternative title');
        logger.info(`[Match] ✓ Title "${title}" matches alternative name "${matchingAltName.name}"`);
      } else {
        logger.info(`[Match] ✗ No alternative name match found for "${title}"`);
      }
    } else {
      logger.info(`[Match] Skipping alt names check: hasAlts=${!!igdbGame.alternative_names}, count=${igdbGame.alternative_names?.length || 0}, titleLen=${cleanTitle.length}`);
    }

    if (options.editionTitles && options.editionTitles.length > 0) {
      const matchedEdition = options.editionTitles.find((edition) => {
        const cleanEdition = this.cleanGameName(edition);
        if (!cleanEdition || cleanEdition.length < 4) return false;
        const wordCount = cleanEdition.split(/\s+/).filter(Boolean).length;
        if (wordCount < 2) return false;
        return cleanTitle.includes(cleanEdition) ||
          this.normalizeGameName(title).includes(this.normalizeGameName(edition));
      });

      if (matchedEdition) {
        score += 20;
        reasons.push('matches edition title');
      }
    }
    
    // Also check if all game words appear consecutively in title (ignoring punctuation)
    // This helps with "God of War Ragnarok" matching "God of War: Ragnarök"
    if (gameWordCount >= 2 && !cleanTitle.includes(cleanGame)) {
      const titleWordsCheck = cleanTitle.split(/\s+/);
      const gameWordsCheck = cleanGame.split(/\s+/);
      for (let i = 0; i <= titleWordsCheck.length - gameWordsCheck.length; i++) {
        const slice = titleWordsCheck.slice(i, i + gameWordsCheck.length);
        if (slice.join(' ') === cleanGame) {
          // Double-check this isn't followed by sequel indicators
          const remainingWords = titleWordsCheck.slice(i + gameWordsCheck.length);
          const remainingText = remainingWords.join(' ').toLowerCase();
          const sequelIndicators = ['ragnarok', 'ragnarök', ':', '2', 'ii'];
          const hasSequelIndicator = sequelIndicators.some(ind => remainingText.startsWith(ind));
          
          if (!hasSequelIndicator) {
            score += 25;
            reasons.push('title contains game name');
          }
          break;
        }
      }
    }

    // Game name contains full title
    if (cleanGame.includes(cleanTitle) && cleanTitle.length > 5) {
      score += 20;
      reasons.push('game name contains title');
    }

    // Word-based matching
    const titleWords = cleanTitle.split(/\s+/).filter(w => w.length > 2);
    const gameWords = cleanGame.split(/\s+/).filter(w => w.length > 2);
    const editionQualifiers = this.getEditionQualifierTokens(cleanTitle);

    if (gameWords.length > 0) {
      const matchingWords = gameWords.filter(word =>
        titleWords.some(tw => tw === word || tw.includes(word) || word.includes(tw))
      );
      const wordMatchRatio = matchingWords.length / gameWords.length;

      if (wordMatchRatio >= 0.9) {
        score += 20;
        reasons.push('very high word match ratio');
      } else if (wordMatchRatio >= 0.7) {
        score += 15;
        reasons.push('high word match ratio');
      } else if (wordMatchRatio >= 0.5) {
        score += 8;
        reasons.push('moderate word match');
      }

      // Check for important keywords (main title words)
      const mainKeywords = gameWords.filter(w => w.length > 3);
      const hasAllMainKeywords = mainKeywords.every(kw =>
        titleWords.some(tw => tw.includes(kw) || kw.includes(tw))
      );
      if (hasAllMainKeywords && mainKeywords.length > 0) {
        score += 15;
        reasons.push('all main keywords present');
      }

      // Negative score for too many extra words (indicates different game)
      const extraWords = titleWords.filter(tw =>
        !gameWords.some(gw => tw.includes(gw) || gw.includes(tw))
      ).filter(w => w.length > 3 && !this.isCommonExtraWord(w) && !editionQualifiers.has(w));

      // Reduce penalty for extra words - repack titles naturally have edition/DLC text
      if (extraWords.length > gameWords.length * 2) {
        score -= 15;
        reasons.push('too many unrelated words');
      } else if (extraWords.length > gameWords.length * 1.5) {
        score -= 5;
        reasons.push('many extra words');
      }

      // Special handling for single-word game titles to avoid false positives
      // e.g., "Fable Hospital" should not match "Fable"
      if (gameWordCount === 1 && extraWords.length >= 1) {
        score -= 60;
        reasons.push('single-word title has extra words');
      }
    }

    // === SEQUEL/NUMBER MATCHING ===

    // Extract numbers from titles (for sequel matching)
    const titleForNumbers = title
      .replace(/\b(v|ver|version|build|bld)\s*\d+(?:\.\d+)*\b/gi, ' ')
      .replace(/\b\d{6,}\b/g, ' ');
    const titleNumbers = titleForNumbers.match(/\b(i{1,3}|iv|v|vi|vii|viii|ix|x|\d+)\b/gi) || [];
    const gameNumbers = gameName.match(/\b(i{1,3}|iv|v|vi|vii|viii|ix|x|\d+)\b/gi) || [];

    if (titleNumbers.length > 0 || gameNumbers.length > 0) {
      const hasMatchingNumber = titleNumbers.some(tn =>
        gameNumbers.some(gn => this.normalizeNumber(tn) === this.normalizeNumber(gn))
      );
      if (hasMatchingNumber) {
        score += 25;
        reasons.push('sequel number matches');
      } else if (gameNumbers.length > 0 && titleNumbers.length > 0) {
        // Penalize if both have numbers but they don't match
        score -= 25;
        reasons.push('different sequel number');
      } else if (titleNumbers.length > 0 && gameNumbers.length === 0) {
        // Penalize sequel number in title when base game has none
        // e.g., "Spelunky 2" should not match "Spelunky"
        score -= 30;
        reasons.push('title is numbered sequel');
      }
    }

    if (options.sequelPatterns) {
      const relatedMatches = this.getRelatedNameMatches(
        title,
        options.sequelPatterns,
        igdbGame.name
      );
      const relatedPatternHit = this.matchesSequelPattern(
        title,
        options.sequelPatterns
      );
      const isEditionVariant = this.isEditionVariant(title, igdbGame.name);

      if ((relatedMatches.length > 0 || relatedPatternHit) && !isEditionVariant) {
        const isMultiGame =
          relatedMatches.length > 1 || this.hasMultiGameJoiner(title);
        const penalty = isMultiGame ? 90 : 60;
        score -= penalty;
        reasons.push(
          isMultiGame
            ? 'related game bundle penalty'
            : 'matches related game pattern'
        );
      } else if (isEditionVariant) {
        score += 10;
        reasons.push('edition variant');
      }
    }

    // === YEAR MATCHING ===

    if (releaseYear) {
      const titleYear = this.extractYear(title);
      if (titleYear) {
        const yearDiff = Math.abs(titleYear - releaseYear);

        if (titleYear === releaseYear) {
          score += 20;
          reasons.push('release year matches');
        } else if (yearDiff <= 1) {
          score += 10;
          reasons.push('release year close');
        } else if (yearDiff <= 3) {
          // Small difference - might be delayed release/port
          score -= 5;
          reasons.push('release year slightly off');
        } else if (yearDiff <= 5) {
          // Moderate difference - probably different version
          score -= 25;
          reasons.push('release year mismatch');
        } else {
          // Large difference - very likely different game/version (e.g. remake vs original)
          score -= 40;
          reasons.push('release year major mismatch');
        }
      }
    }

    // === DESCRIPTION MATCHING ===
    // FitGirl often uses Steam descriptions
    // Prefer Steam description over IGDB summary for better matching
    if (description) {
      const referenceDescription = options.steamDescription || igdbGame.summary;

      if (referenceDescription) {
        const descScore = this.matchDescriptions(description, referenceDescription);
        const usingStream = !!options.steamDescription;

        // Detailed logging for debugging
        logger.info(`[Match] Description comparison:`);
        logger.info(`[Match]   Source: ${usingStream ? 'Steam' : 'IGDB'}`);
        logger.info(`[Match]   Reference length: ${referenceDescription.length} chars`);
        logger.info(`[Match]   FitGirl length: ${description.length} chars`);
        logger.info(`[Match]   Similarity score: ${(descScore * 100).toFixed(1)}%`);
        logger.info(`[Match]   Reference preview: ${referenceDescription.substring(0, 200)}...`);
        logger.info(`[Match]   FitGirl preview: ${description.substring(0, 200)}...`);

        if (descScore > 0.35) {
          score += 40;
          reasons.push(usingStream ? 'strong Steam description match' : 'strong description match');
        } else if (descScore > 0.20) {
          score += 25;
          reasons.push(usingStream ? 'good Steam description match' : 'good description similarity');
        } else if (descScore > 0.12) {
          score += 15;
          reasons.push('some description overlap');
        } else if (descScore > 0.06) {
          score += 8;
          reasons.push('minor description overlap');
        } else {
          // Very low description similarity (<6%) suggests different games
          // But only apply significant penalty when using Steam (reliable source)
          const penalty = usingStream ? 15 : 5;
          score -= penalty;
          reasons.push('description mismatch');
          logger.debug(`[Match] Description similarity low: ${(descScore * 100).toFixed(1)}%`);
        }
      }
    }

    // === PLATFORM MATCHING ===

    const platformKeywords = ['pc', 'windows', 'steam', 'gog', 'epic', 'xbox', 'playstation', 'ps4', 'ps5', 'switch', 'nintendo'];
    const titlePlatforms = platformKeywords.filter(p => normalizedTitle.includes(p));
    if (titlePlatforms.length > 0) {
      score += 5;
      reasons.push('platform info present');
    }

    const igdbPlatforms = this.getIGDBPlatforms(igdbGame);
    if (igdbPlatforms.size > 0) {
      const detector = new PlatformDetector();
      const detected = detector.detectPlatform(title);
      if (detected.platform !== 'Other' && !igdbPlatforms.has(detected.platform)) {
        const penalty = classification.hasEmulatorToken ? 5 : 20;
        score -= penalty;
        reasons.push(
          classification.hasEmulatorToken
            ? 'platform not in IGDB (emulator)'
            : 'platform not in IGDB'
        );
      }
    }

    // === NEGATIVE INDICATORS ===

    // Detect DLC-only releases
    // Look for DLC names/patterns but exclude "complete" editions that include all DLC
    const hasDLCIndicator = /\b(dlc|expansion|blood\s+and\s+wine|hearts\s+of\s+stone|season\s+pass)\b/i.test(cleanTitle);
    const hasCompleteIndicator = /\b(complete|goty|game\s+of\s+the\s+year|ultimate|all\s+dlc|all\s+expansions)\b/i.test(cleanTitle);

    if (hasDLCIndicator && !hasCompleteIndicator) {
      // This appears to be DLC-only, not the full game
      score -= 40;
      reasons.push('DLC/expansion only');
    }

    // Detect update/patch-only releases
    // Patterns like "Update 1.32", "Patch v4.0", "Hotfix", etc.
    const hasUpdatePattern = /\b(update|patch|hotfix)\s*(v?[\d.]+|from|to)\b/i.test(cleanTitle);
    const startsWithUpdate = /^(patch|update|dlc|hotfix)\b/i.test(cleanTitle);

    if (hasUpdatePattern || startsWithUpdate) {
      score -= 45;
      reasons.push('update/patch only');
    }

    // Penalize if title is too short relative to game name
    if (cleanTitle.length < cleanGame.length * 0.4) {
      score -= 15;
      reasons.push('title too short');
    }

    // === SIZE VALIDATION (if Steam size available) ===
    // Compare download size with Steam size to detect incomplete/suspicious releases
    if (options.steamSizeBytes) {
      let candidateSizeBytes: number | undefined;

      // First try to use sizeBytes from options (passed by caller)
      if (options.candidateSizeBytes && options.candidateSizeBytes > 0) {
        candidateSizeBytes = options.candidateSizeBytes;
      } else {
        // Fall back to extracting size from title
        const candidateSizeMatch = title.match(/(\d+\.?\d*)\s*(GB|MB|TB)/i);
        if (candidateSizeMatch) {
          const candidateValue = parseFloat(candidateSizeMatch[1]);
          const candidateUnit = candidateSizeMatch[2].toUpperCase();

          switch (candidateUnit) {
            case 'MB': candidateSizeBytes = candidateValue * 1024 * 1024; break;
            case 'GB': candidateSizeBytes = candidateValue * 1024 * 1024 * 1024; break;
            case 'TB': candidateSizeBytes = candidateValue * 1024 * 1024 * 1024 * 1024; break;
          }
        }
      }

      if (candidateSizeBytes && candidateSizeBytes > 0) {
        const sizeRatio = candidateSizeBytes / options.steamSizeBytes;
        const steamSizeGB = (options.steamSizeBytes / (1024 * 1024 * 1024)).toFixed(1);
        const candidateSizeGB = (candidateSizeBytes / (1024 * 1024 * 1024)).toFixed(2);

        logger.debug(`[Match] Size comparison: ${candidateSizeGB} GB vs Steam ${steamSizeGB} GB (ratio: ${sizeRatio.toFixed(4)})`);

        // Size validation logic:
        // - Repacks (FitGirl/DODI) are compressed: typically 20-70% of Steam size (PREFERRED)
        // - Scene/P2P releases: typically 80-110% of Steam size (full game, slightly compressed)
        // - Anything < 1% is likely a manual/patch/soundtrack (HEAVILY PENALIZED)
        // - Anything < 15% is likely DLC only or incomplete
        // - Anything > 130% might be bloated or include extras

        if (sizeRatio < 0.01) {
          // Extremely small - almost certainly not the game (manual, patch notes, etc.)
          score -= 100;
          reasons.push(`not a game (${(sizeRatio * 100).toFixed(2)}% of Steam - likely manual/extra)`);
        } else if (sizeRatio < 0.05) {
          // Way too small - likely soundtrack, manual, or small DLC
          score -= 80;
          reasons.push(`far too small (${(sizeRatio * 100).toFixed(1)}% of Steam)`);
        } else if (sizeRatio < 0.15) {
          // Too small - likely DLC only or incomplete
          score -= 50;
          reasons.push(`size too small (${(sizeRatio * 100).toFixed(0)}% of Steam)`);
        } else if (sizeRatio < 0.20) {
          // Suspiciously small but might be heavily compressed
          score -= 20;
          reasons.push(`size very small (${(sizeRatio * 100).toFixed(0)}% of Steam)`);
        } else if (sizeRatio >= 0.20 && sizeRatio <= 0.70) {
          // Ideal repack size (well compressed) - MOST PREFERRED
          score += 20;
          reasons.push(`excellent repack size (${(sizeRatio * 100).toFixed(0)}% of Steam)`);
        } else if (sizeRatio > 0.70 && sizeRatio <= 0.85) {
          // Good repack or lightly compressed
          score += 12;
          reasons.push(`good compressed size (${(sizeRatio * 100).toFixed(0)}% of Steam)`);
        } else if (sizeRatio > 0.85 && sizeRatio <= 1.10) {
          // Close to Steam size (full game, minimal compression)
          score += 5;
          reasons.push(`full size (${(sizeRatio * 100).toFixed(0)}% of Steam)`);
        } else if (sizeRatio > 1.10 && sizeRatio <= 1.30) {
          // Slightly larger than Steam (includes updates/extras)
          score -= 5;
          reasons.push(`larger than Steam (${(sizeRatio * 100).toFixed(0)}%)`);
        } else if (sizeRatio > 1.30) {
          // Suspiciously large - bloat or multi-version pack
          score -= 20;
          reasons.push(`size very large (${(sizeRatio * 100).toFixed(0)}% of Steam)`);
        }
      } else {
        // No size information available but we have Steam size - suspicious
        score -= 10;
        reasons.push('no size info available');
      }
    }

    // Ensure score is within bounds (allow exceeding 100 for exceptional matches)
    // Cap at 150 to keep scores reasonable
    score = Math.max(0, Math.min(150, score));

    return {
      matches: score >= minMatchScore,
      score,
      reasons,
    };
  }

  /**
   * Check if a word is commonly found in game titles (editions, versions, etc.)
   */
  private isCommonExtraWord(word: string): boolean {
    const commonWords = [
      // Editions
      'edition', 'repack', 'goty', 'complete', 'deluxe', 'ultimate', 'enhanced',
      'remastered', 'definitive', 'anniversary', 'gold', 'platinum', 'collection',
      'collector', 'collectors', 'limited', 'special', 'digital', 'director',
      'directors', 'cut', 'twin', 'plus',
      // DLC and content
      'dlc', 'dlcs', 'all', 'bonus', 'content', 'pack', 'bundle',
      // Versions
      'v', 'version', 'update', 'patch', 'build', 'release',
      // Media
      'ost', 'soundtrack', 'artbook', 'manual', 'guide',
      // Technical
      'fix', 'crack', 'bypass', 'windows', 'steam', 'gog', 'epic',
      'emu', 'emulator', 'emulators', 'yuzu', 'ryujinx', 'rpcs3', 'xenia',
      'suyu', 'citra', 'dolphin',
      // Numbers and codes (version numbers, build numbers)
      // These are handled separately by checking if word is all digits or version pattern
    ];

    const lower = word.toLowerCase();

    // Check if it's in the common words list
    if (commonWords.includes(lower)) return true;

    // Check if it's a number (version number, build number, etc.)
    if (/^\d+$/.test(word)) return true;

    // Check if it's a version pattern (v1.0, 1.0.12, etc.)
    if (/^v?\d+(\.\d+)*$/.test(lower)) return true;

    return false;
  }

  protected matchesSequelPattern(title: string, patterns: SequelPatterns): boolean {
    const lower = title.toLowerCase();

    for (const exactName of patterns.exactNames) {
      if (lower.includes(exactName)) {
        return true;
      }
    }

    for (const pattern of patterns.namePatterns) {
      if (pattern.test(title)) {
        return true;
      }
    }

    return false;
  }

  private getRelatedNameMatches(
    title: string,
    patterns: SequelPatterns,
    gameName: string
  ): string[] {
    const lower = title.toLowerCase();
    const normalizedTitle = this.normalizeGameName(title);
    const baseName = this.normalizeGameName(gameName);
    const matches: string[] = [];

    for (const exactName of patterns.exactNames) {
      const normalizedExact = this.normalizeGameName(exactName);
      if (!normalizedExact || normalizedExact === baseName) continue;
      if (lower.includes(exactName) || normalizedTitle.includes(normalizedExact)) {
        matches.push(exactName);
      }
    }

    return [...new Set(matches)];
  }

  private hasMultiGameJoiner(title: string): boolean {
    const rawLower = title.toLowerCase();
    return /(\d+\s*\+\s*\d+|\bduology\b|\btrilogy\b|\banthology\b|\bcollection\b|\bbundle\b)/i.test(rawLower) ||
      /\s[+&]\s/.test(rawLower);
  }

  protected isEditionVariant(title: string, gameName: string): boolean {
    const normalizedTitle = this.normalizeGameName(title);
    const normalizedGame = this.normalizeGameName(gameName);
    if (!normalizedTitle.includes(normalizedGame)) return false;

    const remainder = normalizedTitle.replace(normalizedGame, ' ').trim();
    if (!remainder) return false;

    const tokens = remainder.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;

    const allowed = new Set([
      'edition',
      'complete',
      'definitive',
      'ultimate',
      'deluxe',
      'enhanced',
      'remastered',
      'remaster',
      'director',
      'directors',
      'cut',
      'digital',
      'premium',
      'standard',
      'gold',
      'platinum',
      'goty',
      'game',
      'year',
      'collection',
      'bundle',
      'pack',
      'collector',
      'collectors',
      'limited',
      'special',
      'twin',
      'plus',
      'anniversary',
      'final',
      'extended',
      'complete',
      'edition',
    ]);
    const editionQualifiers = this.getEditionQualifierTokens(normalizedTitle);

    return tokens.every((token) => {
      if (allowed.has(token)) return true;
      if (editionQualifiers.has(token)) return true;
      if (this.isCommonExtraWord(token)) return true;
      if (/^v?\d+(\.\d+)*$/.test(token)) return true;
      if (/^build\d+$/i.test(token)) return true;
      if (/^(i{1,3}|iv|v|vi|vii|viii|ix|x|xi|xii)$/.test(token)) return false;
      if (/^\d+$/.test(token)) return false;
      return false;
    });
  }

  protected getEditionQualifierTokens(title: string): Set<string> {
    const normalized = this.normalizeGameName(title);
    const words = normalized.split(/\s+/).filter(Boolean);
    const qualifiers = new Set<string>();
    const markers = new Set(['edition', 'cut', 'pack']);
    const stop = new Set(['the', 'of', 'and', 'for', 'a', 'an']);

    for (let i = 0; i < words.length; i += 1) {
      if (!markers.has(words[i])) continue;
      for (let j = 1; j <= 2; j += 1) {
        const idx = i - j;
        if (idx < 0) break;
        const token = words[idx];
        if (token.length <= 2 || stop.has(token)) continue;
        qualifiers.add(token);
      }
    }

    return qualifiers;
  }

  /**
   * Normalize sequel numbers (e.g., "III" -> "3", "V" -> "5")
   */
  private normalizeNumber(num: string): string {
    const romanMap: { [key: string]: string } = {
      'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
      'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'
    };
    return romanMap[num.toLowerCase()] || num;
  }

  /**
   * Compare two descriptions for similarity
   * Uses multiple techniques for robust matching
   */
  private matchDescriptions(desc1: string, desc2: string): number {
    if (!desc1 || !desc2) return 0;

    const clean1 = desc1.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
    const clean2 = desc2.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');

    // Common stop words to filter out
    const stopWords = new Set(['the', 'and', 'for', 'with', 'you', 'your', 'this', 'that', 'from', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'will', 'can', 'may']);

    // Extract meaningful words (length > 3, not stop words)
    const words1 = clean1.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
    const words2 = clean2.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));

    if (words1.length === 0 || words2.length === 0) return 0;

    // 1. Word-level Jaccard similarity
    const wordSet1 = new Set(words1);
    const wordSet2 = new Set(words2);
    const wordIntersection = new Set([...wordSet1].filter(w => wordSet2.has(w)));
    const wordUnion = new Set([...wordSet1, ...wordSet2]);
    const jaccardScore = wordIntersection.size / wordUnion.size;

    // Also calculate containment score (how much of the smaller set is in the larger)
    const smallerSet = wordSet1.size < wordSet2.size ? wordSet1 : wordSet2;
    const containmentScore = wordIntersection.size / smallerSet.size;

    // 2. Bigram similarity (2-word phrases)
    const bigrams1 = this.extractNgrams(words1, 2);
    const bigrams2 = this.extractNgrams(words2, 2);
    const bigramIntersection = new Set([...bigrams1].filter(b => bigrams2.has(b)));
    const bigramScore = bigrams1.size > 0 && bigrams2.size > 0
      ? bigramIntersection.size / Math.max(bigrams1.size, bigrams2.size)
      : 0;

    // 3. Trigram similarity (3-word phrases)
    const trigrams1 = this.extractNgrams(words1, 3);
    const trigrams2 = this.extractNgrams(words2, 3);
    const trigramIntersection = new Set([...trigrams1].filter(t => trigrams2.has(t)));
    const trigramScore = trigrams1.size > 0 && trigrams2.size > 0
      ? trigramIntersection.size / Math.max(trigrams1.size, trigrams2.size)
      : 0;

    // Use the better of Jaccard (strict) or containment (lenient for subset matches)
    const wordScore = Math.max(jaccardScore, containmentScore);

    // Weighted combination: trigrams are most important, then bigrams, then words
    const combinedScore = (trigramScore * 0.5) + (bigramScore * 0.3) + (wordScore * 0.2);

    return combinedScore;
  }

  /**
   * Extract n-grams from word array
   */
  private extractNgrams(words: string[], n: number): Set<string> {
    const ngrams = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) {
      const ngram = words.slice(i, i + n).join(' ');
      ngrams.add(ngram);
    }
    return ngrams;
  }

  /**
   * Legacy basic matching (for backward compatibility)
   */
  protected isMatch(title: string, gameName: string): boolean {
    const normalizedTitle = this.normalizeGameName(title);
    const normalizedGame = this.normalizeGameName(gameName);
    
    // Direct inclusion check
    if (normalizedTitle.includes(normalizedGame)) return true;
    if (normalizedGame.includes(normalizedTitle)) return true;
    
    // Word-based matching (at least 70% of words match)
    const titleWords = normalizedTitle.split(' ').filter(w => w.length > 2);
    const gameWords = normalizedGame.split(' ').filter(w => w.length > 2);
    
    if (titleWords.length === 0 || gameWords.length === 0) return false;
    
    const matches = gameWords.filter(word => titleWords.includes(word)).length;
    return (matches / gameWords.length) >= 0.7;
  }

  /**
   * Detect release type from title
   */
  protected detectReleaseType(title: string): 'repack' | 'rip' | 'scene' | 'unknown' {
    const lower = title.toLowerCase();
    
    if (lower.includes('repack') || lower.includes('fitgirl') || lower.includes('dodi') || lower.includes('kaos')) {
      return 'repack';
    }
    if (lower.includes('rip') || lower.includes('steamrip') || lower.includes('gog')) {
      return 'rip';
    }
    if (/\b(codex|cpy|skidrow|plaza|hoodlum|razor1911|flt|tenoke|runne)\b/.test(lower)) {
      return 'scene';
    }
    
    return 'unknown';
  }

  /**
   * Extract size from text
   */
  protected extractSize(text: string): { size: string; bytes?: number } | undefined {
    const match = text.match(/(\d+\.?\d*)\s*(GB|MB|TB|gb|mb|tb)/i);
    if (!match) return undefined;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    let bytes: number;
    switch (unit) {
      case 'MB': bytes = value * 1024 * 1024; break;
      case 'GB': bytes = value * 1024 * 1024 * 1024; break;
      case 'TB': bytes = value * 1024 * 1024 * 1024 * 1024; break;
      default: bytes = 0;
    }
    
    return { size: `${value} ${unit}`, bytes };
  }
}






