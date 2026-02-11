import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { GameSearchResult, MonitoredGame, GameDownloadCandidate } from '@shared/index';

export function Games() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'monitored' | 'upcoming'>('search');
  const [selectedGame, setSelectedGame] = useState<GameSearchResult | MonitoredGame | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const queryClient = useQueryClient();

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Search games
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['games', 'search', searchQuery],
    queryFn: () => api.games.search(searchQuery, 20),
    enabled: searchQuery.length >= 2,
  });

  // Get upcoming games
  const { data: upcomingGames } = useQuery({
    queryKey: ['games', 'upcoming'],
    queryFn: () => api.games.getUpcoming(20),
    enabled: activeTab === 'upcoming',
  });

  // Get monitored games
  const { data: monitoredGames, error: monitoredError } = useQuery({
    queryKey: ['games', 'monitored'],
    queryFn: () => api.games.getMonitored(),
  });

  // Get stats
  const { data: stats } = useQuery({
    queryKey: ['games', 'stats'],
    queryFn: () => api.games.getStats(),
  });

  // Monitor mutation
  const monitorMutation = useMutation({
    mutationFn: (igdbId: number) => api.games.monitor(igdbId),
    onSuccess: (_data, igdbId) => {
      queryClient.invalidateQueries({ queryKey: ['games'] });
      const game = displayedGames.find((g: GameSearchResult | MonitoredGame) => g.igdbId === igdbId);
      showToast(`Now monitoring ${game?.name || 'game'}`, 'success');
    },
    onError: (error: Error) => {
      showToast(`Failed to monitor: ${error.message}`, 'error');
    },
  });

  // Unmonitor mutation
  const unmonitorMutation = useMutation({
    mutationFn: (igdbId: number) => api.games.unmonitor(igdbId),
    onSuccess: (_data, igdbId) => {
      queryClient.invalidateQueries({ queryKey: ['games'] });
      const game = displayedGames.find((g: GameSearchResult | MonitoredGame) => g.igdbId === igdbId);
      showToast(`Stopped monitoring ${game?.name || 'game'}`, 'success');
    },
    onError: (error: Error) => {
      showToast(`Failed to unmonitor: ${error.message}`, 'error');
    },
  });

  const displayedGames =
    activeTab === 'search'
      ? searchResults || []
      : activeTab === 'upcoming'
      ? upcomingGames || []
      : monitoredGames || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Games</h1>
          <p className="text-muted-foreground mt-1">
            Search and monitor games from IGDB
          </p>
        </div>
        {stats && (
          <div className="flex gap-4 text-sm">
            <div className="text-center">
              <div className="font-bold text-lg">{stats.monitored}</div>
              <div className="text-muted-foreground">Monitored</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-lg">{stats.wanted}</div>
              <div className="text-muted-foreground">Wanted</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-lg">{stats.downloading}</div>
              <div className="text-muted-foreground">Downloading</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-lg">{stats.downloaded}</div>
              <div className="text-muted-foreground">Downloaded</div>
            </div>
          </div>
        )}
      </div>

      {/* Search & Tabs */}
      <div className="flex gap-4 items-center">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search games..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setActiveTab('search');
            }}
            className="w-full px-4 py-2 rounded-lg border border-border bg-background"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'search'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            Search
          </button>
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'upcoming'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setActiveTab('monitored')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'monitored'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            Monitored
          </button>
        </div>
      </div>

      {/* Results */}
      {searchLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-muted-foreground mt-4">Searching games...</p>
        </div>
      ) : activeTab === 'monitored' && monitoredError ? (
        <div className="text-center py-12 text-red-500">
          Failed to load monitored games
        </div>
      ) : displayedGames.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {activeTab === 'search'
            ? searchQuery.length < 2
              ? 'Type at least 2 characters to search'
              : 'No games found'
            : activeTab === 'upcoming'
            ? 'No upcoming games'
            : 'No monitored games'}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayedGames.map((game: GameSearchResult | MonitoredGame) => (
            <GameCard
              key={game.igdbId}
              game={game}
              onMonitor={() => monitorMutation.mutate(game.igdbId)}
              onUnmonitor={() => unmonitorMutation.mutate(game.igdbId)}
              onSearch={() => setSelectedGame(game)}
              isMonitoring={monitorMutation.isPending && monitorMutation.variables === game.igdbId}
              isUnmonitoring={unmonitorMutation.isPending && unmonitorMutation.variables === game.igdbId}
            />
          ))}
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success'
            ? 'bg-green-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Search Results Modal */}
      {selectedGame && (
        <SearchResultsModal
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
        />
      )}
    </div>
  );
}

