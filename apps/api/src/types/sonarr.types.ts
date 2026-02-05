export interface SonarrSeries {
  id: number;
  title: string;
  year: number;
  tvdbId: number;
  imdbId?: string;
  overview?: string;
  path?: string;
  rootFolderPath?: string;
  monitored: boolean;
  seasonCount: number;
  episodeCount: number;
  episodeFileCount: number;
  status: string;
  qualityProfileId: number;
  images?: SonarrImage[];
  ratings?: {
    value: number;
  };
  genres?: string[];
  tags?: number[];
  added?: string;
  seasons?: SonarrSeason[];
  statistics?: {
    episodeCount?: number;
    episodeFileCount?: number;
    totalEpisodeCount?: number;
    sizeOnDisk?: number;
    percentOfEpisodes?: number;
  };
}

export interface SonarrImage {
  coverType: 'poster' | 'fanart' | 'banner';
  url?: string;
  remoteUrl?: string;
}

export interface SonarrSeason {
  seasonNumber: number;
  monitored: boolean;
  statistics?: {
    episodeCount: number;
    episodeFileCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number;
  };
}

export interface SonarrEpisode {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview?: string;
  airDate?: string;
  airDateUtc?: string;
  monitored: boolean;
  hasFile: boolean;
  episodeFileId?: number;
}

export interface AddSonarrSeriesRequest {
  title: string;
  tvdbId: number;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  seasonFolder: boolean;
  addOptions?: {
    searchForMissingEpisodes?: boolean;
  };
}

export interface UpdateSonarrSeriesRequest {
  monitored?: boolean;
  qualityProfileId?: number;
  seasonFolder?: boolean;
  tags?: number[];
}
