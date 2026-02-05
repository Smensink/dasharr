/**
 * Hydra Library Types
 * Types for the Hydra Launcher library wiki sources
 * https://library.hydra.wiki/sources
 */

export type HydraSourceTrustLevel =
  | 'trusted'
  | 'safe'
  | 'abandoned'
  | 'unsafe'
  | 'nsfw';

export interface HydraSource {
  id: string;
  name: string;
  url: string;
  trustLevel: HydraSourceTrustLevel;
  description?: string;
  author?: string;
  version?: string;
  gameCount?: number;
  lastUpdated?: string;
  enabled?: boolean;
}

export interface HydraRepackEntry {
  title: string;
  fileSize: string | null;
  uris: string[];
  uploadDate: string | null;
}

export interface HydraLibraryData {
  games: Record<string, HydraRepackEntry[]>;
  lastUpdated?: string;
  sourceName?: string;
  sourceId?: string;
}

export interface HydraSearchSettings {
  /** Enable Hydra library search instead of manual search */
  enabled: boolean;
  /** List of enabled source IDs to search */
  enabledSources: string[];
  /** Trust levels to include in search */
  allowedTrustLevels: HydraSourceTrustLevel[];
  /** Cache duration in minutes */
  cacheDurationMinutes: number;
  /** Maximum results per source */
  maxResultsPerSource: number;
}

export const DEFAULT_HYDRA_SEARCH_SETTINGS: HydraSearchSettings = {
  enabled: false,
  enabledSources: [],
  allowedTrustLevels: ['trusted', 'safe'],
  cacheDurationMinutes: 60,
  maxResultsPerSource: 10,
};

export const HYDRA_TRUST_LEVEL_INFO: Record<
  HydraSourceTrustLevel,
  { label: string; description: string; color: string }
> = {
  trusted: {
    label: 'Trusted',
    description: 'Verified and trusted sources with good reputation',
    color: '#22c55e', // green-500
  },
  safe: {
    label: 'Safe For Use',
    description: 'Safe to use, but exercise normal caution',
    color: '#3b82f6', // blue-500
  },
  abandoned: {
    label: 'Abandoned',
    description: 'No longer maintained, but may still work',
    color: '#f59e0b', // amber-500
  },
  unsafe: {
    label: 'Use At Your Own Risk',
    description: 'Potential security risks - use with caution',
    color: '#ef4444', // red-500
  },
  nsfw: {
    label: 'NSFW',
    description: 'Contains adult content',
    color: '#a855f7', // purple-500
  },
};
