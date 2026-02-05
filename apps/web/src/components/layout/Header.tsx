import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { getHiddenDownloadIds } from '@/lib/hidden-downloads';

export function Header() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [time, setTime] = useState(new Date());
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowQuickSearch(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formattedTime = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Fetch download queue for notifications
  const { data: queue } = useQuery({
    queryKey: ['downloads', 'queue'],
    queryFn: () => api.downloads.getQueue(),
    refetchInterval: 10000,
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    refetchInterval: 60000,
  });

  // Fetch Plex sessions
  const { data: plexSessions } = useQuery({
    queryKey: ['plex', 'sessions'],
    queryFn: () => api.plex.getSessions(),
    refetchInterval: 10000,
  });

  const { data: auth } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.auth.getMe(),
    staleTime: 60 * 1000,
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['auth'] });
      navigate('/login');
    },
  });

  const hiddenIds = getHiddenDownloadIds();
  const visibleQueue = (queue || []).filter((item: any) => !hiddenIds.has(item.id));

  // Count active downloads
  const activeDownloads = visibleQueue.filter((item: any) =>
    item.status === 'downloading' || item.status === 'queued'
  );

  // Count active Plex streams
  const activeStreams = plexSessions?.sessions || [];

  // Check for service errors
  const serviceErrors = Object.entries(health?.services || {}).filter(([_, connected]) => !connected);

  const notificationCount = activeDownloads.length + activeStreams.length + serviceErrors.length;

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setShowQuickSearch(false);
    }
  };

  return (
    <header className="flex h-20 items-center justify-between border-b border-border/30 px-6 md:px-8 bg-background-elevated/60 backdrop-blur-xl relative z-50">
      {/* Mobile Logo */}
      <div className="flex items-center gap-4 md:hidden">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center font-bold text-sm glow-primary">
          D
        </div>
        <h2 className="text-lg font-bold text-gradient">DashArr</h2>
      </div>

      {/* Desktop: Time Display */}
      <div className="hidden md:flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-card-elevated/80 border border-border/50 flex items-center justify-center text-xl">
          ⏰
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{formattedTime}</p>
          <p className="text-[11px] text-muted-foreground">
            {time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Right Side Actions */}
      <div className="flex items-center gap-3">
        {/* Quick Search */}
        <div className="relative" ref={searchRef}>
          <button
            onClick={() => setShowQuickSearch(!showQuickSearch)}
            className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-card-elevated/70 border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10"
            aria-label="Quick search"
          >
            <span className="text-lg group-hover:scale-110 transition-transform">🔍</span>
            <span className="hidden md:inline text-sm font-medium">Search</span>
          </button>

          {/* Quick Search Dropdown */}
          {showQuickSearch && (
            <div className="absolute right-0 top-full mt-2 w-80 md:w-96 rounded-2xl border border-border/50 bg-card-elevated/95 backdrop-blur-xl shadow-2xl shadow-primary/10 animate-slide-down">
              <form onSubmit={handleQuickSearch} className="p-4">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">
                    🔍
                  </div>
                  <input
                    type="text"
                    placeholder="Search movies, shows, books..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="w-full rounded-xl border border-border/50 bg-background-elevated/60 pl-12 pr-4 py-3 text-sm font-medium ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary/50 transition-all"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2 px-1">
                  Press Enter to search across all services
                </p>
              </form>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative w-11 h-11 rounded-xl bg-card-elevated/70 border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 group"
            aria-label="Notifications"
          >
            <span className="text-lg group-hover:scale-110 transition-transform">🔔</span>
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-primary to-accent rounded-full text-[10px] font-bold text-primary-foreground flex items-center justify-center border-2 border-background shadow-lg">
                {notificationCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 md:w-96 rounded-2xl border border-border/50 bg-card-elevated/98 backdrop-blur-2xl shadow-2xl shadow-primary/10 animate-slide-down max-h-[500px] overflow-y-auto">
              <div className="p-4 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
                <h3 className="text-base font-bold text-foreground">Activity</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {notificationCount} active {notificationCount === 1 ? 'item' : 'items'}
                </p>
              </div>

              <div className="p-4 space-y-3">
                {/* Service Errors */}
                {serviceErrors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Service Errors</p>
                    {serviceErrors.map(([service, _]) => (
                      <div
                        key={service}
                        className="flex items-center gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/30"
                      >
                        <span className="text-xl">⚠️</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground capitalize">{service}</p>
                          <p className="text-xs text-muted-foreground">Connection failed</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Active Plex Streams */}
                {activeStreams.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Active Streams</p>
                    {activeStreams.slice(0, 5).map((stream: any) => {
                      const progress = stream.viewOffset && stream.duration
                        ? (stream.viewOffset / stream.duration * 100)
                        : 0;
                      const bandwidth = stream.session?.bandwidth
                        ? `${(stream.session.bandwidth / 1024).toFixed(1)} Mbps`
                        : '';
                      return (
                        <div
                          key={stream.sessionKey}
                          className="p-3 rounded-xl bg-background-elevated/60 border border-border/50"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">📺</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{stream.title}</p>
                              <p className="text-xs text-muted-foreground">{stream.user?.title || 'Unknown User'}</p>
                            </div>
                          </div>
                          {stream.duration && (
                            <div className="space-y-1">
                              <div className="w-full bg-border/30 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-primary to-accent h-1.5 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(progress, 100).toFixed(1)}%` }}
                                />
                              </div>
                              <div className="flex justify-between items-center">
                                <p className="text-xs text-muted-foreground">{progress.toFixed(0)}%</p>
                                {bandwidth && (
                                  <p className="text-xs text-muted-foreground">{bandwidth}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {activeStreams.length > 5 && (
                      <p className="text-xs py-2 text-center text-muted-foreground font-semibold">
                        +{activeStreams.length - 5} more streams
                      </p>
                    )}
                  </div>
                )}

                {/* Active Downloads */}
                {activeDownloads.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Active Downloads</p>
                    {activeDownloads.slice(0, 5).map((item: any) => {
                      const progress = item.progress || (item.size > 0 ? ((item.size - item.sizeleft) / item.size * 100) : 0);
                      return (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl bg-background-elevated/60 border border-border/50"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">⬇️</span>
                            <p className="text-sm font-semibold text-foreground flex-1 truncate">{item.title}</p>
                          </div>
                          {item.size > 0 && (
                            <div className="space-y-1">
                              <div className="w-full bg-border/30 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-primary to-accent h-1.5 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(progress, 100).toFixed(1)}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">{progress.toFixed(1)}%</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {activeDownloads.length > 5 && (
                      <button
                        onClick={() => {
                          navigate('/downloads');
                          setShowNotifications(false);
                        }}
                        className="w-full text-xs py-2 rounded-lg text-primary hover:bg-primary/10 transition-colors font-semibold"
                      >
                        View all {activeDownloads.length} downloads →
                      </button>
                    )}
                  </div>
                )}

                {/* Empty State */}
                {notificationCount === 0 && (
                  <div className="text-center py-8">
                    <div className="text-4xl opacity-20 mb-2">🔔</div>
                    <p className="text-sm text-muted-foreground">No active notifications</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User */}
        {auth?.user?.username && (
          <div className="hidden md:flex items-center gap-2 rounded-xl border border-border/50 bg-card-elevated/60 px-3 py-2">
            <span className="text-sm font-semibold">{auth.user.title || auth.user.username}</span>
            <button
              onClick={() => logoutMutation.mutate()}
              className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              Log out
            </button>
          </div>
        )}

        {/* Logs */}
        <button
          onClick={() => navigate('/logs')}
          className="w-11 h-11 rounded-xl bg-card-elevated/70 border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10"
          aria-label="Service logs"
        >
          <span className="text-lg">🧾</span>
        </button>

        {/* Settings */}
        <button
          onClick={() => navigate('/settings')}
          className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/30 flex items-center justify-center text-primary hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 group"
          aria-label="Settings"
        >
          <span className="text-lg group-hover:rotate-90 transition-transform duration-500">⚙️</span>
        </button>
      </div>
    </header>
  );
}
