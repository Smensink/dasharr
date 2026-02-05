import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useEffect, useMemo, useState } from 'react';
import type { TdarrJobSummary, TdarrQueueItem } from '@shared/index';
import { ServiceIcon } from '@/components/ServiceIcon';

function formatDateTime(value?: number) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatDuration(ms?: number) {
  if (!ms || ms <= 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getWorkerKey(nodeId: string, workerType: string) {
  return `${nodeId}:${workerType}`;
}

export function Tdarr() {
  const queryClient = useQueryClient();
  const [workerTargets, setWorkerTargets] = useState<Record<string, number>>({});

  const { data: overview, isLoading, error } = useQuery({
    queryKey: ['tdarr', 'overview'],
    queryFn: () => api.tdarr.getOverview(),
    refetchInterval: 10000,
  });

  const updateWorkersMutation = useMutation({
    mutationFn: (payload: { nodeId: string; workerType: string; target: number }) =>
      api.tdarr.updateWorkerLimit(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tdarr'] });
    },
  });

  const requeueMutation = useMutation({
    mutationFn: (payload: { file: string; title?: string; jobId?: string }) =>
      api.tdarr.requeueFailed(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tdarr'] });
    },
  });

  useEffect(() => {
    if (!overview?.nodes) return;
    setWorkerTargets((prev) => {
      const next = { ...prev };
      overview.nodes.forEach((node) => {
        (['transcodecpu', 'transcodegpu'] as const).forEach((type) => {
          const key = getWorkerKey(node.id, type);
          if (next[key] === undefined) {
            next[key] = node.workerLimits?.[type] ?? 0;
          }
        });
      });
      return next;
    });
  }, [overview]);

  const summaryCards = useMemo(() => {
    if (!overview) return [];
    const waiting = Math.max(overview.stats.queueSize - overview.stats.activeCount, 0);
    return [
      {
        title: 'Pipeline',
        value: overview.stats.queueSize,
        subtitle: `${overview.stats.activeCount} processing • ${waiting} waiting`,
        icon: '🧵',
      },
      {
        title: 'Transcodes / Hour',
        value: overview.stats.transcodesPerHour.toFixed(1),
        subtitle: `Last ${overview.stats.windowHours}h`,
        icon: '⚡',
      },
      {
        title: 'Last Hour',
        value: overview.stats.transcodesLastHour,
        subtitle: 'Completed',
        icon: '✅',
      },
      {
        title: 'Failures',
        value: overview.stats.failureCount,
        subtitle: 'Recent',
        icon: '⚠️',
      },
    ];
  }, [overview]);

  const handleWorkerChange = (nodeId: string, workerType: string, value: number) => {
    setWorkerTargets((prev) => ({
      ...prev,
      [getWorkerKey(nodeId, workerType)]: Math.max(0, value),
    }));
  };

  const handleWorkerUpdate = (nodeId: string, workerType: string) => {
    const key = getWorkerKey(nodeId, workerType);
    const target = workerTargets[key] ?? 0;
    updateWorkersMutation.mutate({ nodeId, workerType, target });
  };

  const renderQueueItem = (item: TdarrQueueItem) => (
    <div
      key={item.id}
      className="group relative rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm p-3 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm truncate" title={item.title}>
              {item.title}
            </p>
            {item.file && (
              <div className="relative group/tdarr-info">
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border/60 text-[9px] font-bold text-muted-foreground"
                >
                  i
                </span>
                <div className="pointer-events-none absolute left-1/2 top-5 z-20 w-64 -translate-x-1/2 rounded-xl border border-border/50 bg-background/95 px-3 py-2 text-[11px] font-medium text-muted-foreground shadow-xl opacity-0 transition-opacity group-hover/tdarr-info:opacity-100">
                  {item.file}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-2">
            {item.nodeName && (
              <span className="px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-semibold">
                {item.nodeName}
              </span>
            )}
            {item.workerType && (
              <span className="px-2 py-0.5 rounded-lg bg-background/60 border border-border/50 font-medium">
                {item.workerType}
              </span>
            )}
            {item.currentPlugin && (
              <span className="px-2 py-0.5 rounded-lg bg-card-elevated/60 border border-border/40 font-medium">
                {item.currentPlugin}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {item.status}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{formatDateTime(item.start)}</p>
        </div>
      </div>
    </div>
  );

  const renderJobItem = (item: TdarrJobSummary, isFailure = false) => (
    <div
      key={item.id}
      className="group relative rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm p-3 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm truncate" title={item.title}>
              {item.title}
            </p>
            {item.file && (
              <div className="relative group/tdarr-info">
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border/60 text-[9px] font-bold text-muted-foreground"
                >
                  i
                </span>
                <div className="pointer-events-none absolute left-1/2 top-5 z-20 w-64 -translate-x-1/2 rounded-xl border border-border/50 bg-background/95 px-3 py-2 text-[11px] font-medium text-muted-foreground shadow-xl opacity-0 transition-opacity group-hover/tdarr-info:opacity-100">
                  {item.file}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-2">
            {item.nodeName && (
              <span className="px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-semibold">
                {item.nodeName}
              </span>
            )}
            {item.type && (
              <span className="px-2 py-0.5 rounded-lg bg-background/60 border border-border/50 font-medium">
                {item.type}
              </span>
            )}
            {item.failureStep && isFailure && (
              <span className="px-2 py-0.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive font-semibold">
                {item.failureStep}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className={`text-xs font-bold ${isFailure ? 'text-destructive' : 'text-success'}`}>
            {item.status}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{formatDuration(item.duration)}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatDateTime(item.end)}</p>
        </div>
      </div>
      {isFailure && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => requeueMutation.mutate({ file: item.file, title: item.title, jobId: item.jobId })}
            disabled={requeueMutation.isPending}
            className="text-xs font-bold px-3 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            🔁 Re-add
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8 pb-20 md:pb-8 animate-fade-in">
      <div className="space-y-6 animate-slide-down">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">Tdarr</h1>
          <p className="text-muted-foreground text-base">
            Transcode queue, worker controls, and recent activity
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load Tdarr data. Check your connection and configuration.
        </div>
      )}

      {!isLoading && overview && (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card, idx) => (
            <div
              key={card.title}
              className="group relative rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm p-5 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 overflow-hidden animate-scale-in"
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <div className="text-2xl">{card.icon}</div>
                  <span className="text-sm text-muted-foreground">{card.subtitle}</span>
                </div>
                <p className="mt-4 text-3xl font-extrabold">{card.value}</p>
                <p className="text-sm font-semibold text-muted-foreground mt-1">{card.title}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {overview?.nodes?.length ? (
        <details className="rounded-2xl border border-border/50 bg-card-elevated/40 backdrop-blur-sm">
          <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-semibold text-foreground">
            <span className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
                <ServiceIcon service="tdarr" size={20} />
              </span>
              Worker Limits
            </span>
            <span className="text-xs text-muted-foreground">Adjust active worker counts</span>
          </summary>
          <div className="grid gap-4 border-t border-border/40 px-5 py-5 md:grid-cols-2">
            {overview.nodes.map((node) => (
              <div
                key={node.id}
                className="rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold">{node.name}</h3>
                    <p className="text-xs text-muted-foreground">Priority: {node.priority ?? '—'}</p>
                  </div>
                  {node.nodePaused && (
                    <span className="text-xs font-semibold text-destructive">Paused</span>
                  )}
                </div>

                <div className="mt-3 space-y-3">
                  {(['transcodecpu', 'transcodegpu'] as const).map((type) => {
                    const key = getWorkerKey(node.id, type);
                    const target = workerTargets[key] ?? 0;
                    const current = node.workerLimits?.[type] ?? 0;
                    return (
                      <div key={type} className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {type.replace('transcode', 'transcode ')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Current: <span className="font-bold text-foreground">{current}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            value={target}
                            onChange={(e) =>
                              handleWorkerChange(node.id, type, Number(e.target.value))
                            }
                            className="w-16 rounded-lg border border-border/50 bg-background-elevated/60 px-2 py-1 text-sm text-right"
                          />
                          <button
                            onClick={() => handleWorkerUpdate(node.id, type)}
                            disabled={updateWorkersMutation.isPending || target === current}
                            className="text-xs font-bold px-3 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-lg border border-primary/30">
              🎛️
            </div>
            <div>
              <h2 className="text-xl font-bold">Currently Processing</h2>
              <p className="text-xs text-muted-foreground">
                {overview?.activeJobs?.length || 0} active
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {overview?.activeJobs?.length
              ? overview.activeJobs.map(renderQueueItem)
              : (
                <div className="rounded-2xl border border-border/50 bg-card-elevated/40 p-6 text-sm text-muted-foreground">
                  No active jobs.
                </div>
              )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-lg border border-primary/30">
              📥
            </div>
            <div>
              <h2 className="text-xl font-bold">Queue</h2>
              <p className="text-xs text-muted-foreground">
                {overview?.queue?.length || 0} waiting
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {overview?.queue?.length
              ? overview.queue.map(renderQueueItem)
              : (
                <div className="rounded-2xl border border-border/50 bg-card-elevated/40 p-6 text-sm text-muted-foreground">
                  Queue is empty.
                </div>
              )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-lg border border-primary/30">
              ✅
            </div>
            <div>
              <h2 className="text-xl font-bold">Recent Successes</h2>
              <p className="text-xs text-muted-foreground">
                {overview?.successJobs?.length || 0} jobs
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {overview?.successJobs?.length
              ? overview.successJobs.slice(0, 20).map((item) => renderJobItem(item))
              : (
                <div className="rounded-2xl border border-border/50 bg-card-elevated/40 p-6 text-sm text-muted-foreground">
                  No recent successes.
                </div>
              )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-destructive/20 to-primary/20 flex items-center justify-center text-lg border border-destructive/30">
              🚨
            </div>
            <div>
              <h2 className="text-xl font-bold">Failures</h2>
              <p className="text-xs text-muted-foreground">
                {overview?.failedJobs?.length || 0} jobs
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {overview?.failedJobs?.length
              ? overview.failedJobs.slice(0, 20).map((item) => renderJobItem(item, true))
              : (
                <div className="rounded-2xl border border-border/50 bg-card-elevated/40 p-6 text-sm text-muted-foreground">
                  No recent failures.
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
