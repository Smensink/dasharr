import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ServiceIcon } from '@/components/ServiceIcon';

const CONFIGURED_TIME_ZONE =
  (import.meta.env.VITE_TIME_ZONE as string) ||
  Intl.DateTimeFormat().resolvedOptions().timeZone;

interface CalendarEvent {
  id: number;
  title: string;
  airDate?: string;
  airDateUtc?: string;
  releaseDate?: string;
  digitalRelease?: string;
  service: 'radarr' | 'sonarr' | 'readarr';
  type: 'movie' | 'episode' | 'book';
  monitored?: boolean;
  hasFile?: boolean;
  overview?: string;
  series?: {
    title: string;
    images?: Array<{
      coverType: string;
      url?: string;
      remoteUrl?: string;
    }>;
  };
  images?: Array<{
    coverType: string;
    url?: string;
    remoteUrl?: string;
  }>;
  remotePoster?: string;
  episodeNumber?: number;
  seasonNumber?: number;
}

export function Calendar() {
  const { startDate, endDate } = React.useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + 30);
    end.setHours(23, 59, 59, 999);
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }, []);

  const { data: events, isLoading, error } = useQuery({
    queryKey: ['calendar', startDate, endDate],
    queryFn: async () => {
      const response = await api.get<CalendarEvent[]>(
        `/calendar?start=${startDate}&end=${endDate}`
      );
      return response;
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const timeZone = CONFIGURED_TIME_ZONE;

  const getLocalDateKey = (date?: Date | null): string | null => {
    if (!date || Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-CA', { timeZone });
  };

  const todayKey = useMemo(() => getLocalDateKey(new Date()), [getLocalDateKey]);

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

  const getPosterUrl = (event: CalendarEvent) => {
    if (event.type === 'episode' && event.series?.images) {
      const poster = event.series.images.find((img) => img.coverType === 'poster');
      return poster?.remoteUrl || poster?.url || null;
    }
    if (event.remotePoster) return event.remotePoster;
    const poster = event.images?.find((img) => img.coverType === 'poster');
    return poster?.remoteUrl || poster?.url || null;
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

  const getEventDate = (event: CalendarEvent) =>
    event.airDateUtc || event.airDate || event.releaseDate || event.digitalRelease;

  const parseEventDate = (event: CalendarEvent): Date | null => {
    const dateStr = getEventDate(event);
    if (!dateStr) return null;
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  };

  const groupByDate = (events: CalendarEvent[]) => {
    const grouped: Record<string, { date: Date; events: CalendarEvent[] }> = {};

    events.forEach((event) => {
      const eventDate = parseEventDate(event);
      if (!eventDate) return;
      const dateKey = getLocalDateKey(eventDate);
      if (!dateKey) return;

      if (!grouped[dateKey]) {
        grouped[dateKey] = { date: eventDate, events: [] };
      }
      grouped[dateKey].events.push(event);
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => ({ key, ...value }));
  };

  const tomorrowKey = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getLocalDateKey(tomorrow);
  }, [getLocalDateKey]);

  const formatDateHeading = (date: Date, dateKey: string) => {
    const formatterFull = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone,
    });

    const shortFormatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone,
    });

    if (dateKey === todayKey) {
      return { label: 'Today', full: formatterFull.format(date) };
    }
    if (dateKey === tomorrowKey) {
      return { label: 'Tomorrow', full: formatterFull.format(date) };
    }

    return { label: shortFormatter.format(date), full: formatterFull.format(date) };
  };

  const formatEventTime = (eventDate: Date | null) => {
    if (!eventDate) return null;
    return eventDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Calendar</h1>
        <p className="text-muted-foreground">Loading calendar...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Calendar</h1>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">
            Failed to load calendar. Make sure your *arr services are configured and running.
          </p>
        </div>
      </div>
    );
  }

  const filteredEvents = (events || []).filter((event) => {
    const eventDate = parseEventDate(event);
    if (!eventDate) return false;
    const dateKey = getLocalDateKey(eventDate);
    if (!dateKey || !todayKey) return false;
    return dateKey >= todayKey;
  });

  const groupedEvents = groupByDate(filteredEvents);

  return (
    <div className="space-y-8 pb-20 md:pb-8 animate-fade-in">
      {/* Header Section */}
      <div className="space-y-6 animate-slide-down">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">Release Calendar</h1>
          <p className="text-muted-foreground text-base">
            <span className="text-primary font-bold text-lg">{filteredEvents.length}</span> upcoming releases in the next 30 days
          </p>
          <p className="text-xs text-muted-foreground">
            Times shown in {timeZone}
          </p>
        </div>
      </div>

      {groupedEvents.length === 0 ? (
        <div className="text-center py-20 space-y-4 animate-fade-in">
          <div className="text-8xl opacity-20 mb-4">📅</div>
          <p className="text-xl font-bold text-foreground">No upcoming releases</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            New releases will appear here when scheduled
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedEvents.map((group, dateIdx) => {
            const dateInfo = formatDateHeading(group.date, group.key);
            return (
              <div
                key={group.key}
                className="grid gap-4 md:grid-cols-[140px_1fr] md:gap-6 animate-slide-up"
                style={{ animationDelay: `${dateIdx * 40}ms` }}
              >
                {/* Date Header */}
                <div className="md:sticky md:top-6 h-fit">
                  <div className="rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex flex-col items-center justify-center border border-primary/30">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">
                          {new Intl.DateTimeFormat('en-US', { month: 'short', timeZone }).format(group.date)}
                        </span>
                        <span className="text-xl font-extrabold text-primary">
                          {group.date.getDate()}
                        </span>
                      </div>
                      <div>
                        <h2 className="text-lg font-bold tracking-tight">{dateInfo.label}</h2>
                        <p className="text-xs text-muted-foreground">{dateInfo.full}</p>
                      </div>
                    </div>
                    <div className="mt-3 text-xs font-semibold text-muted-foreground">
                      {group.events.length} item{group.events.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                {/* Events for this date */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {group.events.map((event, idx) => {
                    const posterUrl = getPosterUrl(event);
                    const displayTitle = getDisplayTitle(event);
                    const eventDate = parseEventDate(event);
                    const timeLabel = formatEventTime(eventDate);

                    return (
                      <div
                        key={`${event.service}-${event.id}`}
                        className={`group relative rounded-xl bg-gradient-to-br ${getServiceColor(event.service)} border backdrop-blur-sm overflow-hidden hover:shadow-xl hover:shadow-primary/10 transition-all duration-300`}
                        style={{ animationDelay: `${idx * 20}ms` }}
                      >
                        <div className="flex gap-4 p-3">
                          {/* Poster */}
                          <div className="relative flex-shrink-0">
                            {posterUrl ? (
                              <img
                                src={posterUrl}
                                alt={displayTitle}
                                className="w-16 h-24 md:w-18 md:h-28 object-cover rounded-lg border border-border/50 group-hover:scale-105 transition-transform duration-500"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-16 h-24 md:w-18 md:h-28 bg-gradient-to-br from-muted to-background rounded-lg border border-border/50 flex items-center justify-center">
                                <ServiceIcon service={event.service} size={32} />
                              </div>
                            )}

                            {/* Service Badge */}
                            <div className="absolute -top-2 -left-2 w-7 h-7 rounded-lg bg-background/95 backdrop-blur-sm border border-border/50 flex items-center justify-center shadow-lg">
                              <ServiceIcon service={event.service} size={16} />
                            </div>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 space-y-2">
                            <h3 className="font-bold text-sm line-clamp-2 group-hover:line-clamp-none text-foreground group-hover:text-primary transition-colors leading-tight">
                              {displayTitle}
                            </h3>
                            {timeLabel && (
                              <p className="text-xs text-muted-foreground">
                                {timeLabel}
                              </p>
                            )}

                            <div className="flex flex-wrap gap-1.5">
                              <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-background/60 backdrop-blur-sm border border-border/50 uppercase tracking-wide">
                                {event.type}
                              </span>
                              {event.monitored && (
                                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-primary/20 border border-primary/30 text-primary uppercase tracking-wide">
                                  Monitored
                                </span>
                              )}
                              {event.hasFile && (
                                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-success/20 border border-success/30 text-success uppercase tracking-wide flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
                                  Downloaded
                                </span>
                              )}
                            </div>

                            {event.overview && (
                              <p className="text-xs text-muted-foreground line-clamp-2 group-hover:line-clamp-none leading-relaxed transition-all">
                                {event.overview}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
