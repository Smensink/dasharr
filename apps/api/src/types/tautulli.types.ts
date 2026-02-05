// Tautulli API Types

export interface TautulliResponse<T = any> {
  response: {
    result: 'success' | 'error';
    message: string | null;
    data: T;
  };
}

export interface TautulliSession {
  session_key: string;
  session_id: string;
  media_index: number;
  parent_media_index: number;
  art: string;
  thumb: string;
  parent_thumb: string;
  grandparent_thumb: string;
  user: string;
  user_id: number;
  username: string;
  friendly_name: string;
  user_thumb: string;
  player: string;
  platform: string;
  product: string;
  product_version: string;
  profile: string;
  state: string;
  view_offset: number;
  progress_percent: number;
  quality_profile: string;
  video_decision: string;
  audio_decision: string;
  subtitle_decision: string;
  transcode_decision: string;
  stream_bitrate: number;
  stream_video_bitrate: number;
  stream_video_resolution: string;
  stream_video_framerate: string;
  stream_video_codec: string;
  stream_audio_bitrate: number;
  stream_audio_codec: string;
  stream_audio_channels: number;
  stream_container: string;
  stream_container_decision: string;
  optimized_version: boolean;
  optimized_version_profile: string;
  synced_version: boolean;
  synced_version_profile: string;
  title: string;
  full_title: string;
  rating_key: number;
  parent_rating_key: number;
  grandparent_rating_key: number;
  media_type: string;
  year: number;
  originally_available_at: string;
  added_at: number;
  updated_at: number;
  last_viewed_at: number;
  guid: string;
  parent_guid: string;
  grandparent_guid: string;
  duration: number;
  container: string;
  bitrate: number;
  width: number;
  height: number;
  aspect_ratio: string;
  video_codec: string;
  video_resolution: string;
  video_full_resolution: string;
  video_framerate: string;
  video_profile: string;
  audio_codec: string;
  audio_channels: number;
  audio_channel_layout: string;
  audio_profile: string;
  optimized_version_title: string;
  file: string;
  file_size: number;
  indexes: number;
  live: number;
  live_uuid: string;
  originally_available: string;
  library_name: string;
  section_id: number;
  bif_thumb: string;
}

export interface TautulliActivity {
  lan_bandwidth: number;
  stream_count: number;
  stream_count_direct_play: number;
  stream_count_direct_stream: number;
  stream_count_transcode: number;
  total_bandwidth: number;
  wan_bandwidth: number;
  sessions?: TautulliSession[];
}

export interface TautulliHistoryRecord {
  date: number;
  duration: number;
  friendly_name: string;
  full_title: string;
  grandparent_rating_key: number;
  grandparent_title: string;
  original_title: string;
  group_count: number;
  group_ids: string;
  guid: string;
  ip_address: string;
  live: number;
  machine_id: string;
  media_index: number;
  media_type: string;
  originally_available_at: string;
  parent_media_index: number;
  parent_rating_key: number;
  parent_title: string;
  paused_counter: number;
  percent_complete: number;
  platform: string;
  player: string;
  product: string;
  rating_key: number;
  reference_id: number;
  row_id: number;
  session_key: string;
  started: number;
  state: string;
  stopped: number;
  thumb: string;
  title: string;
  transcode_decision: string;
  user: string;
  user_id: number;
  watched_status: number;
  year: number;
}

export interface TautulliHistory {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  total_duration: string;
  filter_duration: string;
  data?: TautulliHistoryRecord[];
}

export interface TautulliLibraryWatchStats {
  query_days: number;
  total_plays: number;
  total_time: number;
  library_stats?: TautulliLibraryStat[];
}

export interface TautulliLibraryStat {
  section_id: number;
  section_name: string;
  section_type: string;
  total_plays: number;
  total_time: number;
}

export interface TautulliHomeStat {
  rows?: TautulliHomeStatRow[];
  stat_id: string;
  stat_title: string;
  stat_type: string;
}

export interface TautulliHomeStatRow {
  art: string;
  content_rating: string;
  friendly_name: string;
  grandchild_rating_key: number;
  grandchild_title: string;
  grandparent_rating_key: number;
  grandparent_thumb: string;
  grandparent_title: string;
  guid: string;
  labels: string[];
  last_play: number;
  media_index: number;
  media_type: string;
  parent_media_index: number;
  parent_rating_key: number;
  parent_thumb: string;
  parent_title: string;
  platform: string;
  platform_name: string;
  plays: number;
  rating_key: number;
  row_id: number;
  section_id: number;
  thumb: string;
  title: string;
  total_duration: number;
  total_plays: number;
  user: string;
  user_id: number;
  user_thumb: string;
  users_watched: string;
  year: number;
}
