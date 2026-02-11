import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import type {
  DiscoverMediaItem,
  DiscoverSectionsResponse,
  GameSearchResult,
} from '@shared/index';
import { DiscoverSection } from '@/components/discover/DiscoverSection';
import { GameDiscoverSection } from '@/components/discover/GameDiscoverSection';

const sectionMeta: Record<
  string,
  { icon: string; accentClass: string }
> = {
  'trending-movies': {
    icon: '🔥',
    accentClass: 'bg-gradient-to-br from-orange-500/20 to-amber-500/10 border-orange-500/30',
  },
  'trending-series': {
    icon: '📺',
    accentClass: 'bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/30',
  },
  'popular-movies': {
    icon: '💥',
    accentClass: 'bg-gradient-to-br from-primary/20 to-accent/10 border-primary/30',
  },
  'popular-series': {
    icon: '🌟',
    accentClass: 'bg-gradient-to-br from-indigo-500/20 to-blue-500/10 border-indigo-500/30',
  },
  'now-playing': {
    icon: '🎟️',
    accentClass: 'bg-gradient-to-br from-rose-500/20 to-red-500/10 border-rose-500/30',
  },
  upcoming: {
    icon: '⏳',
    accentClass: 'bg-gradient-to-br from-emerald-500/20 to-green-500/10 border-emerald-500/30',
  },
  'anticipated-movies': {
    icon: '🧭',
    accentClass: 'bg-gradient-to-br from-yellow-500/20 to-amber-500/10 border-yellow-500/30',
  },
  'anticipated-series': {
    icon: '🚀',
    accentClass: 'bg-gradient-to-br from-sky-500/20 to-indigo-500/10 border-sky-500/30',
  },
  oscars: {
    icon: '🏆',
    accentClass: 'bg-gradient-to-br from-yellow-500/25 to-orange-500/10 border-yellow-500/40',
  },
  'oscars-nominations': {
    icon: '🏅',
    accentClass: 'bg-gradient-to-br from-amber-500/25 to-yellow-500/10 border-amber-500/40',
  },
  emmys: {
    icon: '🎭',
    accentClass: 'bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/30',
  },
  'emmys-nominations': {
    icon: '🎟️',
    accentClass: 'bg-gradient-to-br from-pink-500/20 to-purple-500/10 border-pink-500/30',
  },
  'golden-globes': {
    icon: '✨',
    accentClass: 'bg-gradient-to-br from-amber-500/25 to-yellow-500/10 border-amber-500/40',
  },
  'golden-globes-nominations': {
    icon: '💫',
    accentClass: 'bg-gradient-to-br from-yellow-500/25 to-amber-500/10 border-yellow-500/40',
  },
  cannes: {
    icon: '🎬',
    accentClass: 'bg-gradient-to-br from-red-500/20 to-orange-500/10 border-red-500/30',
  },
  'cannes-nominations': {
    icon: '🎞️',
    accentClass: 'bg-gradient-to-br from-orange-500/20 to-red-500/10 border-orange-500/30',
  },
  aacta: {
    icon: '🇦🇺',
    accentClass: 'bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/30',
  },
  'aacta-nominations': {
    icon: '🏅',
    accentClass: 'bg-gradient-to-br from-teal-500/20 to-emerald-500/10 border-teal-500/30',
  },
};

