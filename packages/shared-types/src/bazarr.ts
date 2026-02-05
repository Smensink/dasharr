export interface BazarrSubtitleStatus {
  id: number;
  seriesId?: number;
  status: 'available' | 'missing' | 'unknown';
  available: boolean | null;
  missingCount?: number;
  languages?: string[];
  missingLanguages?: string[];
}

export interface BazarrSeriesSubtitleSummary {
  seriesId: number;
  total: number;
  available: number;
  missing: number;
  unknown: number;
  languages?: string[];
  missingLanguages?: string[];
}
