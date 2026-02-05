/**
 * Platform Detection Utility
 * 
 * Detects game platform from release titles and scores them based on preference.
 * Prioritizes PC releases by default but allows platform selection.
 */

export type GamePlatform = 'PC' | 'PS4' | 'PS5' | 'Xbox' | 'Xbox360' | 'Switch' | 'Wii' | 'WiiU' | 'PS3' | 'PSVita' | 'Other';

export interface PlatformMatch {
  platform: GamePlatform;
  confidence: 'high' | 'medium' | 'low';
  source: 'category' | 'title' | 'inferred';
}

// Platform preference order (default)
export const DEFAULT_PLATFORM_PRIORITY: GamePlatform[] = [
  'PC', 'PS5', 'Xbox', 'PS4', 'Switch', 'Xbox360', 'PS3', 'WiiU', 'Wii', 'PSVita', 'Other'
];

// Platform detection patterns
const PLATFORM_PATTERNS: Record<GamePlatform, RegExp[]> = {
  PC: [
    /\b(pc|windows|win\b|steam|gog|epic\s*games?)\b/i,
    /\b(x64|x86|win64|win32)\b/i,
    /\b(codex|cpy|skidrow|plaza|hoodlum|flt|tenoke|dino|elamigos|kaos)\b/i,
    /\b(fitgirl|dodi|repack)\b/i,
    /\b(goldberg|onlinefix)\b/i, // Common PC-only groups
  ],
  PS5: [
    /\b(ps5|playstation\s*5|ps\s*5)\b/i,
    /\bCUSA\d{5}\b/i, // PS4/PS5 title IDs
    /\bPPSA\d{5}\b/i, // PS5 title IDs
  ],
  PS4: [
    /\b(ps4|playstation\s*4|ps\s*4)\b/i,
    /\bCUSA\d{5}\b/i, // PS4 title IDs
    /\\.ps4\-/i, // Scene release pattern
  ],
  PS3: [
    /\b(ps3|playstation\s*3)\b/i,
    /\bBL[UE]S\d{5}\b/i, // PS3 title IDs
    /\bNPUB\d{5}\b/i, // PS3 PSN IDs
    /\bNP\w{4}\d{5}\b/i,
  ],
  Xbox: [
    /\b(xbox\s*(one|series)\b)\b/i,
    /\b(xbone)\b/i,
  ],
  Xbox360: [
    /\b(xbox\s*360|xb360|x360)\b/i,
  ],
  Switch: [
    /\b(switch|nintendo\s*switch|nsw)\b/i,
    /\b0100[0-9A-F]{12}\b/i, // Switch title IDs
    /\[0100[0-9A-F]{8}\d{4}\d{4}\]/i,
  ],
  Wii: [
    /\b(wii\b(?!\s*u)|wii\s*game)\b/i,
    /\bR[A-Z]{2}[A-Z]\d{2}\b/i, // Wii title IDs
  ],
  WiiU: [
    /\b(wii\s*u)\b/i,
    /\bWUP-[A-Z]\w{3}\b/i,
  ],
  PSVita: [
    /\b(ps\s*vita|psvita\b|vita\b|psv\b)\b/i,
    /\bPCS[ABER]\d{5}\b/i, // Vita title IDs
  ],
  Other: [
    // Catch-all for unrecognized platforms
  ],
};

// Category ID to platform mapping (Torznab/Newznab categories)
const CATEGORY_PLATFORM_MAP: Record<number, GamePlatform> = {
  // PC Games
  4050: 'PC', // PC/Games
  4000: 'PC', // PC
  // Console
  1000: 'Other', // Console (generic)
  1010: 'Xbox360', // Console/Xbox 360
  1020: 'Other', // Console/DS (legacy)
  1030: 'Other', // Console/PSP (legacy)
  1040: 'Xbox', // Console/XBox
  1050: 'Xbox360', // Console/XBox 360
  1060: 'Wii', // Console/Wii
  1070: 'Other', // Console/PS2 (legacy)
  1080: 'PS3', // Console/PS3
  1090: 'Other', // Console/Other
  1110: 'Xbox360', // Console/XBox 360 DLC
  1120: 'Other', // Console/PS3 DLC
  1130: 'Other', // Console/PS Vita
  1140: 'Xbox', // Console/Xbox One
  1150: 'PS4', // Console/PS4
  1160: 'Switch', // Console/Switch
  1170: 'Other', // Console/3DS
  1180: 'PSVita', // Console/PS Vita
  1190: 'WiiU', // Console/WiiU
};

export class PlatformDetector {
  private platformPriority: GamePlatform[];

  constructor(preferredPlatform?: GamePlatform) {
    // If a specific platform is preferred, put it first
    if (preferredPlatform && preferredPlatform !== 'PC') {
      this.platformPriority = [
        preferredPlatform,
        ...DEFAULT_PLATFORM_PRIORITY.filter(p => p !== preferredPlatform)
      ];
    } else {
      this.platformPriority = [...DEFAULT_PLATFORM_PRIORITY];
    }
  }

