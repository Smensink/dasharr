export type DiscoverMediaType = 'movie' | 'series';

export interface DiscoverMediaItem {
  id: string;
  mediaType: DiscoverMediaType;
  title: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  releaseDate?: string;
  imdbId?: string;
  tmdbId?: number;
  tvdbId?: number;
  traktId?: number;
  inLibrary?: boolean;
  libraryService?: 'radarr' | 'sonarr';
  awardNote?: string;
  awardYear?: number;
  awardSource?: string;
  awardResult?: 'winner' | 'nominee';
  awardCategories?: string[];
  rating?: {
    imdb?: {
      value?: number;
      votes?: number;
    };
  };
  source: {
    provider: 'tmdb' | 'trakt';
    id?: number | string;
  };
}

export interface DiscoverSection {
  key: string;
  title: string;
  description?: string;
  mediaType?: DiscoverMediaType | 'all';
  items: DiscoverMediaItem[];
}

export interface DiscoverSectionsResponse {
  generatedAt: string;
  configHash?: string;
  cacheVersion?: number;
  sections: DiscoverSection[];
}