interface GameCardProps {
  game: GameSearchResult | MonitoredGame;
  onMonitor: () => void;
  onUnmonitor: () => void;
  onSearch: () => void;
  isMonitoring?: boolean;
  isUnmonitoring?: boolean;
}

function GameCard({ game, onMonitor, onUnmonitor, onSearch, isMonitoring, isUnmonitoring }: GameCardProps) {
  const isMonitored = 'isMonitored' in game ? game.isMonitored : true;
  const status = 'status' in game ? game.status : undefined;

  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:shadow-lg transition-shadow">
      <div className="flex gap-4">
        {/* Cover */}
        <div className="w-24 h-32 flex-shrink-0 rounded-lg bg-muted overflow-hidden">
          {game.coverUrl ? (
            <img
              src={game.coverUrl}
              alt={game.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl">
              🎮
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{game.name}</h3>
          
          {game.releaseDate && (
            <p className="text-sm text-muted-foreground mt-1">
              Release: {new Date(game.releaseDate).toLocaleDateString()}
            </p>
          )}

          {game.platforms && game.platforms.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {game.platforms.slice(0, 3).join(', ')}
              {game.platforms.length > 3 && ' +' + (game.platforms.length - 3)}
            </p>
          )}

          {game.rating && (
            <div className="flex items-center gap-1 mt-2">
              <span className="text-yellow-500">★</span>
              <span className="text-sm">{game.rating.toFixed(1)}</span>
            </div>
          )}

          {status && (
            <span
              className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                status === 'downloaded'
                  ? 'bg-green-100 text-green-800'
                  : status === 'downloading'
                  ? 'bg-blue-100 text-blue-800'
                  : status === 'wanted'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {status}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={onSearch}
          className="flex-1 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/90 transition-colors"
        >
          🔍 Search Downloads
        </button>
        {isMonitored ? (
          <button
            onClick={onUnmonitor}
            disabled={isUnmonitoring}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUnmonitoring ? 'Stopping...' : 'Stop'}
          </button>
        ) : (
          <button
            onClick={onMonitor}
            disabled={isMonitoring}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isMonitoring ? 'Monitoring...' : 'Monitor'}
          </button>
        )}
      </div>
    </div>
  );
}

// Platform options - include 'All' for initial fetch
const PLATFORM_OPTIONS = [
  { value: 'PC', label: '🖥️ PC', icon: '💻' },
  { value: 'PS5', label: '🎮 PS5', icon: '🎮' },
  { value: 'PS4', label: '🎮 PS4', icon: '🎮' },
  { value: 'PS3', label: '🎮 PS3', icon: '🎮' },
  { value: 'Xbox', label: '🎮 Xbox', icon: '🎮' },
  { value: 'Xbox360', label: '🎮 Xbox 360', icon: '🎮' },
  { value: 'Switch', label: '🎮 Switch', icon: '🎮' },
  { value: 'WiiU', label: '🎮 Wii U', icon: '🎮' },
  { value: 'Wii', label: '🎮 Wii', icon: '🎮' },
  { value: 'All', label: '📋 All Platforms', icon: '📋' },
];

// Extract source from candidate title/source
function extractSource(candidate: GameDownloadCandidate): string {
  const title = candidate.title || '';
  const source = candidate.source || '';
  
  // FitGirl
  if (/fitgirl/i.test(title)) return 'FitGirl';
  
  // DODI
  if (/\bdodi\b/i.test(title)) return 'DODI';
  
  // Scene groups
  if (/\bCODEX\b/i.test(title)) return 'CODEX';
  if (/\bCPY\b/i.test(title)) return 'CPY';
  if (/\bSKIDROW\b/i.test(title)) return 'SKIDROW';
  if (/\bPLAZA\b/i.test(title)) return 'PLAZA';
  if (/\bFLT\b/i.test(title)) return 'FLT';
  if (/\bTENOKE\b/i.test(title)) return 'TENOKE';
  if (/\bRAZOR1911\b/i.test(title)) return 'RAZOR1911';
  
  // Other repackers
  if (/\bElAmigos\b/i.test(title)) return 'ElAmigos';
  if (/\bKaOs\b/i.test(title)) return 'KaOs';
  if (/\bGOG\b/i.test(title)) return 'GOG';
  
  // From source string
  if (source.includes('FitGirl')) return 'FitGirl';
  if (source.includes('DODI')) return 'DODI';
  
  // Prowlarr indexers
  if (source.includes('Prowlarr')) {
    // Extract indexer name from source
    const match = source.match(/\(([^)]+)\)/);
    if (match && match[1]) return match[1];
  }
  
  return 'Other';
}

