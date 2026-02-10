import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useState } from 'react';
import type { PendingMatchGroup } from '@shared/index';

function formatSize(sizeStr?: string): string {
  return sizeStr || 'Unknown';
}

function scoreColor(score?: number): string {
  if (!score) return 'text-muted-foreground';
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-yellow-500';
  return 'text-orange-500';
}

function sourceBadgeColor(source: string): string {
  const colors: Record<string, string> = {
    fitgirl: 'bg-pink-500/20 text-pink-400',
    dodi: 'bg-blue-500/20 text-blue-400',
    steamrip: 'bg-emerald-500/20 text-emerald-400',
    prowlarr: 'bg-orange-500/20 text-orange-400',
    hydra: 'bg-purple-500/20 text-purple-400',
    rezi: 'bg-cyan-500/20 text-cyan-400',
  };
  return colors[source.toLowerCase()] || 'bg-muted text-muted-foreground';
}

function trustLevelBadge(level?: string): { label: string; className: string } | null {
  if (!level) return null;
  const badges: Record<string, { label: string; className: string }> = {
    trusted: { label: 'Trusted', className: 'bg-green-500/20 text-green-400' },
    safe: { label: 'Safe', className: 'bg-blue-500/20 text-blue-400' },
    abandoned: { label: 'Abandoned', className: 'bg-yellow-500/20 text-yellow-400' },
    unsafe: { label: 'Unsafe', className: 'bg-red-500/20 text-red-400' },
    nsfw: { label: 'NSFW', className: 'bg-red-500/20 text-red-400' },
  };
  return badges[level] || null;
}

export function Approvals() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const { data: groups, isLoading } = useQuery({
    queryKey: ['approvals'],
    queryFn: () => api.approvals.getPending(),
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: (matchId: string) => api.approvals.approve(matchId),
    onMutate: (matchId) => {
      setLoadingIds(prev => new Set(prev).add(matchId));
    },
    onSuccess: (_data, matchId) => {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(matchId); return s; });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      showToast('Download started', 'success');
    },
    onError: (error: any, matchId) => {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(matchId); return s; });
      showToast(error?.response?.data?.error || 'Failed to approve', 'error');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (matchId: string) => api.approvals.reject(matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });

  const rejectAllMutation = useMutation({
    mutationFn: (igdbId: number) => api.approvals.rejectAllForGame(igdbId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      showToast('All matches rejected', 'success');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">Approvals</h1>
          <p className="text-muted-foreground mt-1">Loading pending matches...</p>
        </div>
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="rounded-xl border border-border/50 bg-card p-6 animate-pulse">
              <div className="flex gap-4">
                <div className="w-16 h-20 rounded-lg bg-muted" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 w-48 rounded bg-muted" />
                  <div className="h-4 w-32 rounded bg-muted" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Approvals</h1>
        <p className="text-muted-foreground mt-1">
          {groups && groups.length > 0
            ? `${groups.reduce((sum, g) => sum + g.matches.length, 0)} pending match${groups.reduce((sum, g) => sum + g.matches.length, 0) !== 1 ? 'es' : ''} across ${groups.length} game${groups.length !== 1 ? 's' : ''}`
            : 'No pending matches'}
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`rounded-lg p-4 flex items-center justify-between ${
          toast.type === 'success'
            ? 'bg-green-500/10 border border-green-500/30 text-green-600'
            : 'bg-red-500/10 border border-red-500/30 text-red-600'
        }`}>
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-lg hover:opacity-70">x</button>
        </div>
      )}

      {/* Empty State */}
      {(!groups || groups.length === 0) && (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🎮</div>
          <h2 className="text-xl font-semibold mb-2">No pending matches</h2>
          <p className="text-muted-foreground">
            When monitored games find download candidates, they'll appear here for review.
          </p>
        </div>
      )}

      {/* Game Groups */}
      {groups?.map((group: PendingMatchGroup) => (
        <div key={group.igdbId} className="rounded-xl border border-border/50 bg-card overflow-hidden">
          {/* Game Header */}
          <div className="flex items-center gap-4 p-5 border-b border-border/30 bg-card-elevated/30">
            {group.coverUrl ? (
              <img
                src={group.coverUrl.replace('t_thumb', 't_cover_small')}
                alt={group.gameName}
                className="w-12 h-16 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-16 rounded-lg bg-muted flex items-center justify-center text-xl flex-shrink-0">
                🎮
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg truncate">{group.gameName}</h3>
              <p className="text-sm text-muted-foreground">
                {group.matches.length} candidate{group.matches.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => rejectAllMutation.mutate(group.igdbId)}
              disabled={rejectAllMutation.isPending}
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
            >
              Dismiss All
            </button>
          </div>

          {/* Candidates */}
          <div className="divide-y divide-border/30">
            {group.matches.map((match) => (
              <div
                key={match.id}
                className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={match.candidate.title}>
                    {match.candidate.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${sourceBadgeColor(match.candidate.source)}`}>
                      {match.candidate.source}
                    </span>
                    {(() => {
                      const trust = trustLevelBadge(match.candidate.sourceTrustLevel);
                      return trust ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${trust.className}`}>
                          {trust.label}
                        </span>
                      ) : null;
                    })()}
                    {match.candidate.matchScore !== undefined && (
                      <span className={`text-xs font-mono ${scoreColor(match.candidate.matchScore)}`}>
                        Score: {match.candidate.matchScore}
                      </span>
                    )}
                    {match.candidate.size && (
                      <span className="text-xs text-muted-foreground">
                        {formatSize(match.candidate.size)}
                      </span>
                    )}
                    {match.candidate.releaseType && match.candidate.releaseType !== 'unknown' && (
                      <span className="text-xs text-muted-foreground capitalize">
                        {match.candidate.releaseType}
                      </span>
                    )}
                    {match.candidate.seeders !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        {match.candidate.seeders} seeders
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => approveMutation.mutate(match.id)}
                    disabled={loadingIds.has(match.id)}
                    className="text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {loadingIds.has(match.id) ? 'Starting...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => rejectMutation.mutate(match.id)}
                    disabled={rejectMutation.isPending}
                    className="text-sm px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
