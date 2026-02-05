import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import React, { useEffect, useState } from 'react';
import { getHiddenDownloadIds } from '@/lib/hidden-downloads';
import { ServiceIcon } from '@/components/ServiceIcon';
import type { DownloadedMediaItem } from '@shared/index';

interface CalendarEvent {
  id: number;
  title: string;
  airDate?: string;
  releaseDate?: string;
  digitalRelease?: string;
  service: 'radarr' | 'sonarr' | 'readarr';
  type: 'movie' | 'episode' | 'book';
  hasFile?: boolean;
  monitored?: boolean;
  series?: {
    title: string;
  };
  episodeNumber?: number;
  seasonNumber?: number;
}

export function Dashboard() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
  });

  const { data: queue } = useQuery({
    queryKey: ['downloads', 'queue'],
    queryFn: () => api.downloads.getQueue(),
    refetchInterval: 10000,
  });

  const { data: stats } = useQuery({
    queryKey: ['downloads', 'stats'],
    queryFn: () => api.downloads.getStats(),
    refetchInterval: 5000,
  });

  const { data: todayDownloads } = useQuery({
    queryKey: ['downloads', 'today'],
    queryFn: () => api.downloads.getToday(8),
    refetchInterval: 60000,
  });

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getHiddenDownloadIds());
  const [plexLoadingId, setPlexLoadingId] = useState<string | null>(null);
  useEffect(() => {
    setHiddenIds(getHiddenDownloadIds());
  }, [queue]);

  // Fetch Plex/Tautulli stats
  const { data: plexStats } = useQuery({
    queryKey: ['tautulli', 'homeStats'],
    queryFn: () => api.tautulli.getHomeStats(),
    refetchInterval: 30000,
  });

  const { data: plexSessions } = useQuery({
    queryKey: ['plex', 'sessions'],
    queryFn: () => api.plex.getSessions(),
    refetchInterval: 10000,
  });

  // Get upcoming releases (next 7 days)
  const { startDate, endDate } = React.useMemo(() => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    return {
      startDate: today.toISOString(),
      endDate: end.toISOString(),
    };
  }, []);

  const { data: upcomingReleases } = useQuery({
    queryKey: ['calendar', startDate, endDate],
    queryFn: async () => {
      const response = await api.get<CalendarEvent[]>(
        `/calendar?start=${startDate}&end=${endDate}`
      );
      return response.slice(0, 5); // Only show next 5
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const visibleQueue = (queue || []).filter((item: any) => !hiddenIds.has(item.id));
  const activeDownloads = visibleQueue.filter((item: any) =>
    item.status === 'downloading' || item.status === 'queued'
  );

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return Math.round(bytesPerSecond / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Aggregate download speed from all available clients
  const getTotalDownloadSpeed = (): number => {
    let total = 0;
    if (stats?.qbittorrent?.downloadSpeed) {
      total += stats.qbittorrent.downloadSpeed;
    }
    if (stats?.sabnzbd?.downloadSpeed) {
      total += stats.sabnzbd.downloadSpeed;
    }
    if (stats?.rdtclient?.downloadSpeed) {
      total += stats.rdtclient.downloadSpeed;
    }
    return total;
  };

  const getDisplayTitle = (event: CalendarEvent) => {
    if (event.type === 'episode' && event.series) {
      const episodeInfo = event.seasonNumber && event.episodeNumber
        ? `S${String(event.seasonNumber).padStart(2, '0')}E${String(event.episodeNumber).padStart(2, '0')}`
        : '';
      return episodeInfo
        ? `${event.series.title} - ${episodeInfo}`
        : `${event.series.title} - ${event.title}`;
    }
    return event.title;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const getTodayDownloadTitle = (item: DownloadedMediaItem) => {
    if (item.type !== 'episode') return item.title;
    const season = item.seasonNumber !== undefined
      ? `S${String(item.seasonNumber).padStart(2, '0')}`
      : '';
    const episode = item.episodeNumber !== undefined
      ? `E${String(item.episodeNumber).padStart(2, '0')}`
      : '';
    const episodeInfo = `${season}${episode}` || item.title;
    if (item.seriesTitle) {
      return episodeInfo ? `${item.seriesTitle} - ${episodeInfo}` : item.seriesTitle;
    }
    return item.title;
  };

  const handleOpenInPlex = async (item: DownloadedMediaItem) => {
    setPlexLoadingId(item.id);
    const plexWindow = window.open('', '_blank');
    if (!plexWindow) {
      setPlexLoadingId(null);
      return;
    }

    plexWindow.document.title = 'Dasharr – Opening Plex…';
    plexWindow.document.body.innerHTML = `
      <div style="
        font-family: system-ui, -apple-system, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
        color: #666;
      ">
        <div style="font-size: 48px; margin-bottom: 16px;">📺</div>
        <div style="font-size: 18px; font-weight: 500;">Searching Plex…</div>
      </div>
    `;

    try {
      const query = item.searchTitle || getTodayDownloadTitle(item);
      
      // Use the new findMedia endpoint that tries IDs first
      const plexMedia = await api.plex.findMedia({
        title: query,
        type: item.type,
        seriesTitle: item.seriesTitle,
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber,
        imdbId: item.imdbId,
        tmdbId: item.tmdbId,
        tvdbId: item.tvdbId,
      });
      
      if (plexMedia && plexMedia.length > 0) {
        const firstResult = plexMedia[0];
        const key = firstResult.key || `/library/metadata/${firstResult.ratingKey}`;
        const plexUrl = `https://app.plex.tv/desktop/#!/server/${firstResult.machineIdentifier}/details?key=${encodeURIComponent(key)}`;
        plexWindow.location.href = plexUrl;
      } else {
        // Show "not found" message instead of closing
        plexWindow.document.body.innerHTML = `
          <div style="
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            color: #666;
            text-align: center;
            padding: 20px;
          ">
            <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
            <div style="font-size: 18px; font-weight: 500; margin-bottom: 8px;">Not found in Plex</div>
            <div style="font-size: 14px; color: #999;">"${query}"</div>
            <button onclick="window.close()" style="
              margin-top: 24px;
              padding: 10px 20px;
              border: none;
              background: #e5a00d;
              color: white;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
            ">Close</button>
          </div>
        `;
      }
    } catch (error) {
      console.error('Failed to open Plex item:', error);
      // Show error message instead of closing
      plexWindow.document.body.innerHTML = `
        <div style="
          font-family: system-ui, -apple-system, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          color: #666;
          text-align: center;
          padding: 20px;
        ">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <div style="font-size: 18px; font-weight: 500; margin-bottom: 8px;">Error searching Plex</div>
          <div style="font-size: 14px; color: #999;">Please check your Plex connection</div>
          <button onclick="window.close()" style="
            margin-top: 24px;
            padding: 10px 20px;
            border: none;
            background: #e5a00d;
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          ">Close</button>
        </div>
      `;
    } finally {
      setPlexLoadingId(null);
    }
  };

  const connectedServices = Object.values(health?.services || {}).filter(Boolean).length;
  const totalServices = Object.keys(health?.services || {}).length;

  return (
    <div className="space-y-8 pb-20 md:pb-8 animate-fade-in">
      {/* Header */}
      <div className="animate-slide-down">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-base">
          Your media server at a glance
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {/* Active Downloads */}
        <div className="group relative rounded-2xl bg-gradient-to-br from-blue-500/20 via-blue-500/10 to-transparent border border-blue-500/30 p-6 hover:shadow-2xl hover:shadow-blue-500/20 transition-all duration-500 overflow-hidden animate-scale-in">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-400 uppercase tracking-wide mb-3">Active Downloads</p>
              <p className="text-5xl font-extrabold tracking-tight mb-1">{activeDownloads.length}</p>
              <p className="text-xs text-muted-foreground">Currently downloading</p>
            </div>
            <div className="text-5xl opacity-40 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">⬇️</div>
          </div>
        </div>

        {/* Download Speed */}
        <div className="group relative rounded-2xl bg-gradient-to-br from-green-500/20 via-green-500/10 to-transparent border border-green-500/30 p-6 hover:shadow-2xl hover:shadow-green-500/20 transition-all duration-500 overflow-hidden animate-scale-in" style={{ animationDelay: '50ms' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-green-400 uppercase tracking-wide mb-3">Download Speed</p>
              <p className="text-5xl font-extrabold tracking-tight mb-1">
                {getTotalDownloadSpeed() > 0 ? formatSpeed(getTotalDownloadSpeed()).split(' ')[0] : '0'}
              </p>
              <p className="text-xs text-muted-foreground">
                {getTotalDownloadSpeed() > 0 ? formatSpeed(getTotalDownloadSpeed()).split(' ')[1] : 'B/s'}
              </p>
            </div>
            <div className="text-5xl opacity-40 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">🚀</div>
          </div>
        </div>

        {/* In Queue */}
        <div className="group relative rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30 p-6 hover:shadow-2xl hover:shadow-primary/20 transition-all duration-500 overflow-hidden animate-scale-in" style={{ animationDelay: '100ms' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">In Queue</p>
                <p className="text-5xl font-extrabold tracking-tight mb-1">{visibleQueue.length}</p>
              <p className="text-xs text-muted-foreground">Pending downloads</p>
            </div>
            <div className="text-5xl opacity-40 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">📦</div>
          </div>
        </div>

        {/* Service Health */}
        <div className="group relative rounded-2xl bg-gradient-to-br from-success/20 via-success/10 to-transparent border border-success/30 p-6 hover:shadow-2xl hover:shadow-success/20 transition-all duration-500 overflow-hidden animate-scale-in" style={{ animationDelay: '150ms' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-success uppercase tracking-wide mb-3">Services Online</p>
              <p className="text-5xl font-extrabold tracking-tight mb-1">{connectedServices}<span className="text-2xl text-muted-foreground">/{totalServices}</span></p>
              <p className="text-xs text-muted-foreground">All systems operational</p>
            </div>
            <div className="text-5xl opacity-40 group-hover:scale-110 transition-transform duration-500">
              <div className="w-12 h-12 rounded-full bg-success/30 flex items-center justify-center animate-pulse">
                🟢
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Three Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {/* Active Downloads Widget */}
        <div className="group rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm overflow-hidden hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 animate-slide-up">
          <div className="p-6 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-xl border border-primary/30">
                  ⬇️
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Active Downloads</h2>
              </div>
              <a
                href="/downloads"
                className="text-sm font-semibold text-primary hover:text-accent transition-colors flex items-center gap-1 group/link"
              >
                View All
                <span className="group-hover/link:translate-x-1 transition-transform">→</span>
              </a>
            </div>
          </div>
          <div className="p-6">
            {activeDownloads.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <div className="text-6xl opacity-20">⬇️</div>
                <p className="text-muted-foreground font-medium">No active downloads</p>
                <p className="text-xs text-muted-foreground/70">Downloads will appear here when active</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeDownloads.slice(0, 3).map((item: any, idx: number) => (
                  <div
                    key={item.id}
                    className="group/item relative rounded-xl border border-border/50 bg-background-elevated/40 p-4 hover:border-primary/40 hover:bg-card-elevated/80 transition-all duration-300"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base truncate text-foreground group-hover/item:text-primary transition-colors">
                          {item.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          {item.downloadClient || 'Unknown'}
                        </p>
                      </div>
                      <div className="text-right">
                        {item.sizeleft > 0 && item.size > 0 && (
                          <p className="text-2xl font-bold text-primary">
                            {((item.size - item.sizeleft) / item.size * 100).toFixed(0)}%
                          </p>
                        )}
                      </div>
                    </div>
                    {item.sizeleft > 0 && item.size > 0 && (
                      <div className="relative">
                        <div className="w-full bg-border/30 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-primary via-accent to-primary h-2 rounded-full transition-all duration-500 relative overflow-hidden"
                            style={{
                              width: `${((item.size - item.sizeleft) / item.size * 100).toFixed(1)}%`,
                            }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Releases Widget */}
        <div className="group rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm overflow-hidden hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <div className="p-6 border-b border-border/30 bg-gradient-to-r from-accent/5 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-primary/20 flex items-center justify-center text-xl border border-accent/30">
                  📅
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Upcoming This Week</h2>
              </div>
              <a
                href="/calendar"
                className="text-sm font-semibold text-primary hover:text-accent transition-colors flex items-center gap-1 group/link"
              >
                View Calendar
                <span className="group-hover/link:translate-x-1 transition-transform">→</span>
              </a>
            </div>
          </div>
          <div className="p-6">
            {!upcomingReleases || upcomingReleases.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <div className="text-6xl opacity-20">📅</div>
                <p className="text-muted-foreground font-medium">No upcoming releases</p>
                <p className="text-xs text-muted-foreground/70">New releases will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingReleases.map((event: CalendarEvent, idx: number) => (
                  <div
                    key={`${event.service}-${event.id}`}
                    className="group/item flex items-center gap-4 rounded-xl border border-border/50 bg-background-elevated/40 p-4 hover:border-primary/40 hover:bg-card-elevated/80 transition-all duration-300"
                    style={{ animationDelay: `${idx * 80}ms` }}
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center border border-primary/20 flex-shrink-0 group-hover/item:scale-110 transition-transform">
                      <ServiceIcon service={event.service} size={32} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate text-foreground group-hover/item:text-primary transition-colors">
                        {getDisplayTitle(event)}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span className="capitalize">{event.type}</span>
                        {event.hasFile ? (
                          <span className="px-2 py-0.5 rounded-full bg-success/20 border border-success/30 text-success font-semibold">
                            Downloaded
                          </span>
                        ) : event.monitored ? (
                          <span className="px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary font-semibold">
                            Monitored
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-muted/40 border border-border/50 text-muted-foreground font-semibold">
                            Unmonitored
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                        <p className="text-xs font-bold text-primary">
                          {formatDate(event.airDate || event.releaseDate || event.digitalRelease)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Downloaded Today Widget */}
        <div className="group rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm overflow-hidden hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 animate-slide-up" style={{ animationDelay: '150ms' }}>
          <div className="p-6 border-b border-border/30 bg-gradient-to-r from-success/5 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-success/20 to-primary/20 flex items-center justify-center text-xl border border-success/30">
                  ✅
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Downloaded Today</h2>
              </div>
              <a
                href="/downloads"
                className="text-sm font-semibold text-primary hover:text-accent transition-colors flex items-center gap-1 group/link"
              >
                View Downloads
                <span className="group-hover/link:translate-x-1 transition-transform">→</span>
              </a>
            </div>
          </div>
          <div className="p-6">
            {!todayDownloads || todayDownloads.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <div className="text-6xl opacity-20">✅</div>
                <p className="text-muted-foreground font-medium">No downloads yet today</p>
                <p className="text-xs text-muted-foreground/70">New items will appear here after import</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayDownloads.map((item: DownloadedMediaItem, idx: number) => (
                  <div
                    key={item.id}
                    className="group/item flex items-start gap-4 rounded-xl border border-border/50 bg-background-elevated/40 p-4 hover:border-primary/40 hover:bg-card-elevated/80 transition-all duration-300"
                    style={{ animationDelay: `${idx * 80}ms` }}
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center border border-primary/20 flex-shrink-0 group-hover/item:scale-110 transition-transform">
                      <ServiceIcon service={item.service} size={28} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate text-foreground group-hover/item:text-primary transition-colors">
                        {getTodayDownloadTitle(item)}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span className="capitalize">{item.type}</span>
                        <span className="text-muted-foreground/60">•</span>
                        <span>{formatTime(item.downloadedAt)}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenInPlex(item)}
                        disabled={plexLoadingId === item.id}
                        className="px-3 py-1.5 rounded-lg border border-primary/30 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {plexLoadingId === item.id ? '...' : 'Open in Plex'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Plex Watch Stats Widget */}
        <div className="group rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm overflow-hidden hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <div className="p-6 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-xl border border-primary/30">
                  📊
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Plex Watch Stats</h2>
              </div>
            </div>
          </div>
          <div className="p-6">
            {!plexStats ? (
              <div className="text-center py-12 space-y-3">
                <div className="text-6xl opacity-20">📊</div>
                <p className="text-muted-foreground font-medium">No stats available</p>
                <p className="text-xs text-muted-foreground/70">Connect Tautulli to see watch statistics</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Current Streams */}
                <div className="rounded-xl border border-border/50 bg-background-elevated/40 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                        Current Streams
                      </p>
                      <p className="text-3xl font-extrabold text-primary">
                        {plexStats.stream_count || 0}
                      </p>
                    </div>
                    <div className="text-4xl opacity-40">📺</div>
                  </div>
                </div>

                {/* Plays Today/Week */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/50 bg-background-elevated/40 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Today
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {plexStats.plays_today || 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">plays</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-background-elevated/40 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      This Week
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {plexStats.plays_week || 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">plays</p>
                  </div>
                </div>

                {/* Active Streams */}
                {plexSessions?.sessions?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Active Streams
                    </p>
                    {plexSessions.sessions.slice(0, 3).map((stream: any) => {
                      const progress = stream.viewOffset && stream.duration
                        ? (stream.viewOffset / stream.duration) * 100
                        : 0;
                      const bandwidth = stream.session?.bandwidth
                        ? `${(stream.session.bandwidth / 1024).toFixed(1)} Mbps`
                        : undefined;
                      return (
                        <div
                          key={stream.sessionKey || `${stream.title}-${stream.user?.title}`}
                          className="rounded-xl border border-border/50 bg-background-elevated/40 p-4"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-lg border border-primary/30">
                              📺
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {stream.title}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {stream.user?.title || stream.user?.username || 'Unknown user'}
                              </p>
                            </div>
                            {bandwidth && (
                              <span className="text-xs font-semibold text-muted-foreground">
                                {bandwidth}
                              </span>
                            )}
                          </div>
                          {stream.duration && (
                            <div className="mt-3 space-y-1">
                              <div className="w-full bg-border/30 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-primary to-accent h-1.5 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(progress, 100).toFixed(1)}%` }}
                                />
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {progress.toFixed(0)}% watched
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Most Watched */}
                {plexStats.most_watched?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Most Watched
                    </p>
                    {plexStats.most_watched.slice(0, 3).map((item: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 rounded-xl border border-border/50 bg-background-elevated/40 p-3 hover:border-primary/40 hover:bg-card-elevated/80 transition-all duration-300"
                      >
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-sm font-bold text-primary border border-primary/30">
                          #{idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {item.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.plays} plays
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm p-8 animate-slide-up" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-xl border border-primary/30">
            ⚡
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Quick Actions</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <a
            href="/search"
            className="group relative flex items-center gap-4 p-5 rounded-xl border border-border/50 bg-background-elevated/40 hover:bg-gradient-to-br hover:from-primary/10 hover:to-accent/5 hover:border-primary/40 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 overflow-hidden shine-effect"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center text-3xl border border-blue-500/30 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
              🔍
            </div>
            <div>
              <p className="font-bold text-base text-foreground group-hover:text-primary transition-colors">Search</p>
              <p className="text-xs text-muted-foreground">Find new media</p>
            </div>
          </a>
          <a
            href="/movies"
            className="group relative flex items-center gap-4 p-5 rounded-xl border border-border/50 bg-background-elevated/40 hover:bg-gradient-to-br hover:from-primary/10 hover:to-accent/5 hover:border-primary/40 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 overflow-hidden shine-effect"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/20 flex items-center justify-center border border-red-500/30 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
              <ServiceIcon service="radarr" size={32} />
            </div>
            <div>
              <p className="font-bold text-base text-foreground group-hover:text-primary transition-colors">Movies</p>
              <p className="text-xs text-muted-foreground">Manage collection</p>
            </div>
          </a>
          <a
            href="/series"
            className="group relative flex items-center gap-4 p-5 rounded-xl border border-border/50 bg-background-elevated/40 hover:bg-gradient-to-br hover:from-primary/10 hover:to-accent/5 hover:border-primary/40 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 overflow-hidden shine-effect"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 flex items-center justify-center border border-purple-500/30 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
              <ServiceIcon service="sonarr" size={32} />
            </div>
            <div>
              <p className="font-bold text-base text-foreground group-hover:text-primary transition-colors">TV Shows</p>
              <p className="text-xs text-muted-foreground">Manage series</p>
            </div>
          </a>
          <a
            href="/downloads"
            className="group relative flex items-center gap-4 p-5 rounded-xl border border-border/50 bg-background-elevated/40 hover:bg-gradient-to-br hover:from-primary/10 hover:to-accent/5 hover:border-primary/40 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 overflow-hidden shine-effect"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/20 flex items-center justify-center text-3xl border border-green-500/30 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
              ⬇️
            </div>
            <div>
              <p className="font-bold text-base text-foreground group-hover:text-primary transition-colors">Downloads</p>
              <p className="text-xs text-muted-foreground">View queue</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
