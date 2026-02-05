export interface ProwlarrIndexer {
  id: number;
  name: string;
  fields?: Array<{
    name: string;
    value: any;
  }>;
  implementationName?: string;
  implementation?: string;
  configContract?: string;
  infoLink?: string;
  tags?: number[];
  protocol: 'torrent' | 'usenet';
  priority: number;
  enable: boolean;
  redirect: boolean;
  supportsRss: boolean;
  supportsSearch: boolean;
  appProfileId: number;
  added?: string;
  capabilities?: {
    categories: any[];
    supportsRawSearch: boolean;
  };
}

export interface ProwlarrIndexerStats {
  indexerId: number;
  indexerName: string;
  averageResponseTime: number;
  numberOfQueries: number;
  numberOfGrabs: number;
  numberOfRssQueries: number;
  numberOfAuthQueries: number;
  numberOfFailedQueries: number;
  numberOfFailedGrabs: number;
  numberOfFailedRssQueries: number;
  numberOfFailedAuthQueries: number;
}

export interface ProwlarrSearchRequest {
  query?: string;
  indexerIds?: number[];
  categories?: number[];
  type?: 'search' | 'tvsearch' | 'movie';
  limit?: number;
  offset?: number;
}

export interface ProwlarrSearchResult {
  guid: string;
  indexerId: number;
  indexer: string;
  title: string;
  sortTitle?: string;
  size: number;
  publishDate: string;
  downloadUrl?: string;
  infoUrl?: string;
  indexerFlags?: number[];
  categories?: number[];
  magnetUrl?: string;
  age?: number;
  ageHours?: number;
  ageMinutes?: number;
  protocol: 'torrent' | 'usenet';
  seeders?: number;
  leechers?: number;
  grabs?: number;
}

export interface AddProwlarrIndexerRequest {
  name: string;
  implementation: string;
  configContract: string;
  fields: Array<{
    name: string;
    value: any;
  }>;
  protocol: 'torrent' | 'usenet';
  priority: number;
  enable: boolean;
  appProfileId: number;
  tags?: number[];
}

export interface UpdateProwlarrIndexerRequest {
  enable?: boolean;
  priority?: number;
  appProfileId?: number;
  tags?: number[];
}
