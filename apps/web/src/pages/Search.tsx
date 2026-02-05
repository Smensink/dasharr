import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api/client';
import { ServiceIcon } from '@/components/ServiceIcon';

interface SearchResult {
  title: string;
  overview?: string;
  year?: number;
  imdbId?: string;
  tmdbId?: number;
  tvdbId?: number;
  foreignId?: string;
  foreignBookId?: string;
  authorTitle?: string;
  inLibrary?: boolean;
  service: 'radarr' | 'sonarr' | 'readarr';
  mediaType: 'movie' | 'series' | 'book';
  images?: Array<{
    coverType: string;
    url?: string;
    remoteUrl?: string;
  }>;
  remotePoster?: string;
  titleSlug?: string;
  author?: string;
  authorId?: number;
  authorDetails?: any;
  authorInfo?: any;
  authorObject?: any;
  ratings?: {
    imdb?: { value: number; votes?: number };
    tmdb?: { value: number; votes?: number };
    rottenTomatoes?: { value: number; votes?: number };
    metacritic?: { value: number; votes?: number };
    value?: number;
    votes?: number;
  };
}

interface ReadarrAuthorLookup {
  authorName?: string;
  authorNameLastFirst?: string;
  cleanName?: string;
  foreignAuthorId?: string;
}

interface SearchResponse {
  query: string;
  totalResults: number;
  results: SearchResult[];
}

