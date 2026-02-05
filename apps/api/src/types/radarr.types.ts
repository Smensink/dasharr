export interface RadarrMovie {
  id: number;
  title: string;
  originalTitle?: string;
  year: number;
  runtime: number;
  overview?: string;
  imdbId?: string;
  tmdbId: number;
  path?: string;
  rootFolderPath?: string;
  monitored: boolean;
  hasFile: boolean;
  isAvailable: boolean;
  qualityProfileId: number;
  sizeOnDisk?: number;
  status: string;
  images?: RadarrImage[];
  ratings?: {
    imdb?: { value: number };
    tmdb?: { value: number };
    rottenTomatoes?: { value: number };
  };
  genres?: string[];
  tags?: number[];
  added?: string;
  minimumAvailability?: string;
}

export interface RadarrImage {
  coverType: 'poster' | 'fanart' | 'banner';
  url?: string;
  remoteUrl?: string;
}

export interface AddRadarrMovieRequest {
  title: string;
  tmdbId: number;
  year: number;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  minimumAvailability?: 'announced' | 'inCinemas' | 'released' | 'preDB';
  addOptions?: {
    searchForMovie?: boolean;
  };
}

export interface UpdateRadarrMovieRequest {
  monitored?: boolean;
  qualityProfileId?: number;
  minimumAvailability?: string;
  tags?: number[];
}
