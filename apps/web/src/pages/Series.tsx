import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { Link } from 'react-router-dom';
import type { BazarrSeriesSubtitleSummary } from '@shared/index';

export function Series() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'wanted' | 'missing'>('all');
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const [subtitleSearchingId, setSubtitleSearchingId] = useState<number | null>(null);
  const [plexLoadingId, setPlexLoadingId] = useState<number | null>(null);

  const { data: series, isLoading, error } = useQuery({
    queryKey: ['sonarr', 'series'],
    queryFn: () => api.sonarr.getSeries(),
  });
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
  });
  const bazarrEnabled = !!health?.services?.bazarr;

  const clearNotice = () => {
    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
      noticeTimeoutRef.current = null;
    }
  };

  const setNotice = (type: 'success' | 'error', message: string) => {
    clearNotice();
    setActionNotice({ type, message });
    noticeTimeoutRef.current = window.setTimeout(() => {
      setActionNotice(null);
      noticeTimeoutRef.current = null;
    }, 2500);
  };

  const triggerSearch = useMutation({
    mutationFn: ({ id, interactive }: { id: number; interactive: boolean }) =>
      api.sonarr.triggerSearch(id, { interactive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonarr', 'series'] });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error || error?.message || 'Failed to start search';
      setNotice('error', message);
    },
  });

  const seriesSubtitleSearch = useMutation({
    mutationFn: (seriesId: number) => api.bazarr.searchSeries(seriesId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bazarr', 'series', 'summary'] });
      setNotice('success', 'Subtitle search started');
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        'Failed to start subtitle search';
      setNotice('error', message);
    },
  });

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredSeries = useMemo(() => {
    if (!series) return [];

    return series.filter((show: any) => {
      const episodeFileCount =
        show.episodeFileCount ?? show.statistics?.episodeFileCount ?? 0;
      const status = episodeFileCount > 0 ? 'available' : show.monitored ? 'wanted' : 'missing';
      if (statusFilter !== 'all' && status !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) return true;
      const fields = [
        show.title,
        show.sortTitle,
        show.network,
        show.year,
      ];
      return fields.some((field) =>
        field?.toString().toLowerCase().includes(normalizedQuery)
      );
    });
  }, [series, normalizedQuery, statusFilter]);

  const statusOptions: Array<{ key: 'all' | 'available' | 'wanted' | 'missing'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'available', label: 'Available' },
    { key: 'wanted', label: 'Wanted' },
    { key: 'missing', label: 'Missing' },
  ];

  const seriesIdsForSummary = useMemo(
    () => filteredSeries.map((show: any) => show.id),
    [filteredSeries]
  );
  const seriesSummaryKey = seriesIdsForSummary.join(',');
  const { data: bazarrSeriesSummaries } = useQuery({
    queryKey: ['bazarr', 'series', 'summary', seriesSummaryKey],
    queryFn: () => api.bazarr.getSeriesSummary(seriesIdsForSummary),
    enabled: bazarrEnabled && seriesIdsForSummary.length > 0,
    staleTime: 60 * 1000,
  });
  const bazarrSummaryMap = useMemo(() => {
    const map = new Map<number, BazarrSeriesSubtitleSummary>();
    bazarrSeriesSummaries?.forEach((summary) => map.set(summary.seriesId, summary));
    return map;
  }, [bazarrSeriesSummaries]);

  type SubtitleBadgeState = 'available' | 'missing' | 'unknown' | 'offline';

  const getSubtitleBadgeState = (summary?: BazarrSeriesSubtitleSummary): SubtitleBadgeState => {
    if (!bazarrEnabled) return 'offline';
    if (!summary) return 'unknown';
    if (summary.available > 0 && summary.missing === 0) return 'available';
    if (summary.missing > 0) return 'missing';
    return summary.total > 0 ? 'unknown' : 'unknown';
  };

  const getSubtitleBadgeProps = (state: SubtitleBadgeState) => {
    switch (state) {
      case 'available':
        return {
          text: 'OK',
          className: 'bg-success/80 border-success/40 text-white',
          title: 'All episodes have subtitles',
        };
      case 'missing':
        return {
          text: 'Missing',
          className: 'bg-destructive/80 border-destructive/40 text-white',
          title: 'Some episodes are missing subtitles',
        };
      case 'offline':
        return {
          text: 'Offline',
          className: 'bg-muted/80 border-border/50 text-muted-foreground',
          title: 'Bazarr is offline',
        };
      case 'unknown':
      default:
        return {
          text: 'Unknown',
          className: 'bg-muted/80 border-border/50 text-muted-foreground',
          title: 'Subtitle availability unknown',
        };
    }
  };

  const handleSearch = (id: number, interactive: boolean) => {
    setActioningId(id);
    triggerSearch.mutate(
      { id, interactive },
      {
        onSuccess: () => {
          const label = interactive ? 'Interactive search started' : 'Automatic search started';
          setNotice('success', label);
        },
        onSettled: () => {
          window.setTimeout(() => setActioningId(null), 400);
        },
      }
    );
  };

  const handleWatchOnPlex = async (show: any) => {
    if (!show.tvdbId) {
      setNotice('error', 'No TVDB ID found for this series');
      return;
    }

    setPlexLoadingId(show.id);
    const plexWindow = window.open('', '_blank');
    if (!plexWindow) {
      setPlexLoadingId(null);
      setNotice('error', 'Popup blocked; allow popups to watch on Plex');
      return;
    }

    plexWindow.document.title = 'Dasharr – Opening Plex…';
    plexWindow.document.body.innerText = 'Preparing Plex…';

    try {
      const guid = `tvdb://${show.tvdbId}`;
      const plexMedia = await api.plex.getMediaByGuid(guid);

      if (plexMedia?.item && plexMedia?.machineIdentifier) {
        // Use the key field which is the full path like /library/metadata/12345
        const key = plexMedia.item.key || `/library/metadata/${plexMedia.item.ratingKey}`;
        const plexUrl = `https://app.plex.tv/desktop/#!/server/${plexMedia.machineIdentifier}/details?key=${encodeURIComponent(key)}`;
        plexWindow.location.href = plexUrl;
      } else {
        plexWindow.close();
        setNotice('error', 'Series not found in Plex library');
      }
    } catch (error: any) {
      plexWindow.close();
      const message = error?.response?.data?.error || 'Failed to find series in Plex';
      setNotice('error', message);
    } finally {
      setPlexLoadingId(null);
    }
  };

  const handleSeriesSubtitleSearch = (seriesId: number) => {
    if (!bazarrEnabled) {
      setNotice('error', 'Bazarr is not connected');
      return;
    }

    setSubtitleSearchingId(seriesId);
    seriesSubtitleSearch.mutate(seriesId, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['bazarr', 'series', seriesId, 'episodes'] });
      },
      onSettled: () => {
        window.setTimeout(() => setSubtitleSearchingId(null), 400);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">TV Series</h1>
        <p className="text-muted-foreground">Loading series...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">TV Series</h1>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">
            Failed to load series. Make sure Sonarr is configured and running.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 md:pb-8 animate-fade-in">
      {/* Header Section */}
      <div className="space-y-6 animate-slide-down">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">TV Series</h1>
          <p className="text-muted-foreground text-base">
            <span className="text-primary font-bold text-lg">{series?.length || 0}</span> series in your library
          </p>
        </div>

        {/* Search and Filters */}
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-3">
              <label className="text-sm font-bold text-foreground uppercase tracking-wide">Search Library</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">
                  🔍
                </div>
                <input
                  type="text"
                  placeholder="Search by title, year, or network..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-border/50 bg-background-elevated/60 pl-12 pr-4 py-3.5 text-sm font-medium ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary/50 transition-all"
                />
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Showing <span className="text-primary font-bold">{filteredSeries.length}</span> of <span className="text-foreground font-bold">{series?.length || 0}</span> series
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setStatusFilter(option.key)}
                  className={`text-xs font-bold px-4 py-2.5 rounded-xl border transition-all duration-300 ${
                    statusFilter === option.key
                      ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground border-primary/30 shadow-lg shadow-primary/30'
                      : 'bg-card-elevated/50 text-muted-foreground border-border/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action Notice */}
      {actionNotice && (
        <div
          className={`rounded-xl border p-4 text-sm font-semibold flex items-center gap-3 animate-slide-down ${
            actionNotice.type === 'success'
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-destructive/40 bg-destructive/10 text-destructive'
          }`}
        >
          <span className="text-xl">{actionNotice.type === 'success' ? '✅' : '⚠️'}</span>
          {actionNotice.message}
        </div>
      )}

      {/* Series Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {filteredSeries.map((show: any, idx: number) => {
          const summary = bazarrSummaryMap.get(show.id);
          const downloadedCount =
            show.episodeFileCount ?? show.statistics?.episodeFileCount ?? 0;
          const totalEpisodes =
            show.episodeCount ?? show.statistics?.episodeCount ?? 0;
          const subtitleState = getSubtitleBadgeState(summary);
          const subtitleBadge = getSubtitleBadgeProps(subtitleState);
          const missingCount = summary?.missing ?? 0;
          const subtitleLabel =
            subtitleState === 'available'
              ? 'Subtitles: Available'
              : subtitleState === 'missing'
                ? `Subtitles: Missing (${missingCount})`
                : subtitleState === 'offline'
                  ? 'Subtitles: Offline'
                  : 'Subtitles: Unknown';
          const subtitleTextClass =
            subtitleState === 'available'
              ? 'text-success'
              : subtitleState === 'missing'
                ? 'text-destructive'
                : 'text-muted-foreground';
          return (
            <div
            key={show.id}
            className="group relative rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm overflow-hidden hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/40 transition-all duration-500 hover:-translate-y-2 animate-scale-in"
            style={{ animationDelay: `${(idx % 12) * 40}ms` }}
          >
            {/* Poster */}
            <div className="relative overflow-hidden">
              {show.images?.find((img: any) => img.coverType === 'poster') ? (
                <img
                  src={
                    show.images.find((img: any) => img.coverType === 'poster')
                      ?.remoteUrl
                  }
                  alt={show.title}
                  className="w-full aspect-[2/3] object-cover group-hover:scale-110 transition-transform duration-700"
                  loading="lazy"
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-gradient-to-br from-muted to-background flex items-center justify-center">
                  <span className="text-5xl opacity-30">📺</span>
                </div>
              )}

              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* Status Badge */}
              <div className="absolute top-3 right-3 flex flex-col gap-2">
                <div>
                  {(() => {
                    const episodeFileCount =
                      show.episodeFileCount ?? show.statistics?.episodeFileCount ?? 0;
                    if (episodeFileCount > 0) {
                      return (
                        <div className="px-2.5 py-1 rounded-lg bg-success/90 backdrop-blur-sm border border-success/50 flex items-center gap-1.5 shadow-lg">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          <span className="text-[10px] font-bold text-white uppercase tracking-wide">Available</span>
                        </div>
                      );
                    }
                    if (show.monitored) {
                      return (
                        <div className="px-2.5 py-1 rounded-lg bg-primary/90 backdrop-blur-sm border border-primary/50 flex items-center gap-1.5 shadow-lg">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          <span className="text-[10px] font-bold text-white uppercase tracking-wide">Wanted</span>
                        </div>
                      );
                    }
                    return (
                      <div className="px-2.5 py-1 rounded-lg bg-muted/90 backdrop-blur-sm border border-border/50 flex items-center gap-1.5 shadow-lg">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Missing</span>
                      </div>
                    );
                  })()}
                </div>
                {bazarrEnabled && (
                  <div
                    className={`px-2.5 py-1 rounded-lg backdrop-blur-sm border shadow-lg ${
                      subtitleState === 'available'
                        ? 'bg-success/80 border-success/40 text-white'
                        : subtitleState === 'missing'
                          ? 'bg-destructive/80 border-destructive/40 text-white'
                          : 'bg-muted/80 border-border/50 text-muted-foreground'
                    }`}
                    title={subtitleBadge.title}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wide">
                      CC {subtitleState === 'available' ? 'OK' : subtitleState === 'missing' ? 'Missing' : 'Unknown'}
                    </span>
                  </div>
                )}
              </div>

              {/* Quick Actions - show on hover */}
              <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSearch(show.id, false)}
                    disabled={actioningId === show.id}
                    className="flex-1 text-xs font-bold px-2 py-2 rounded-lg bg-background/95 backdrop-blur-sm border border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                  >
                    {actioningId === show.id ? '...' : '🔎'}
                  </button>
                  <button
                    onClick={() => handleSearch(show.id, true)}
                    disabled={actioningId === show.id}
                    className="flex-1 text-xs font-bold px-2 py-2 rounded-lg bg-background/95 backdrop-blur-sm border border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                  >
                    {actioningId === show.id ? '...' : '🧭'}
                  </button>
                </div>
                <button
                  onClick={() => handleWatchOnPlex(show)}
                  disabled={plexLoadingId === show.id}
                  className="w-full text-xs font-bold px-2 py-2 rounded-lg bg-gradient-to-r from-primary to-accent backdrop-blur-sm border border-primary/30 text-primary-foreground hover:shadow-lg hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                  {plexLoadingId === show.id ? '...' : '📺 Watch on Plex'}
                </button>
                {bazarrEnabled && (
                  <button
                    onClick={() => handleSeriesSubtitleSearch(show.id)}
                    disabled={subtitleSearchingId === show.id}
                    className="w-full text-xs font-bold px-2 py-2 rounded-lg border border-border/50 bg-background/95 text-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                  >
                    {subtitleSearchingId === show.id ? 'Searching...' : '🎧 Subtitles'}
                  </button>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="p-4 space-y-2">
              <h3 className="font-bold text-sm line-clamp-2 text-foreground group-hover:text-primary transition-colors leading-tight">
                {show.title}
              </h3>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-semibold">
                  {show.year}
                </p>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                  <span className="text-xs">📺</span>
                  <span className="text-xs font-bold text-primary">
                    {show.seasonCount}S
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span>
                  Downloaded {downloadedCount}/{totalEpisodes || '—'} episodes
                </span>
                <span className={`text-[11px] font-semibold ${subtitleTextClass}`}>
                  {subtitleLabel}
                </span>
              </div>
              {summary?.languages?.length ? (
                <p className="text-[10px] text-muted-foreground">
                  Languages: {summary.languages.join(', ')}
                </p>
              ) : null}
              <div className="pt-2">
                <Link
                  to={`/series/${show.id}`}
                  className="block text-center text-xs font-bold px-3 py-2 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 text-primary hover:from-primary hover:to-accent hover:text-primary-foreground transition-all"
                >
                  View Episodes
                </Link>
              </div>
            </div>
          </div>
        );
        })}
      </div>

      {/* Empty State */}
      {filteredSeries.length === 0 && (
        <div className="text-center py-20 space-y-4 animate-fade-in">
          <div className="text-8xl opacity-20 mb-4">📺</div>
          <p className="text-xl font-bold text-foreground">
            {series?.length
              ? 'No series match your search or filters'
              : 'No series found in your library'}
          </p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {series?.length
              ? 'Try adjusting your search query or filter settings'
              : 'Add TV series to your library to see them here'}
          </p>
        </div>
      )}
    </div>
  );
}
