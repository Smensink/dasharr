import axios from 'axios';
import { logger } from './logger';

/**
 * Steam Store API response type
 */
interface SteamAppDetailsResponse {
  [appId: string]: {
    success: boolean;
    data?: {
      name: string;
      detailed_description?: string;
      about_the_game?: string;
      short_description?: string;
      pc_requirements?: {
        minimum?: string;
        recommended?: string;
      };
    };
  };
}

/**
 * Extract Steam App ID from URL
 */
export function extractSteamAppId(url: string): number | null {
  const match = url.match(/store\.steampowered\.com\/app\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Get Steam App ID from IGDB websites array
 */
export function getSteamAppId(websites?: Array<{ url: string; category: number }>): number | null {
  if (!websites) return null;

  // Category 13 is Steam in IGDB
  const steamSite = websites.find(w => w.category === 13);
  if (!steamSite) return null;

  return extractSteamAppId(steamSite.url);
}

/**
 * Fetch Steam game description via Store API
 * Uses the Steam Store API instead of HTML scraping to get full descriptions
 * (Steam HTML pages truncate content behind "Read more" buttons)
 */
export async function fetchSteamDescription(appId: number): Promise<string | null> {
  try {
    logger.info(`[Steam] Fetching description via API for app ${appId}`);

    // Use Steam Store API for full description
    // This returns complete description unlike HTML pages which truncate
    const response = await axios.get<SteamAppDetailsResponse>(
      'https://store.steampowered.com/api/appdetails',
      {
        params: { appids: appId },
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }
    );

    const appData = response.data[appId.toString()];

    if (!appData?.success || !appData.data) {
      logger.warn(`[Steam] API returned no data for app ${appId}`);
      return null;
    }

    // Try multiple description fields in order of preference
    // detailed_description is usually the most complete
    const description =
      appData.data.detailed_description ||
      appData.data.about_the_game ||
      appData.data.short_description;

    if (!description) {
      logger.warn(`[Steam] No description found in API response for app ${appId}`);
      return null;
    }

    // Clean up the description
    const cleanedDescription = description
      // Remove HTML tags
      .replace(/<[^>]+>/g, ' ')
      // Remove "About This Game" header
      .replace(/^About This Game\s*/i, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();

    logger.info(
      `[Steam] API success for app ${appId}: ${cleanedDescription.length} chars (raw: ${description.length})`
    );
    logger.info(`[Steam] Preview: ${cleanedDescription.substring(0, 200)}...`);

    return cleanedDescription;
  } catch (error) {
    logger.error(`[Steam] API error for app ${appId}:`, error);
    return null;
  }
}

/**
 * Get Steam description from IGDB game data
 */
export async function getSteamDescriptionFromIGDB(igdbGame: any): Promise<string | null> {
  const steamAppId = getSteamAppId(igdbGame.websites);

  if (!steamAppId) {
    logger.debug(`[Steam] No Steam app ID found for ${igdbGame.name}`);
    return null;
  }

  return fetchSteamDescription(steamAppId);
}

/**
 * Extract storage size from Steam requirements text
 * Looks for patterns like "100 GB available space" or "Storage: 150 GB"
 */
function extractSizeFromRequirements(requirementsText: string): number | null {
  // Remove HTML tags
  const cleanText = requirementsText.replace(/<[^>]+>/g, ' ');

  // Common patterns for storage requirements
  const patterns = [
    /(\d+\.?\d*)\s*GB\s+(?:available\s+)?(?:space|storage)/i,
    /(?:storage|disk\s+space|hard\s+disk):\s*(\d+\.?\d*)\s*GB/i,
    /(\d+\.?\d*)\s*GB\s+free\s+(?:disk\s+)?space/i,
  ];

  for (const pattern of patterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const sizeGB = parseFloat(match[1]);
      if (sizeGB > 0 && sizeGB < 1000) { // Sanity check
        logger.info(`[Steam] Extracted size: ${sizeGB} GB from requirements`);
        return sizeGB * 1024 * 1024 * 1024; // Convert to bytes
      }
    }
  }

  return null;
}

/**
 * Fetch Steam game size from Store API
 */
export async function fetchSteamSize(appId: number): Promise<number | null> {
  try {
    logger.info(`[Steam] Fetching size for app ${appId}`);

    const response = await axios.get<SteamAppDetailsResponse>(
      'https://store.steampowered.com/api/appdetails',
      {
        params: { appids: appId },
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }
    );

    const appData = response.data[appId.toString()];

    if (!appData?.success || !appData.data) {
      logger.warn(`[Steam] API returned no data for app ${appId}`);
      return null;
    }

    // Try to extract from recommended requirements first (usually more accurate)
    if (appData.data.pc_requirements?.recommended) {
      const size = extractSizeFromRequirements(appData.data.pc_requirements.recommended);
      if (size) return size;
    }

    // Fall back to minimum requirements
    if (appData.data.pc_requirements?.minimum) {
      const size = extractSizeFromRequirements(appData.data.pc_requirements.minimum);
      if (size) return size;
    }

    logger.warn(`[Steam] Could not extract size from requirements for app ${appId}`);
    return null;
  } catch (error) {
    logger.error(`[Steam] Error fetching size for app ${appId}:`, error);
    return null;
  }
}

/**
 * Get Steam size from IGDB game data
 */
export async function getSteamSizeFromIGDB(igdbGame: any): Promise<number | null> {
  const steamAppId = getSteamAppId(igdbGame.websites);

  if (!steamAppId) {
    logger.debug(`[Steam] No Steam app ID found for ${igdbGame.name}`);
    return null;
  }

  return fetchSteamSize(steamAppId);
}