  /**
   * Detect platform from release title and/or category
   * 
   * Priority:
   * 1. Title patterns (specific keywords like "Nintendo Switch", "PS4", "CUSA")
   * 2. Category mapping (for clear category matches)
   * 3. Inferred from scene groups/repackers
   */
  detectPlatform(title: string, categoryId?: number): PlatformMatch {
    const lowerTitle = title.toLowerCase();
    
    // PRIORITY 1: Check title for specific platform indicators BEFORE category
    // This fixes "Nintendo Switch" being tagged as Xbox360 due to category
    
    // Check for explicit platform names in title (including NSW tag for Switch)
    if (/\b(nintendo\s*switch|switch\s*game|nsw)\b/i.test(title) || /\b0100[0-9A-F]{12}\b/i.test(title)) {
      return { platform: 'Switch', confidence: 'high', source: 'title' };
    }
    
    // PS5 patterns (check before PS4)
    if (/\b(ps5|playstation\s*5)\b/i.test(title) || /\bPPSA\d{5}\b/i.test(title)) {
      return { platform: 'PS5', confidence: 'high', source: 'title' };
    }
    
    // PS4 patterns (check before PS3)
    if (/\b(ps4|playstation\s*4)\b/i.test(title) || /\bCUSA\d{5}\b/i.test(title)) {
      return { platform: 'PS4', confidence: 'high', source: 'title' };
    }
    
    // Xbox Series/One (check before Xbox 360)
    if (/\b(xbox\s*(one|series))\b/i.test(title)) {
      return { platform: 'Xbox', confidence: 'high', source: 'title' };
    }
    
    // PRIORITY 2: Check category for remaining platforms
    // Only use category if it gives us a specific platform (not 'Other')
    // This allows title patterns in PRIORITY 3 to detect PS3, Xbox 360, etc.
    if (categoryId && CATEGORY_PLATFORM_MAP[categoryId]) {
      const platform = CATEGORY_PLATFORM_MAP[categoryId];
      if (platform !== 'Other') {
        return {
          platform,
          confidence: 'high',
          source: 'category'
        };
      }
      // If category maps to 'Other', continue to check title patterns
    }

    // PRIORITY 3: Check title patterns for remaining platforms
    for (const platform of this.platformPriority) {
      // Skip already checked platforms
      if (['Switch', 'PS5', 'PS4', 'Xbox'].includes(platform)) continue;
      
      const patterns = PLATFORM_PATTERNS[platform];
      for (const pattern of patterns) {
        if (pattern.test(title)) {
          return {
            platform,
            confidence: 'high',
            source: 'title'
          };
        }
      }
    }

    // PRIORITY 4: Repackers are ALWAYS PC
    if (/\b(FitGirl|DODI)\b/i.test(title)) {
      return {
        platform: 'PC',
        confidence: 'high',
        source: 'title'
      };
    }

    // Scene groups without platform indicators = PC
    if (/\b(CODEX|CPY|SKIDROW|PLAZA|FLT|TENOKE|RAZOR1911|ELAMIGOS|KAOS)\b/i.test(title)) {
      return {
        platform: 'PC',
        confidence: 'medium',
        source: 'inferred'
      };
    }

    // Default to PC for unknown
    return {
      platform: 'PC',
      confidence: 'low',
      source: 'inferred'
    };
  }

  /**
   * Calculate platform preference score (0-100)
   * Higher score = more preferred platform
   */
  getPlatformScore(platform: GamePlatform): number {
    const index = this.platformPriority.indexOf(platform);
    if (index === -1) return 0;
    
    // First priority = 100, second = 90, etc.
    return Math.max(0, 100 - (index * 10));
  }

  /**
   * Check if a release should be filtered out based on platform
   * Returns true if the release should be kept
   */
  shouldIncludeRelease(platform: GamePlatform, strictMode: boolean = false): boolean {
    // In strict mode, only include the top priority platform
    if (strictMode) {
      return platform === this.platformPriority[0];
    }
    
    // Otherwise include all platforms but score them differently
    return true;
  }

  /**
   * Get platform display name
   */
  getPlatformDisplayName(platform: GamePlatform): string {
    const displayNames: Record<GamePlatform, string> = {
      PC: 'PC (Windows)',
      PS5: 'PlayStation 5',
      PS4: 'PlayStation 4',
      PS3: 'PlayStation 3',
      Xbox: 'Xbox One/Series',
      Xbox360: 'Xbox 360',
      Switch: 'Nintendo Switch',
      Wii: 'Nintendo Wii',
      WiiU: 'Nintendo Wii U',
      PSVita: 'PS Vita',
      Other: 'Other Platform',
    };
    return displayNames[platform] || platform;
  }

  /**
   * Get all available platforms
   */
  getAvailablePlatforms(): { value: GamePlatform; label: string }[] {
    return this.platformPriority.map(platform => ({
      value: platform,
      label: this.getPlatformDisplayName(platform)
    }));
  }
}

// Export singleton factory
export function createPlatformDetector(preferredPlatform?: GamePlatform): PlatformDetector {
  return new PlatformDetector(preferredPlatform);
}
