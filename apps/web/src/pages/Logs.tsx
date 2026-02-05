import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { LogEntry } from '@shared/index';
import { ServiceIcon } from '@/components/ServiceIcon';

const LOG_TIME_ZONE =
  (import.meta.env.VITE_TIME_ZONE as string) ||
  Intl.DateTimeFormat().resolvedOptions().timeZone;

type LogService = 'radarr' | 'sonarr' | 'readarr' | 'bazarr' | 'dasharr';
type LogLevel = 'all' | 'info' | 'warn' | 'error' | 'debug';

const serviceOptions: { id: LogService; label: string; icon: ReactNode }[] = [
  { id: 'radarr', label: 'Radarr', icon: <ServiceIcon service="radarr" size={18} /> },
  { id: 'sonarr', label: 'Sonarr', icon: <ServiceIcon service="sonarr" size={18} /> },
  { id: 'readarr', label: 'Readarr', icon: <ServiceIcon service="readarr" size={18} /> },
  { id: 'bazarr', label: 'Bazarr', icon: <ServiceIcon service="bazarr" size={18} /> },
  { id: 'dasharr', label: 'Dasharr', icon: <ServiceIcon service="dasharr" size={18} /> },
];

const levelOptions: { id: LogLevel; label: string }[] = [
  { id: 'all', label: 'All levels' },
  { id: 'error', label: 'Error' },
  { id: 'warn', label: 'Warning' },
  { id: 'info', label: 'Info' },
  { id: 'debug', label: 'Debug' },
];

function getLevelStyles(level: LogEntry['level']) {
  switch (level) {
    case 'error':
      return 'bg-destructive/10 text-destructive border-destructive/30';
    case 'warn':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    case 'debug':
      return 'bg-primary/10 text-primary border-primary/30';
    case 'info':
    default:
      return 'bg-accent/10 text-accent border-accent/30';
  }
}

export function Logs() {
  const [service, setService] = useState<LogService>('radarr');
  const [level, setLevel] = useState<LogLevel>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  const params = useMemo(() => {
    const query: Record<string, any> = { page, pageSize };
    if (level !== 'all') {
      query.level = level;
    }
    return query;
  }, [level, page, pageSize]);

  const { data, isLoading, error, isFetching } = useQuery<LogEntry[]>({
    queryKey: ['logs', service, params],
    queryFn: () => {
      if (service === 'radarr') {
        return api.radarr.getLogs(params);
      }
      if (service === 'sonarr') {
        return api.sonarr.getLogs(params);
      }
      if (service === 'readarr') {
        return api.readarr.getLogs(params);
      }
      if (service === 'bazarr') {
        return api.bazarr.getLogs(params);
      }
      return api.dasharr.getLogs(params);
    },
    placeholderData: (previous) => previous ?? [],
    refetchInterval: 30000,
  });

  const logs = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [data]);

  const canPrev = page > 1;
  const canNext = logs.length === pageSize;

  return (
    <div className="space-y-8 pb-20 md:pb-8 animate-fade-in">
      <div className="space-y-4 animate-slide-down">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Service Logs</h1>
        <p className="text-muted-foreground text-base">
          Review recent events and errors from Dasharr and your *arr services.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {serviceOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => {
              setService(option.id);
              setPage(1);
            }}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-300 ${
              service === option.id
                ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground border-primary/40 shadow-lg shadow-primary/10'
                : 'bg-card-elevated/60 border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40'
            }`}
          >
            <span className="text-base">{option.icon}</span>
            {option.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <select
            value={level}
            onChange={(event) => {
              setLevel(event.target.value as LogLevel);
              setPage(1);
            }}
            className="rounded-xl border border-border/50 bg-card-elevated/60 px-3 py-2 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {levelOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-xl border border-primary/30">
              🧾
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">Latest Entries</p>
              <p className="text-xs text-muted-foreground">
                {serviceOptions.find((item) => item.id === service)?.label} logs • page {page} • {LOG_TIME_ZONE}
              </p>
            </div>
          </div>
          {isFetching && (
            <div className="text-xs text-muted-foreground animate-pulse">Refreshing…</div>
          )}
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-muted-foreground">Loading logs…</div>
        ) : error ? (
          <div className="p-10 text-center text-destructive">
            Failed to load logs. Check that {service} is enabled and reachable.
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No log entries found.
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {logs.map((entry, index) => (
              <div key={`${entry.time}-${index}`} className="p-5 hover:bg-card-elevated/70 transition-colors">
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 rounded-lg border px-2 py-1 text-xs font-bold uppercase tracking-wide ${getLevelStyles(entry.level)}`}>
                    {entry.level}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-sm font-semibold text-foreground">{entry.message}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        {new Date(entry.time).toLocaleString('en-AU', {
                          timeZone: LOG_TIME_ZONE,
                        })}
                      </span>
                      <span className="text-muted-foreground/60">•</span>
                      <span className="capitalize">{service}</span>
                    </div>
                    {entry.exception && (
                      <details className="rounded-xl border border-border/40 bg-background/40 p-3 text-xs text-muted-foreground">
                        <summary className="cursor-pointer font-semibold text-foreground/70">View exception</summary>
                        <pre className="mt-2 whitespace-pre-wrap text-[11px] text-muted-foreground/90">
                          {entry.exception}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border/40 px-5 py-4">
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={!canPrev}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              canPrev
                ? 'bg-card-elevated/70 text-foreground hover:bg-card-elevated'
                : 'bg-card-elevated/30 text-muted-foreground cursor-not-allowed'
            }`}
          >
            ← Previous
          </button>
          <span className="text-xs text-muted-foreground">Showing {logs.length} entries</span>
          <button
            onClick={() => setPage((prev) => prev + 1)}
            disabled={!canNext}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              canNext
                ? 'bg-card-elevated/70 text-foreground hover:bg-card-elevated'
                : 'bg-card-elevated/30 text-muted-foreground cursor-not-allowed'
            }`}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