export function Discover() {
  const queryClient = useQueryClient();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [hiddenIds, setHiddenIds] = useState<Record<string, boolean>>({});
  const [monitoringId, setMonitoringId] = useState<number | null>(null);
  const [monitoredIds, setMonitoredIds] = useState<Record<number, boolean>>({});
  const [actionNotice, setActionNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const defaultsRef = useRef<Record<string, any>>({});

  const { data, isLoading, error } = useQuery<DiscoverSectionsResponse>({
    queryKey: ['discover', 'sections'],
    queryFn: () => api.discover.getSections(),
    refetchInterval: 10 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
    placeholderData: (previous) => previous,
  });

  const {
    data: anticipatedGames,
    isLoading: anticipatedGamesLoading,
    error: anticipatedGamesError,
  } = useQuery<GameSearchResult[]>({
    queryKey: ['games', 'anticipated', 20],
    queryFn: () => api.games.getAnticipated(20),
    staleTime: 10 * 60 * 1000,
    placeholderData: (previous) => previous,
  });

  const {
    data: topGames,
    isLoading: topGamesLoading,
    error: topGamesError,
  } = useQuery<GameSearchResult[]>({
    queryKey: ['games', 'top-rated', 20],
    queryFn: () => api.games.getTopRated(20),
    staleTime: 10 * 60 * 1000,
    placeholderData: (previous) => previous,
  });

  const {
    data: simpleIndieGames,
    isLoading: simpleIndieGamesLoading,
    error: simpleIndieGamesError,
  } = useQuery<GameSearchResult[]>({
    queryKey: ['games', 'simple-indie', 20],
    queryFn: () => api.games.getSimpleIndie(20),
    staleTime: 10 * 60 * 1000,
    placeholderData: (previous) => previous,
  });
  const filteredSections = useMemo(() => {
    if (!data?.sections) return data;
    const addedKeys = new Set(Object.keys(addedIds || {}));
    if (addedKeys.size === 0) return data;
    return {
      ...data,
      sections: data.sections.map((section) => ({
        ...section,
        items: Array.isArray(section.items)
          ? section.items.filter((item) => !addedKeys.has(item.id))
          : [],
      })),
    };
  }, [data, addedIds]);

  const gamesSectionCount =
    (anticipatedGames?.length ? 1 : 0) +
    (simpleIndieGames?.length ? 1 : 0) +
    (topGames?.length ? 1 : 0);
  const totalSectionCount =
    (filteredSections?.sections?.length || 0) + gamesSectionCount;
  const totalItemCount =
    (filteredSections?.sections?.reduce((total, section) => {
      const items = Array.isArray(section.items) ? section.items : [];
      return total + items.filter((item) => !hiddenIds[item.id]).length;
    }, 0) || 0) +
    (anticipatedGames?.length || 0) +
    (simpleIndieGames?.length || 0) +
    (topGames?.length || 0);

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

  const pickDefaultProfile = (profiles: any[]) =>
    profiles.find((profile) => profile.isDefault || profile.default || profile.isDefaultProfile) ||
    profiles[0];

  const pickDefaultRootFolder = (folders: any[]) =>
    folders.find((folder) => folder.isDefault || folder.default) || folders[0];

  const getRadarrDefaults = async () => {
    if (defaultsRef.current.radarr) return defaultsRef.current.radarr;
    const [profiles, rootFolders] = await Promise.all([
      api.radarr.getProfiles(),
      api.radarr.getRootFolders(),
    ]);
    const profile = pickDefaultProfile(profiles || []);
    const folder = pickDefaultRootFolder(rootFolders || []);
    if (!profile || !folder) {
      throw new Error('Radarr defaults are not configured');
    }
    const defaults = {
      qualityProfileId: profile.id,
      rootFolderPath: folder.path || folder.rootFolderPath,
    };
    defaultsRef.current.radarr = defaults;
    return defaults;
  };

  const getSonarrDefaults = async () => {
    if (defaultsRef.current.sonarr) return defaultsRef.current.sonarr;
    const [profiles, rootFolders] = await Promise.all([
      api.sonarr.getProfiles(),
      api.sonarr.getRootFolders(),
    ]);
    const profile = pickDefaultProfile(profiles || []);
    const folder = pickDefaultRootFolder(rootFolders || []);
    if (!profile || !folder) {
      throw new Error('Sonarr defaults are not configured');
    }
    const defaults = {
      qualityProfileId: profile.id,
      rootFolderPath: folder.path || folder.rootFolderPath,
    };
    defaultsRef.current.sonarr = defaults;
    return defaults;
  };

  const handleAdd = async (item: DiscoverMediaItem) => {
    setAddingId(item.id);
    try {
      if (item.inLibrary) {
        setNotice('success', `${item.title} is already in your library`);
        return;
      }

      if (item.mediaType === 'movie') {
        if (!item.tmdbId) {
          throw new Error('Missing TMDB ID for this movie');
        }
        const releaseYear =
          item.year ||
          (item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined);
        if (!releaseYear) {
          throw new Error('Missing release year for this movie');
        }
        const defaults = await getRadarrDefaults();
        await api.radarr.addMovie({
          title: item.title,
          tmdbId: item.tmdbId,
          year: releaseYear,
          qualityProfileId: defaults.qualityProfileId,
          rootFolderPath: defaults.rootFolderPath,
          monitored: true,
        });
      } else {
        let tvdbId = item.tvdbId;
        if (!tvdbId && item.tmdbId) {
          const resolved = await api.discover.resolveExternalIds(
            'series',
            item.tmdbId
          );
          tvdbId = resolved.tvdbId;
        }
        if (!tvdbId) {
          throw new Error('Missing TVDB ID for this series');
        }
        const defaults = await getSonarrDefaults();
        await api.sonarr.addSeries({
          title: item.title,
          tvdbId,
          qualityProfileId: defaults.qualityProfileId,
          rootFolderPath: defaults.rootFolderPath,
          seasonFolder: true,
          monitored: true,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['discover', 'sections'] });
      setAddedIds((prev) => ({ ...prev, [item.id]: true }));
      window.setTimeout(() => {
        setHiddenIds((prev) => ({ ...prev, [item.id]: true }));
        setAddedIds((prev) => {
          const { [item.id]: _, ...rest } = prev;
          return rest;
        });
      }, 1600);
      setNotice('success', `${item.title} added to ${item.mediaType} library`);
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to add item';
      setNotice('error', message);
    } finally {
      window.setTimeout(() => setAddingId(null), 400);
    }
  };

  const handleDismiss = (id: string) => {
    setHiddenIds((prev) => ({ ...prev, [id]: true }));
  };

  const handleDismissGame = (igdbId: number) => {
    setHiddenIds((prev) => ({ ...prev, [`game-${igdbId}`]: true }));
  };

  const handleMonitorGame = async (game: GameSearchResult) => {
    setMonitoringId(game.igdbId);
    try {
      if (game.isMonitored) {
        setNotice('success', `${game.name} is already monitored`);
        return;
      }

      await api.games.monitor(game.igdbId, {
        preferredReleaseType: 'scene',
        preferredPlatforms: game.platforms.length > 0 ? game.platforms : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ['games'] });
      setMonitoredIds((prev) => ({ ...prev, [game.igdbId]: true }));
      window.setTimeout(() => {
        setHiddenIds((prev) => ({ ...prev, [`game-${game.igdbId}`]: true }));
        setMonitoredIds((prev) => {
          const { [game.igdbId]: _, ...rest } = prev;
          return rest;
        });
      }, 1600);
      setNotice('success', `${game.name} added to monitoring`);
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to monitor game';
      setNotice('error', message);
    } finally {
      window.setTimeout(() => setMonitoringId(null), 400);
    }
  };

  return (
    <div className="space-y-10 pb-20 md:pb-8 animate-fade-in">
      {/* Header */}
      <div className="space-y-6 animate-slide-down">
        <div className="rounded-3xl border border-border/50 bg-gradient-to-br from-background via-card-elevated/60 to-background-elevated/70 p-8 shadow-2xl shadow-primary/5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-primary mb-3">
                Discover
              </p>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-3">
                Find what to watch next
              </h1>
              <p className="text-muted-foreground text-base max-w-2xl">
                Trending picks, upcoming premieres, and award-winning favorites
                curated across TMDB, Trakt, and IMDb.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-primary/10 border border-primary/30 px-5 py-4 text-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Sections
                </p>
                <p className="text-3xl font-extrabold text-primary">
                  {totalSectionCount}
                </p>
              </div>
              <div className="rounded-2xl bg-accent/10 border border-accent/30 px-5 py-4 text-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Items
                </p>
                <p className="text-3xl font-extrabold text-foreground">
                  {totalItemCount}
                </p>
              </div>
            </div>
          </div>
        </div>

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
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-destructive">
          Failed to load Discover data. Check your TMDB/Trakt/OMDb configuration.
        </div>
      )}

      {(anticipatedGamesError || topGamesError || simpleIndieGamesError) && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-600">
          Games data is unavailable. Check your IGDB configuration.
        </div>
      )}

      {(isLoading || !data) && !error ? (
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <DiscoverSection
              key={`loading-${index}`}
              title="Loading..."
              items={[]}
              isLoading
            />
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight">Games Spotlight</h2>
                <p className="text-sm text-muted-foreground">
                  Highly anticipated releases and all-time greats from IGDB.
                </p>
              </div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Games
              </div>
            </div>

            <GameDiscoverSection
              title="Highly Anticipated Games"
              description="Upcoming games with the most hype"
              items={(anticipatedGames || []).filter((game) => !hiddenIds[`game-${game.igdbId}`])}
              isLoading={anticipatedGamesLoading}
              icon="🚀"
              accentClass="bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/30"
              onDismiss={handleDismissGame}
              onMonitor={handleMonitorGame}
              monitoringId={monitoringId}
              monitoredIds={monitoredIds}
            />

            <GameDiscoverSection
              title="Highly Rated Simple Indie Picks"
              description="Puzzle, platformer, roguelite, and indie gems with strong ratings"
              items={(simpleIndieGames || []).filter((game) => !hiddenIds[`game-${game.igdbId}`])}
              isLoading={simpleIndieGamesLoading}
              icon="🧩"
              accentClass="bg-gradient-to-br from-fuchsia-500/20 to-indigo-500/10 border-fuchsia-500/30"
              onDismiss={handleDismissGame}
              onMonitor={handleMonitorGame}
              monitoringId={monitoringId}
              monitoredIds={monitoredIds}
            />

            <GameDiscoverSection
              title="Top Games of All Time"
              description="Critically acclaimed and top-rated classics"
              items={(topGames || []).filter((game) => !hiddenIds[`game-${game.igdbId}`])}
              isLoading={topGamesLoading}
              icon="🏆"
              accentClass="bg-gradient-to-br from-yellow-500/20 to-amber-500/10 border-yellow-500/30"
              onDismiss={handleDismissGame}
              onMonitor={handleMonitorGame}
              monitoringId={monitoringId}
              monitoredIds={monitoredIds}
            />
          </div>
          {filteredSections?.sections?.map((section) => {
            const meta = sectionMeta[section.key] || {
              icon: '✨',
              accentClass: 'bg-gradient-to-br from-primary/20 to-accent/20 border-primary/30',
            };
            const safeItems = Array.isArray(section.items) ? section.items : [];
            const visibleItems = safeItems.filter(
              (item) => !hiddenIds[item.id]
            );
            return (
              <DiscoverSection
                key={section.key}
                title={section.title}
                description={section.description}
                items={visibleItems}
                icon={meta.icon}
                accentClass={meta.accentClass}
                onAdd={handleAdd}
                onDismiss={handleDismiss}
                addingId={addingId}
                addedIds={addedIds}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
