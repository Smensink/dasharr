export interface ReadarrBook {
  id: number;
  title: string;
  authorTitle: string;
  seriesTitle?: string;
  disambiguation?: string;
  overview?: string;
  foreignBookId?: string;
  foreignEditionId?: string;
  images?: ReadarrImage[];
  author: ReadarrAuthor;
  added: string;
  ratings?: {
    value: number;
  };
  path?: string;
  rootFolderPath?: string;
  monitored: boolean;
  qualityProfileId: number;
  genres?: string[];
  tags?: number[];
  links?: Array<{ url: string; name: string }>;
  // Book-specific
  pageCount?: number;
  releaseDate?: string;
  // Editions and files
  editions?: ReadarrEdition[];
  bookFileCount?: number;
  statistics?: {
    bookFileCount?: number;
    availableBookCount?: number;
  };
  grabbed?: boolean;
  anyEditionOk?: boolean;
  addOptions?: {
    searchForNewBook?: boolean;
  };
}

export interface ReadarrAuthor {
  id: number;
  authorName: string;
  authorNameLastFirst?: string;
  foreignAuthorId?: string;
  titleSlug?: string;
  overview?: string;
  links?: Array<{ url: string; name: string }>;
  images?: ReadarrImage[];
  path?: string;
  qualityProfileId?: number;
  metadataProfileId?: number;
  monitored?: boolean;
  monitorNewItems?: string;
  genres?: string[];
  cleanName?: string;
  sortName?: string;
  tags?: number[];
  added?: string;
  ratings?: {
    votes: number;
    value: number;
  };
  statistics?: {
    bookFileCount?: number;
    bookCount?: number;
    availableBookCount?: number;
    totalBookCount?: number;
    sizeOnDisk?: number;
  };
}

export interface ReadarrEdition {
  id: number;
  bookId: number;
  foreignEditionId?: string;
  title?: string;
  isbn13?: string;
  asin?: string;
  language?: string;
  publisher?: string;
  pageCount?: number;
  releaseDate?: string;
  images?: ReadarrImage[];
  monitored: boolean;
  manualAdd?: boolean;
  grabbed?: boolean;
  bookFileId?: number;
}

export interface ReadarrImage {
  url?: string;
  remoteUrl?: string;
  coverType: 'cover' | 'poster' | 'banner' | 'fanart' | 'screenshot';
}

export interface AddReadarrBookRequest {
  author: {
    authorName?: string;
    authorNameLastFirst?: string;
    foreignAuthorId: string;
    qualityProfileId: number;
    metadataProfileId: number;
    monitored: boolean;
    rootFolderPath: string;
    addOptions?: {
      monitor?: string;
      searchForMissingBooks?: boolean;
    };
  };
  book: {
    foreignBookId: string;
    title?: string;
    monitored: boolean;
    anyEditionOk?: boolean;
    addOptions?: {
      searchForNewBook?: boolean;
    };
  };
}

export interface UpdateReadarrBookRequest {
  monitored?: boolean;
  qualityProfileId?: number;
  tags?: number[];
  anyEditionOk?: boolean;
}
