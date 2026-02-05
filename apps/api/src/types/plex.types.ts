// Plex API Types

export interface PlexSession {
  sessionKey: string;
  Session?: {
    id: string;
    bandwidth: number;
    location: string;
  };
  User?: {
    id: string;
    title: string;
    thumb?: string;
  };
  Player?: {
    address: string;
    device: string;
    machineIdentifier: string;
    model: string;
    platform: string;
    platformVersion: string;
    product: string;
    profile: string;
    state: string;
    title: string;
    version: string;
    local: boolean;
    relayed: boolean;
    secure: boolean;
    userID: number;
  };
  type: string;
  title: string;
  grandparentTitle?: string;
  parentTitle?: string;
  originalTitle?: string;
  year?: number;
  thumb?: string;
  art?: string;
  parentThumb?: string;
  grandparentThumb?: string;
  grandparentArt?: string;
  guid?: string;
  ratingKey: string;
  key: string;
  parentRatingKey?: string;
  grandparentRatingKey?: string;
  viewOffset?: number;
  duration?: number;
  addedAt?: number;
  updatedAt?: number;
  Media?: PlexMedia[];
}

export interface PlexMedia {
  id: string;
  duration: number;
  bitrate: number;
  width: number;
  height: number;
  aspectRatio: number;
  audioChannels: number;
  audioCodec: string;
  videoCodec: string;
  videoResolution: string;
  container: string;
  videoFrameRate: string;
  videoProfile: string;
  Part?: PlexPart[];
}

export interface PlexPart {
  id: string;
  key: string;
  duration: number;
  file: string;
  size: number;
  container: string;
  videoProfile: string;
  Stream?: PlexStream[];
}

export interface PlexStream {
  id: string;
  streamType: number;
  codec: string;
  index: number;
  bitrate?: number;
  language?: string;
  languageCode?: string;
  bitDepth?: number;
  chromaLocation?: string;
  chromaSubsampling?: string;
  codedHeight?: number;
  codedWidth?: number;
  colorRange?: string;
  frameRate?: number;
  height?: number;
  width?: number;
  displayTitle?: string;
  extendedDisplayTitle?: string;
}

export interface PlexLibrary {
  allowSync: boolean;
  art: string;
  composite: string;
  filters: boolean;
  refreshing: boolean;
  thumb: string;
  key: string;
  type: string;
  title: string;
  agent: string;
  scanner: string;
  language: string;
  uuid: string;
  updatedAt: number;
  createdAt: number;
  scannedAt: number;
  content: boolean;
  directory: boolean;
  contentChangedAt: number;
  hidden: number;
  Location?: PlexLocation[];
}

export interface PlexLocation {
  id: number;
  path: string;
}

export interface PlexLibraryItem {
  ratingKey: string;
  key: string;
  guid: string;
  type: string;
  title: string;
  summary?: string;
  index?: number;
  parentIndex?: number;  // Season number for episodes
  year?: number;
  thumb?: string;
  art?: string;
  duration?: number;
  originallyAvailableAt?: string;
  addedAt: number;
  updatedAt: number;
  Media?: PlexMedia[];
  Genre?: PlexTag[];
  Director?: PlexTag[];
  Writer?: PlexTag[];
  Country?: PlexTag[];
  Role?: PlexTag[];
  // Episode-specific fields
  grandparentTitle?: string;  // Series title for episodes
  parentTitle?: string;       // Season title for episodes
}

export interface PlexTag {
  id?: number;
  filter?: string;
  tag: string;
}

export interface PlexServerInfo {
  size: string;
  allowCameraUpload: boolean;
  allowChannelAccess: boolean;
  allowMediaDeletion: boolean;
  allowSharing: boolean;
  allowSync: boolean;
  allowTuners: boolean;
  backgroundProcessing: boolean;
  certificate: boolean;
  companionProxy: boolean;
  diagnostics: string;
  eventStream: boolean;
  friendlyName: string;
  hubSearch: boolean;
  itemClusters: boolean;
  livetv: number;
  machineIdentifier: string;
  mediaProviders: boolean;
  multiuser: boolean;
  myPlex: boolean;
  myPlexMappingState: string;
  myPlexSigninState: string;
  myPlexSubscription: boolean;
  myPlexUsername: string;
  offlineTranscode: number;
  ownerFeatures: string;
  photoAutoTag: boolean;
  platform: string;
  platformVersion: string;
  pluginHost: boolean;
  pushNotifications: boolean;
  readOnlyLibraries: boolean;
  requestParametersInCookie: boolean;
  streamingBrainABRVersion: number;
  streamingBrainVersion: number;
  sync: boolean;
  transcoderActiveVideoSessions: number;
  transcoderAudio: boolean;
  transcoderLyrics: boolean;
  transcoderPhoto: boolean;
  transcoderSubtitles: boolean;
  transcoderVideo: boolean;
  transcoderVideoBitrates: string;
  transcoderVideoQualities: string;
  transcoderVideoResolutions: string;
  updatedAt: number;
  updater: boolean;
  version: string;
  voiceSearch: boolean;
}

export interface PlexSessionsResponse {
  MediaContainer: {
    size: number;
    Metadata?: PlexSession[];
  };
}

export interface PlexLibrariesResponse {
  MediaContainer: {
    size: number;
    allowSync: boolean;
    title1: string;
    Directory?: PlexLibrary[];
  };
}

export interface PlexLibraryItemsResponse {
  MediaContainer: {
    size: number;
    allowSync: boolean;
    art?: string;
    identifier: string;
    librarySectionID: number;
    librarySectionTitle: string;
    librarySectionUUID: string;
    mediaTagPrefix: string;
    mediaTagVersion: number;
    thumb?: string;
    title1: string;
    title2: string;
    viewGroup: string;
    viewMode: number;
    Metadata?: PlexLibraryItem[];
  };
}

export interface PlexSearchResponse {
  MediaContainer: {
    size: number;
    Metadata?: PlexLibraryItem[];
  };
}

export interface PlexServerInfoResponse {
  MediaContainer: PlexServerInfo;
}