interface SearchResultsModalProps {
  game: GameSearchResult | MonitoredGame;
  onClose: () => void;
}

function SearchResultsModal({ game, onClose }: SearchResultsModalProps) {
  const queryClient = useQueryClient();
  const [allCandidates, setAllCandidates] = useState<GameDownloadCandidate[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<GameDownloadCandidate[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, 'searching' | 'completed' | 'error'>>({});
  const [isSearching, setIsSearching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('PC');
  const [selectedSource, setSelectedSource] = useState<string>('All');
  const [searchProgress, setSearchProgress] = useState({ total: 0, completed: 0 });
  
  // Extract unique sources from candidates
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allCandidates.forEach(c => {
      const source = extractSource(c);
      counts[source] = (counts[source] || 0) + 1;
    });
    return counts;
  }, [allCandidates]);
  
  // Extract platform counts
  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allCandidates.forEach(c => {
      const platform = c.platform || 'Unknown';
      counts[platform] = (counts[platform] || 0) + 1;
    });
    return counts;
  }, [allCandidates]);
  
  // Filter candidates when platform or source changes
  useEffect(() => {
    let filtered = allCandidates;
    
    // Filter by platform
    if (selectedPlatform !== 'All') {
      filtered = filtered.filter(c => c.platform === selectedPlatform);
    }
    
    // Filter by source
    if (selectedSource !== 'All') {
      filtered = filtered.filter(c => extractSource(c) === selectedSource);
    }
    
    setFilteredCandidates(filtered);
  }, [selectedPlatform, selectedSource, allCandidates]);

  // Download mutation
  const downloadMutation = useMutation({
    mutationFn: ({ candidate, downloadClient }: { candidate: GameDownloadCandidate; downloadClient?: string }) =>
      api.games.startDownload(game.igdbId, candidate, downloadClient),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games', 'monitored'] });
      alert('Download started successfully!');
    },
    onError: (error: Error) => {
      alert(`Failed to start download: ${error.message}`);
    },
  });

  // Set up streaming search - fetch all platforms initially
  useEffect(() => {
    // Fetch all platforms (no platform filter)
    const eventSource = new EventSource(`/api/v1/games/${game.igdbId}/candidates/stream`, {
      withCredentials: true,
    });

    eventSource.addEventListener('agentStart', (e: Event) => {
      const data = JSON.parse((e as MessageEvent).data);
      setAgentStatuses(prev => ({ ...prev, [data.agent]: 'searching' }));
      setSearchProgress(prev => ({ ...prev, total: prev.total + 1 }));
    });

    eventSource.addEventListener('agentResult', (e: Event) => {
      const data = JSON.parse((e as MessageEvent).data);
      if (data.candidates && data.candidates.length > 0) {
        setAllCandidates(prev => {
          const newCandidates = [...prev, ...data.candidates];
          // Sort by match score, then platform score (PC prioritized)
          return newCandidates.sort((a, b) => {
            const matchDiff = (b.matchScore || 0) - (a.matchScore || 0);
            if (matchDiff !== 0) return matchDiff;
            return (b.platformScore || 0) - (a.platformScore || 0);
          });
        });
      }
    });

    eventSource.addEventListener('agentError', (e: Event) => {
      const data = JSON.parse((e as MessageEvent).data);
      setAgentStatuses(prev => ({ ...prev, [data.agent]: 'error' }));
      setSearchProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
    });

    eventSource.addEventListener('agentComplete', (e: Event) => {
      const data = JSON.parse((e as MessageEvent).data);
      setAgentStatuses(prev => ({ ...prev, [data.agent]: 'completed' }));
      setSearchProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
    });

    eventSource.addEventListener('complete', () => {
      setIsSearching(false);
      eventSource.close();
    });

    eventSource.addEventListener('error', (e: Event) => {
      const msgEvent = e as MessageEvent;
      const data = msgEvent.data ? JSON.parse(msgEvent.data) : null;
      setError(data?.error || 'Failed to search download sources');
      setIsSearching(false);
      eventSource.close();
    });

    eventSource.onerror = () => {
      setError('Connection to search service lost');
      setIsSearching(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [game.igdbId]);

  // Simple platform change handler - just updates the filter
  const handlePlatformChange = (platform: string) => {
    setSelectedPlatform(platform);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-auto rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-border bg-card">
          <div className="flex items-center gap-4">
            {game.coverUrl && (
              <img
                src={game.coverUrl}
                alt={game.name}
                className="w-16 h-20 object-cover rounded-lg"
              />
            )}
            <div>
              <h2 className="text-xl font-bold">{game.name}</h2>
              <p className="text-sm text-muted-foreground">
                Search Results from Download Sources
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Filters */}
          <div className="mb-6 p-4 rounded-lg bg-muted/50 space-y-4">
            {/* Platform Selector with counts */}
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium w-20">Platform:</label>
              <select
                value={selectedPlatform}
                onChange={(e) => handlePlatformChange(e.target.value)}
                disabled={isSearching && allCandidates.length === 0}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              >
                {PLATFORM_OPTIONS.map(opt => {
                  const count = opt.value === 'All' 
                    ? allCandidates.length 
                    : (platformCounts[opt.value] || 0);
                  return (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
            
            {/* Source Selector with counts */}
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium w-20">Source:</label>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                disabled={isSearching && allCandidates.length === 0}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              >
                <option value="All">All Sources ({allCandidates.length})</option>
                {Object.entries(sourceCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([source, count]) => (
                    <option key={source} value={source}>
                      {source} ({count})
                    </option>
                  ))}
              </select>
            </div>
            
            {/* Results summary */}
            <div className="text-xs text-muted-foreground pt-2 border-t border-border">
              Showing {filteredCandidates.length} of {allCandidates.length} total results
              {selectedPlatform !== 'All' && ` • Platform: ${selectedPlatform}`}
              {selectedSource !== 'All' && ` • Source: ${selectedSource}`}
            </div>
          </div>

          {/* Agent Status Indicators */}
          {Object.keys(agentStatuses).length > 0 && (
            <div className="mb-6 p-4 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Search Progress
                </p>
                {isSearching && (
                  <span className="text-xs text-muted-foreground">
                    {searchProgress.completed}/{searchProgress.total} agents complete
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(agentStatuses).map(([agent, status]) => (
                  <div
                    key={agent}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                      status === 'searching'
                        ? 'bg-blue-500/10 text-blue-500'
                        : status === 'completed'
                        ? 'bg-green-500/10 text-green-500'
                        : 'bg-red-500/10 text-red-500'
                    }`}
                  >
                    {status === 'searching' && (
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    {status === 'completed' && <span>✓</span>}
                    {status === 'error' && <span>✗</span>}
                    <span>{agent}</span>
                  </div>
                ))}
              </div>
              {/* Progress bar */}
              {isSearching && searchProgress.total > 0 && (
                <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(searchProgress.completed / searchProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {error ? (
            <div className="text-center py-12 text-red-500">
              <p>Failed to search download sources</p>
              <p className="text-sm mt-2">{error}</p>
            </div>
          ) : !isSearching && allCandidates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-4xl mb-4">🔍</p>
              <p className="text-lg font-medium">No download candidates found</p>
              <p className="text-sm mt-2">
                This game may not be available on FitGirl or other repack sources yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCandidates.length > 0 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Showing {filteredCandidates.length} of {allCandidates.length} total
                    {isSearching && ' (searching...)'}
                  </span>
                  <span>Sorted by match score</span>
                </div>
              )}

              {filteredCandidates.map((candidate, index) => (
                <CandidateCard
                  key={index}
                  candidate={candidate}
                  game={game}
                  onDownload={() => downloadMutation.mutate({ candidate })}
                  isDownloading={downloadMutation.isPending}
                />
              ))}

              {isSearching && allCandidates.length === 0 && (
                <div className="text-center py-12">
                  <div className="animate-spin w-10 h-10 border-3 border-primary border-t-transparent rounded-full mx-auto mb-6" />
                  <h3 className="text-lg font-semibold mb-2">Searching Download Sources</h3>
                  <p className="text-muted-foreground mb-4">
                    Looking for {game.name} ({selectedPlatform})
                  </p>
                  
                  {/* Agent search status */}
                  <div className="max-w-md mx-auto space-y-2">
                    {Object.entries(agentStatuses).map(([agent, status]) => (
                      <div key={agent} className="flex items-center justify-between px-4 py-2 rounded-lg bg-muted/50 text-sm">
                        <span className="flex items-center gap-2">
                          {status === 'searching' && (
                            <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          )}
                          {status === 'completed' && <span className="text-green-500">✓</span>}
                          {status === 'error' && <span className="text-red-500">✗</span>}
                          {agent}
                        </span>
                        <span className="text-muted-foreground">
                          {status === 'searching' ? 'Searching...' : 
                           status === 'completed' ? 'Done' : 'Failed'}
                        </span>
                      </div>
                    ))}
                    {Object.keys(agentStatuses).length === 0 && (
                      <p className="text-sm text-muted-foreground">Initializing search agents...</p>
                    )}
                  </div>
                  
                  <p className="text-xs text-muted-foreground mt-6">
                    This may take 10-30 seconds depending on source availability
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CandidateCardProps {
  candidate: GameDownloadCandidate;
  game: GameSearchResult | MonitoredGame;
  onDownload: () => void;
  isDownloading: boolean;
}

function CandidateCard({ candidate, onDownload, isDownloading }: CandidateCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getScoreColor = (score: number) => {
    if (score >= 110) return 'text-emerald-400 bg-emerald-500/20 ring-2 ring-emerald-500/30';
    if (score >= 100) return 'text-green-400 bg-green-500/20 ring-2 ring-green-500/30';
    if (score >= 90) return 'text-green-500 bg-green-500/10';
    if (score >= 70) return 'text-blue-500 bg-blue-500/10';
    if (score >= 50) return 'text-yellow-500 bg-yellow-500/10';
    return 'text-red-500 bg-red-500/10';
  };



  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      {/* Main Row */}
      <div
        className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-4">
          {/* Score Badge */}
          <div
            className={`flex-shrink-0 w-16 h-16 rounded-lg flex flex-col items-center justify-center ${getScoreColor(
              candidate.matchScore || 0
            )}`}
          >
            <span className="text-xl font-bold">{candidate.matchScore || 0}</span>
            <span className="text-xs opacity-70">score</span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-lg truncate">{candidate.title}</h3>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  candidate.releaseType === 'repack'
                    ? 'bg-purple-100 text-purple-800'
                    : candidate.releaseType === 'scene'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {candidate.releaseType}
              </span>
              {candidate.platform && (
                <span 
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    candidate.platform === 'PC' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-indigo-100 text-indigo-800'
                  }`}
                  title={`Platform: ${candidate.platform}`}
                >
                  {candidate.platform === 'PC' ? '🖥️ PC' : 
                   candidate.platform === 'PS5' ? '🎮 PS5' :
                   candidate.platform === 'PS4' ? '🎮 PS4' :
                   candidate.platform === 'Xbox' ? '🎮 Xbox' :
                   candidate.platform === 'Switch' ? '🎮 Switch' :
                   `🎮 ${candidate.platform}`}
                </span>
              )}
              {candidate.quality && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                  {candidate.quality}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              {candidate.size && (
                <span className="flex items-center gap-1">
                  💾 {candidate.size}
                </span>
              )}
              {candidate.seeders !== undefined && (
                <span className="flex items-center gap-1">
                  🌱 {candidate.seeders} seeders
                </span>
              )}
              {candidate.source && (
                <span className="flex items-center gap-1">
                  📡 {candidate.source}
                </span>
              )}
            </div>

            {/* Match Reasons */}
            {candidate.matchReasons && candidate.matchReasons.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Match reasons:</span>
                {candidate.matchReasons.slice(0, 4).map((reason, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-full text-xs bg-muted"
                  >
                    {reason}
                  </span>
                ))}
                {candidate.matchReasons.length > 4 && (
                  <span className="text-xs text-muted-foreground">
                    +{candidate.matchReasons.length - 4} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Expand Icon */}
          <div className="flex-shrink-0 text-muted-foreground">
            {expanded ? '▼' : '▶'}
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border bg-muted/30">
          <div className="pt-4 space-y-3">
            {/* All Match Reasons */}
            {candidate.matchReasons && candidate.matchReasons.length > 4 && (
              <div>
                <h4 className="text-sm font-medium mb-2">All Match Reasons:</h4>
                <div className="flex flex-wrap gap-2">
                  {candidate.matchReasons.map((reason, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 rounded-full text-xs bg-muted"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Download Links */}
            <div className="flex gap-2 pt-2">
              {candidate.magnetUrl && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload();
                    }}
                    disabled={isDownloading}
                    className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloading ? '⏳ Adding...' : '⬇️ Download to qBittorrent'}
                  </button>
                  <a
                    href={candidate.magnetUrl}
                    onClick={(e) => e.stopPropagation()}
                    className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                  >
                    🧲 Magnet
                  </a>
                </>
              )}
              {candidate.torrentUrl && !candidate.magnetUrl && (
                <a
                  href={candidate.torrentUrl}
                  onClick={(e) => e.stopPropagation()}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  📥 Torrent File
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
