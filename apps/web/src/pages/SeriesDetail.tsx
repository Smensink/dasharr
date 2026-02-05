import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

function formatEpisodeCode(seasonNumber: number, episodeNumber: number) {
  const season = String(seasonNumber).padStart(2, '0');
  const episode = String(episodeNumber).padStart(2, '0');
  return `S${season}E${episode}`;
}

function formatAirDate(date?: string) {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString();
}

export function SeriesDetail() {
  const { id } = useParams();
  const seriesId = Number(id);
  const queryClient = useQueryClient();
  const [actioningKey, setActioningKey] = useState<string | null>(null);
  const [subtitleActionKey, setSubtitleActionKey] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
  });

  const { data: series, isLoading: seriesLoading, error: seriesError } = useQuery({
    queryKey: ['sonarr', 'series', seriesId],
    queryFn: () => api.sonarr.getSeriesById(seriesId),
    enabled: Number.isFinite(seriesId),
  });

  const { data: episodes, isLoading: episodesLoading, error: episodesError } = useQuery({
    queryKey: ['sonarr', 'series', seriesId, 'episodes'],
    queryFn: () => api.sonarr.getSeriesEpisodes(seriesId),
    enabled: Number.isFinite(seriesId),
  });

  const bazarrEnabled = !!health?.services?.bazarr;
  const { data: bazarrEpisodes } = useQuery({
    queryKey: ['bazarr', 'series', seriesId, 'episodes'],
    queryFn: () => api.bazarr.getSeriesEpisodes(seriesId),
    enabled: bazarrEnabled && Number.isFinite(seriesId),
    retry: false,
    staleTime: 60000,
  });

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
    mutationFn: (options: { interactive?: boolean; seasonNumber?: number; episodeIds?: number[] }) =>
      api.sonarr.triggerSearch(seriesId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonarr', 'series', seriesId] });
      queryClient.invalidateQueries({ queryKey: ['sonarr', 'series', seriesId, 'episodes'] });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error || error?.message || 'Failed to start search';
      setNotice('error', message);
    },
  });

  const subtitleSearch = useMutation({
    mutationFn: ({ seriesId, episodeId }: { seriesId: number; episodeId: number }) =>
      api.bazarr.searchEpisode(seriesId, episodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bazarr', 'series', seriesId, 'episodes'] });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error || error?.message || 'Failed to start subtitle search';
      setNotice('error', message);
    },
  });

  const seasons = useMemo(() => {
    if (!episodes) return [];
    const seasonMap = new Map<number, { seasonNumber: number; episodes: any[] }>();

    for (const episode of episodes) {
      const seasonNumber = Number(episode.seasonNumber ?? 0);
      const entry = seasonMap.get(seasonNumber) || {
        seasonNumber,
        episodes: [],
      };
      entry.episodes.push(episode);
      seasonMap.set(seasonNumber, entry);
    }

    const result = Array.from(seasonMap.values()).sort(
      (a, b) => a.seasonNumber - b.seasonNumber
    );
    result.forEach((season) => {
      season.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    });
    return result;
  }, [episodes]);

  const seasonStats = useMemo(() => {
    const statsMap = new Map<number, any>();
    if (!series?.seasons) return statsMap;
    for (const season of series.seasons) {
      statsMap.set(season.seasonNumber, season.statistics);
    }
    return statsMap;
  }, [series?.seasons]);

  const bazarrByEpisodeId = useMemo(() => {
    const map = new Map<number, any>();
    if (bazarrEpisodes) {
      bazarrEpisodes.forEach((entry: any) => {
        const keys = [
          entry.episodeId,
          entry.episodeid,
          entry.episode_id,
          entry.sonarrEpisodeId,
          entry.sonarr_episode_id,
          entry.id,
        ];
        keys.forEach((key) => {
          if (typeof key === 'number') {
            map.set(key, entry);
          }
        });
      });
    }
    return map;
  }, [bazarrEpisodes]);

  const handleSearch = (
    actionKey: string,
    options: { interactive?: boolean; seasonNumber?: number; episodeIds?: number[] },
    label: string
  ) => {
    setActioningKey(actionKey);
    triggerSearch.mutate(options, {
      onSuccess: () => setNotice('success', label),
      onSettled: () => window.setTimeout(() => setActioningKey(null), 400),
    });
  };

  const handleSubtitleSearch = (episodeId: number, label: string) => {
    if (!bazarrEnabled) {
      setNotice('error', 'Bazarr is not connected');
      return;
    }
    const actionKey = `subtitle-${episodeId}`;
    setSubtitleActionKey(actionKey);
    subtitleSearch.mutate(
      { seriesId, episodeId },
      {
        onSuccess: () => setNotice('success', label),
        onSettled: () => window.setTimeout(() => setSubtitleActionKey(null), 400),
      }
    );
  };

  if (!Number.isFinite(seriesId)) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Series</h1>
        <p className="text-muted-foreground">Invalid series id.</p>
      </div>
    );
  }

  if (seriesLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Series</h1>
        <p className="text-muted-foreground">Loading series...</p>
      </div>
    );
  }

  if (seriesError) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Series</h1>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">
            Failed to load series. Make sure Sonarr is configured and running.
          </p>
        </div>
      </div>
    );
  }

  const posterUrl =
    series?.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl ||
    series?.images?.find((img: any) => img.coverType === 'poster')?.url ||
    null;

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      <div className="space-y-2">
        <Link
          to="/series"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back to Series
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={series?.title}
              className="w-28 h-40 rounded-lg object-cover border"
            />
          ) : (
            <div className="w-28 h-40 rounded-lg border bg-muted flex items-center justify-center text-3xl">
              📺
            </div>
          )}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">{series?.title}</h1>
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              <span>{series?.year}</span>
              <span>•</span>
              <span>{series?.seasonCount} season{series?.seasonCount !== 1 ? 's' : ''}</span>
              <span>•</span>
              <span>{series?.episodeFileCount}/{series?.episodeCount} episodes</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  handleSearch('series-auto', { interactive: false }, 'Series search started')
                }
                disabled={actioningKey === 'series-auto'}
                className="text-xs px-3 py-1.5 rounded-lg border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actioningKey === 'series-auto' ? 'Searching...' : '🔎 Auto Search'}
              </button>
              <button
                onClick={() =>
                  handleSearch('series-interactive', { interactive: true }, 'Interactive search started')
                }
                disabled={actioningKey === 'series-interactive'}
                className="text-xs px-3 py-1.5 rounded-lg border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actioningKey === 'series-interactive' ? 'Searching...' : '🧭 Interactive Search'}
              </button>
            </div>
          </div>
        </div>
        {series?.overview && (
          <p className="text-sm text-muted-foreground max-w-3xl">{series.overview}</p>
        )}
      </div>

      {actionNotice && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            actionNotice.type === 'success'
              ? 'border-green-500/30 bg-green-500/10 text-green-600'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {actionNotice.message}
        </div>
      )}

      {episodesLoading && (
        <p className="text-muted-foreground">Loading episodes...</p>
      )}

      {episodesError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">Failed to load episodes.</p>
        </div>
      )}

      <div className="space-y-4">
        {seasons.map((season) => {
          const stats = seasonStats.get(season.seasonNumber);
          const seasonKey = `season-${season.seasonNumber}`;

          return (
            <details key={seasonKey} className="rounded-lg border bg-card p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Season {season.seasonNumber}
                    </h2>
                    {stats && (
                      <p className="text-xs text-muted-foreground">
                        {stats.episodeFileCount}/{stats.episodeCount} episodes
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={(event) => {
                        event.preventDefault();
                        handleSearch(
                          `${seasonKey}-auto`,
                          { interactive: false, seasonNumber: season.seasonNumber },
                          `Season ${season.seasonNumber} search started`
                        );
                      }}
                      disabled={actioningKey === `${seasonKey}-auto`}
                      className="text-xs px-3 py-1.5 rounded-lg border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actioningKey === `${seasonKey}-auto` ? 'Searching...' : '🔎 Auto'}
                    </button>
                    <button
                      onClick={(event) => {
                        event.preventDefault();
                        handleSearch(
                          `${seasonKey}-interactive`,
                          { interactive: true, seasonNumber: season.seasonNumber },
                          `Season ${season.seasonNumber} interactive search started`
                        );
                      }}
                      disabled={actioningKey === `${seasonKey}-interactive`}
                      className="text-xs px-3 py-1.5 rounded-lg border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actioningKey === `${seasonKey}-interactive` ? 'Searching...' : '🧭 Interactive'}
                    </button>
                  </div>
                </div>
              </summary>

              <div className="mt-4 space-y-2">
                {season.episodes.map((episode) => {
                  const status = episode.hasFile
                    ? 'Available'
                    : episode.monitored
                      ? 'Wanted'
                      : 'Missing';
                  const actionKey = `episode-${episode.id}`;
                  const subtitleStatus = bazarrByEpisodeId.get(episode.id);
                  const subtitleLabel = subtitleStatus?.status
                    ? subtitleStatus.status === 'available'
                      ? 'Subtitles: Available'
                      : subtitleStatus.status === 'missing'
                        ? 'Subtitles: Missing'
                        : 'Subtitles: Unknown'
                    : 'Subtitles: Unknown';

                  return (
                    <div
                      key={episode.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)} • {episode.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatAirDate(episode.airDateUtc || episode.airDate)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">{status}</span>
                        {bazarrEnabled && (
                          <span
                            className={`text-[11px] font-semibold ${
                              subtitleStatus?.status === 'available'
                                ? 'text-success'
                                : subtitleStatus?.status === 'missing'
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                            }`}
                            title={subtitleLabel}
                          >
                            CC {subtitleStatus?.status === 'available' ? 'OK' : subtitleStatus?.status === 'missing' ? 'Missing' : 'Unknown'}
                          </span>
                        )}
                        <button
                          onClick={() =>
                            handleSearch(
                              `${actionKey}-auto`,
                              { interactive: false, episodeIds: [episode.id] },
                              `Episode ${formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)} search started`
                            )
                          }
                          disabled={actioningKey === `${actionKey}-auto`}
                          className="text-xs px-2 py-1 rounded-lg border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actioningKey === `${actionKey}-auto` ? 'Searching...' : '🔎 Auto'}
                        </button>
                        <button
                          onClick={() =>
                            handleSearch(
                              `${actionKey}-interactive`,
                              { interactive: true, episodeIds: [episode.id] },
                              `Episode ${formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)} interactive search started`
                            )
                          }
                          disabled={actioningKey === `${actionKey}-interactive`}
                          className="text-xs px-2 py-1 rounded-lg border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actioningKey === `${actionKey}-interactive` ? 'Searching...' : '🧭 Interactive'}
                        </button>
                        {bazarrEnabled && (
                          <button
                            onClick={() =>
                              handleSubtitleSearch(
                                episode.id,
                                `Subtitle search started for ${formatEpisodeCode(
                                  episode.seasonNumber,
                                  episode.episodeNumber
                                )}`
                              )
                            }
                            disabled={subtitleActionKey === `subtitle-${episode.id}`}
                            className="text-xs px-2 py-1 rounded-lg border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {subtitleActionKey === `subtitle-${episode.id}` ? 'Searching...' : '💬 Subs'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