export function Search() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>(['radarr', 'sonarr', 'readarr']);
  const [selectedMediaTypes, setSelectedMediaTypes] = useState<string[]>(['movie', 'series', 'book']);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const defaultsRef = useRef<Record<string, any>>({});

  // Handle URL query parameter from quick search
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery) {
      setSearchQuery(urlQuery);
      setActiveQuery(urlQuery);
      // Clear the query param after processing
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', activeQuery],
    queryFn: async () => {
      if (!activeQuery) return null;
      const response = await api.get<SearchResponse>(`/search?q=${encodeURIComponent(activeQuery)}`);
      return response;
    },
    enabled: !!activeQuery,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActiveQuery(searchQuery.trim());
    }
  };

  const renderServiceIcon = (service: string, size: number, className: string = '') => (
    <ServiceIcon service={service} size={size} className={className} />
  );

  const getServiceColor = (service: string) => {
    switch (service) {
      case 'radarr':
        return 'from-yellow-500/20 to-yellow-500/5 border-yellow-500/30';
      case 'sonarr':
        return 'from-blue-500/20 to-blue-500/5 border-blue-500/30';
      case 'readarr':
        return 'from-green-500/20 to-green-500/5 border-green-500/30';
      default:
        return 'from-gray-500/20 to-gray-500/5 border-gray-500/30';
    }
  };

  const getPosterUrl = (result: SearchResult) => {
    if (result.remotePoster) return result.remotePoster;
    const poster = result.images?.find((img) => img.coverType === 'poster');
    return poster?.remoteUrl || poster?.url || null;
  };

  const getRatingDisplay = (
    result: SearchResult
  ): { label: string; value: number; format: 'percent' | 'score' } | null => {
    const normalize = (value?: number | null) =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;

    if (result.mediaType === 'movie' || result.service === 'radarr') {
      const rt = normalize(result.ratings?.rottenTomatoes?.value);
      if (rt !== null) return { label: 'RT', value: rt, format: 'percent' as const };
      const imdb = normalize(result.ratings?.imdb?.value);
      if (imdb !== null) return { label: 'IMDb', value: imdb, format: 'score' as const };
      const tmdb = normalize(result.ratings?.tmdb?.value);
      if (tmdb !== null) return { label: 'TMDB', value: tmdb, format: 'score' as const };
      const meta = normalize(result.ratings?.metacritic?.value);
      if (meta !== null) return { label: 'MC', value: meta, format: meta > 10 ? 'percent' : 'score' };
    }

    if (result.mediaType === 'series' || result.service === 'sonarr') {
      const tvdb = normalize(result.ratings?.value);
      if (tvdb !== null) return { label: 'TVDB', value: tvdb, format: 'score' as const };
      const imdb = normalize(result.ratings?.imdb?.value);
      if (imdb !== null) return { label: 'IMDb', value: imdb, format: 'score' as const };
    }

    if (result.mediaType === 'book' || result.service === 'readarr') {
      const goodreads = normalize(result.ratings?.value);
      if (goodreads !== null) return { label: 'Goodreads', value: goodreads, format: 'score' as const };
    }

    return null;
  };

  const formatRatingValue = (rating: { value: number; format: 'percent' | 'score' }) => {
    if (rating.format === 'percent' || rating.value > 10) {
      return `${Math.round(rating.value)}%`;
    }
    return rating.value.toFixed(1);
  };

  const sanitizeAuthorName = (raw?: string, title?: string) => {
    if (!raw) return null;
    const trimmed = raw.trim().replace(/[,:;]$/, '').trim();
    const normalizedTitle = title?.trim().toLowerCase();
    const normalizedRaw = trimmed.toLowerCase();
    if (normalizedTitle && normalizedRaw.includes(normalizedTitle)) {
      const idx = normalizedRaw.indexOf(normalizedTitle);
      if (idx > 0) {
        const beforeTitle = trimmed.slice(0, idx).trim();
        return beforeTitle.replace(/[,:;]+$/, '').trim() || null;
      }
    }
    return trimmed;
  };

  const guessReadarrAuthorName = (result: SearchResult): string | null => {
    const candidateSources = [
      (result as any).author?.authorName,
      (result as any).author?.authorNameLastFirst,
      (result as any).authorDetails?.authorName,
      (result as any).authorInfo?.authorName,
      (result as any).authorObject?.authorName,
      (result as any).author?.authorTitle,
      (result as any).author?.title,
      result.authorTitle,
      result.author,
    ];
    for (const source of candidateSources) {
      const sanitized = sanitizeAuthorName(source, result.title);
      if (sanitized) {
        return sanitized;
      }
    }
    return null;
  };

  const resolveReadarrAuthorForeignId = async (result: SearchResult): Promise<string | null> => {
    const authorName = guessReadarrAuthorName(result);
    if (!authorName) {
      return null;
    }

    try {
      const matches = (await api.readarr.lookupAuthors(authorName)) as ReadarrAuthorLookup[];
      if (!matches || matches.length === 0) {
        return null;
      }

      const normalizedTarget = authorName.toLowerCase();
      const exactMatch =
        matches.find(
          (author) =>
            (author.authorName?.toLowerCase() === normalizedTarget ||
              author.authorNameLastFirst?.toLowerCase() === normalizedTarget ||
              author.cleanName?.toLowerCase() === normalizedTarget) &&
            !!author.foreignAuthorId
        ) || matches.find((author) => !!author.foreignAuthorId);

      const winner = exactMatch || matches[0];
      return winner?.foreignAuthorId || null;
    } catch (error) {
      console.warn('Readarr author lookup failed', error);
      return null;
    }
  };

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

  const getReadarrDefaults = async () => {
    if (defaultsRef.current.readarr) return defaultsRef.current.readarr;
    const [profiles, metadataProfiles, rootFolders] = await Promise.all([
      api.readarr.getProfiles(),
      api.readarr.getMetadataProfiles(),
      api.readarr.getRootFolders(),
    ]);
    const audiobookProfile =
      (profiles || []).find((profile: any) => /audio|audiobook/i.test(profile.name)) ||
      pickDefaultProfile(profiles || []);
    const metadataProfile = pickDefaultProfile(metadataProfiles || []);
    const folder = pickDefaultRootFolder(rootFolders || []);
    if (!audiobookProfile || !metadataProfile || !folder) {
      throw new Error('Readarr defaults are not configured');
    }
    const defaults = {
      qualityProfileId: audiobookProfile.id,
      metadataProfileId: metadataProfile.id,
      rootFolderPath: folder.path || folder.rootFolderPath,
    };
    defaultsRef.current.readarr = defaults;
    return defaults;
  };

  const getResultKey = (result: SearchResult) => {
    const id =
      result.tmdbId ||
      result.tvdbId ||
      result.foreignBookId ||
      result.foreignId ||
      result.imdbId ||
      result.title;
    return `${result.service}:${id}`;
  };

  const handleAdd = async (result: SearchResult) => {
    const key = getResultKey(result);
    setAddingKey(key);
    try {
      if (result.service === 'radarr') {
        if (!result.tmdbId) {
          throw new Error('Missing TMDB id for this movie');
        }
        const defaults = await getRadarrDefaults();
        await api.radarr.addMovie({
          title: result.title,
          tmdbId: result.tmdbId,
          year: result.year,
          qualityProfileId: defaults.qualityProfileId,
          rootFolderPath: defaults.rootFolderPath,
          monitored: true,
        });
      } else if (result.service === 'sonarr') {
        if (!result.tvdbId) {
          throw new Error('Missing TVDB id for this series');
        }
        const defaults = await getSonarrDefaults();
        await api.sonarr.addSeries({
          title: result.title,
          tvdbId: result.tvdbId,
          qualityProfileId: defaults.qualityProfileId,
          rootFolderPath: defaults.rootFolderPath,
          seasonFolder: true,
          monitored: true,
        });
      } else if (result.service === 'readarr') {
        const foreignBookId =
          (result as any).foreignBookId || result.foreignId || (result as any).foreignBookId;
        const authorName = guessReadarrAuthorName(result);
        const authorPayload =
          (result as any).author ||
          (result as any).authorDetails ||
          (result as any).authorInfo ||
          (result as any).authorObject;
        let foreignAuthorId =
          authorPayload?.foreignAuthorId ||
          authorPayload?.id ||
          (result as any).foreignAuthorId ||
          (result as any).authorForeignId;

        if (!foreignAuthorId) {
          foreignAuthorId = await resolveReadarrAuthorForeignId(result);
        }

        if (!foreignBookId || !foreignAuthorId) {
          throw new Error('Missing author or book identifiers for this result');
        }

        const defaults = await getReadarrDefaults();
        await api.readarr.addBook({
          author: {
            foreignAuthorId,
            authorName: authorName || authorPayload?.authorName || authorPayload?.authorNameLastFirst,
            authorNameLastFirst: authorPayload?.authorNameLastFirst,
            qualityProfileId: defaults.qualityProfileId,
            metadataProfileId: defaults.metadataProfileId,
            monitored: true,
            rootFolderPath: defaults.rootFolderPath,
          },
          book: {
            foreignBookId,
            title: result.title,
            monitored: true,
            anyEditionOk: true,
          },
        });
      }

      queryClient.invalidateQueries({ queryKey: ['search'] });
      setNotice('success', `${result.title} added to ${result.service}`);
    } catch (error: any) {
      let message = 'Failed to add item';

      // Handle various error formats
      if (error?.response?.data?.error) {
        const errorData = error.response.data.error;
        message = typeof errorData === 'string' ? errorData : errorData.message || JSON.stringify(errorData);
      } else if (error?.response?.data?.message) {
        message = error.response.data.message;
      } else if (error?.message) {
        message = error.message;
      }

      setNotice('error', message);
    } finally {
      window.setTimeout(() => setAddingKey(null), 400);
    }
  };

  const toggleService = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  };

  const toggleMediaType = (type: string) => {
    setSelectedMediaTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleSection = (service: string) => {
    setCollapsedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(service)) {
        newSet.delete(service);
      } else {
        newSet.add(service);
      }
      return newSet;
    });
  };

  const filteredResults = useMemo(() => {
    if (!data?.results) return [];
    return data.results.filter(
      (result) =>
        selectedServices.includes(result.service) &&
        selectedMediaTypes.includes(result.mediaType)
    );
  }, [data?.results, selectedServices, selectedMediaTypes]);

  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {
      radarr: [],
      sonarr: [],
      readarr: [],
    };
    filteredResults.forEach((result) => {
      const serviceGroup = groups[result.service];
      if (serviceGroup) {
        serviceGroup.push(result);
      }
    });
    return groups;
  }, [filteredResults]);

  return (
    <div className="space-y-8 pb-20 md:pb-8 animate-fade-in">
      {/* Header Section */}
      <div className="space-y-6 animate-slide-down">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">Search</h1>
          <p className="text-muted-foreground text-base">
            Discover movies, TV shows, and books across all your services
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch}>
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <label className="text-sm font-bold text-foreground uppercase tracking-wide">Search Media</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl">
                🔍
              </div>
              <input
                type="text"
                placeholder="Search for movies, TV shows, or books..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border/50 bg-background-elevated/60 pl-14 pr-32 py-4 text-base font-medium ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary/50 transition-all"
              />
              <button
                type="submit"
                disabled={!searchQuery.trim() || isFetching}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold text-sm hover:shadow-lg hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isFetching ? 'Searching...' : 'Search'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              Search across Radarr, Sonarr, and Readarr simultaneously
            </p>
          </div>
        </form>
      </div>

      {!activeQuery && (
        <div className="text-center py-20 space-y-4 animate-fade-in">
          <div className="text-8xl opacity-20 mb-4">🔍</div>
          <p className="text-xl font-bold text-foreground">Start your search</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Enter a search term to find movies, TV shows, and books across all your services
          </p>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Searching...</p>
        </div>
      )}

      {data && !isLoading && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="glass-card rounded-2xl p-6 space-y-5 animate-slide-down">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold tracking-tight">Filters</h3>
              <p className="text-sm text-muted-foreground font-medium">
                Showing <span className="text-primary font-bold">{filteredResults.length}</span> of <span className="text-foreground font-bold">{data.totalResults}</span> results for "{data.query}"
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {/* Service filters */}
              <div>
                <p className="text-sm font-bold mb-3 uppercase tracking-wide">Services</p>
                <div className="flex flex-wrap gap-2">
                  {['radarr', 'sonarr', 'readarr'].map((service) => (
                    <button
                      key={service}
                      onClick={() => toggleService(service)}
                      className={`text-xs font-bold px-4 py-2.5 rounded-xl border transition-all duration-300 capitalize ${
                        selectedServices.includes(service)
                          ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground border-primary/30 shadow-lg shadow-primary/30'
                          : 'bg-card-elevated/50 text-muted-foreground border-border/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {renderServiceIcon(service, 18)}
                        {service}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Media type filters */}
              <div>
                <p className="text-sm font-bold mb-3 uppercase tracking-wide">Media Types</p>
                <div className="flex flex-wrap gap-2">
                  {['movie', 'series', 'book'].map((type) => (
                    <button
                      key={type}
                      onClick={() => toggleMediaType(type)}
                      className={`text-xs font-bold px-4 py-2.5 rounded-xl border capitalize transition-all duration-300 ${
                        selectedMediaTypes.includes(type)
                          ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground border-primary/30 shadow-lg shadow-primary/30'
                          : 'bg-card-elevated/50 text-muted-foreground border-border/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
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

          {/* Results by service */}
          {filteredResults.length === 0 ? (
            <div className="text-center py-20 space-y-4 animate-fade-in">
              <div className="text-8xl opacity-20 mb-4">📭</div>
              <p className="text-xl font-bold text-foreground">No results match your filters</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Try adjusting your filter settings or search query
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedResults).map(([service, results], idx) => {
                if (results.length === 0) return null;
                const isCollapsed = collapsedSections.has(service);

                return (
                  <div
                    key={service}
                    className="rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm overflow-hidden animate-slide-up"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    {/* Service header */}
                    <button
                      onClick={() => toggleSection(service)}
                      className="w-full flex items-center justify-between p-6 hover:bg-primary/5 transition-all duration-300 group"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${getServiceColor(service)} border flex items-center justify-center`}>
                          {renderServiceIcon(service, 32)}
                        </div>
                        <div className="text-left">
                          <h3 className="font-bold text-2xl tracking-tight capitalize group-hover:text-primary transition-colors">{service}</h3>
                          <p className="text-sm text-muted-foreground font-medium">
                            {results.length} result{results.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-2xl transition-transform duration-300" style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>
                        ▼
                      </div>
                    </button>

                    {/* Results grid */}
                    {!isCollapsed && (
                      <div className="border-t border-border/30 p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                          {results.map((result, resultIdx) => {
                            const posterUrl = getPosterUrl(result);
                            const resultKey = getResultKey(result);
                            const isAdding = addingKey === resultKey;
                            const inLibrary = result.inLibrary === true;
                            const rating = getRatingDisplay(result);

                            return (
                              <div
                                key={resultKey}
                                className="group relative rounded-2xl border border-border/50 bg-background-elevated/60 backdrop-blur-sm overflow-hidden hover:shadow-xl hover:shadow-primary/10 hover:border-primary/30 transition-all duration-500 animate-scale-in"
                                style={{ animationDelay: `${resultIdx * 40}ms` }}
                              >
                                <div className="flex gap-4 p-4">
                                  {posterUrl ? (
                                    <img
                                      src={posterUrl}
                                      alt={result.title}
                                      className="w-24 h-36 object-cover rounded-xl border border-border/50 flex-shrink-0 group-hover:scale-105 transition-transform duration-500"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="w-24 h-36 bg-gradient-to-br from-muted to-background rounded-xl border border-border/50 flex items-center justify-center flex-shrink-0">
                                      {renderServiceIcon(result.service, 36)}
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0 space-y-2">
                                    <h3 className="font-bold text-sm line-clamp-2 text-foreground group-hover:text-primary transition-colors leading-tight" title={result.title}>
                                      {result.title}
                                    </h3>
                                    {result.year && (
                                      <p className="text-xs text-muted-foreground font-semibold">{result.year}</p>
                                    )}
                                    {result.author && (
                                      <p className="text-xs text-muted-foreground font-semibold line-clamp-1">{result.author}</p>
                                    )}

                                    <div className="flex flex-wrap gap-1.5">
                                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-background/60 backdrop-blur-sm border border-border/50 uppercase tracking-wide capitalize">
                                        {result.mediaType}
                                      </span>
                                      {rating && (
                                        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary uppercase tracking-wide">
                                          {rating.label} {formatRatingValue(rating)}
                                        </span>
                                      )}
                                      {inLibrary && (
                                        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-success/20 border border-success/30 text-success uppercase tracking-wide flex items-center gap-1">
                                          <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
                                          In Library
                                        </span>
                                      )}
                                    </div>

                                    {result.overview && (
                                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                        {result.overview}
                                      </p>
                                    )}

                                    <button
                                      onClick={() => handleAdd(result)}
                                      disabled={isAdding || inLibrary}
                                      className={`w-full text-xs font-bold py-2 px-3 rounded-xl border transition-all ${
                                        inLibrary
                                          ? 'bg-muted/50 border-border/50 text-muted-foreground cursor-not-allowed'
                                          : 'bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20 text-primary hover:from-primary hover:to-accent hover:text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed'
                                      }`}
                                    >
                                      {inLibrary
                                        ? '✓ Already in Library'
                                        : isAdding
                                          ? 'Adding...'
                                          : '+ Add to Library'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
