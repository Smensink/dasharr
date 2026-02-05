import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ServiceIcon } from '@/components/ServiceIcon';

interface IndexerStat {
  indexerId: number;
  indexerName: string;
  averageResponseTime: number;
  numberOfQueries: number;
  numberOfGrabs: number;
  numberOfRssQueries: number;
  numberOfAuthQueries: number;
  numberOfFailedQueries: number;
  numberOfFailedGrabs: number;
  numberOfFailedRssQueries: number;
  numberOfFailedAuthQueries: number;
}

interface ProwlarrStats {
  indexers: IndexerStat[];
  userAgents: any[];
  hosts: any[];
}

export function Stats() {
  const { data: statsData, isLoading, error } = useQuery<ProwlarrStats>({
    queryKey: ['prowlarr', 'stats'],
    queryFn: () => api.prowlarr.getIndexerStats(),
    refetchInterval: 30000,
  });

  const indexerStats = statsData?.indexers;

  const formatResponseTime = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const calculateSuccessRate = (total: number, failed: number): number => {
    if (total === 0) return 0;
    return ((total - failed) / total) * 100;
  };

  const getTotalStats = () => {
    if (!indexerStats || !Array.isArray(indexerStats) || indexerStats.length === 0) {
      return {
        totalQueries: 0,
        totalGrabs: 0,
        totalFailed: 0,
        avgResponseTime: 0,
      };
    }

    const totalQueries = indexerStats.reduce((sum: number, stat: IndexerStat) => sum + stat.numberOfQueries, 0);
    const totalGrabs = indexerStats.reduce((sum: number, stat: IndexerStat) => sum + stat.numberOfGrabs, 0);
    const totalFailed = indexerStats.reduce((sum: number, stat: IndexerStat) => sum + stat.numberOfFailedQueries, 0);
    const avgResponseTime = indexerStats.reduce((sum: number, stat: IndexerStat) => sum + stat.averageResponseTime, 0) / indexerStats.length;

    return { totalQueries, totalGrabs, totalFailed, avgResponseTime };
  };

  const totals = getTotalStats();

  if (isLoading) {
    return (
      <div className="space-y-6 pb-20 md:pb-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">Indexer Statistics</h1>
          <p className="text-muted-foreground text-base">Loading indexer statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 pb-20 md:pb-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">Indexer Statistics</h1>
          <p className="text-destructive text-base">Failed to load indexer statistics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 md:pb-8 animate-fade-in">
      {/* Header */}
      <div className="space-y-6 animate-slide-down">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">Indexer Statistics</h1>
          <p className="text-muted-foreground text-base">
            Performance metrics and statistics from all configured Prowlarr indexers
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 animate-slide-up">
        <div className="group relative rounded-2xl border border-border/50 bg-gradient-to-br from-card-elevated/60 to-card/40 backdrop-blur-sm p-6 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Total Queries</p>
              <p className="text-4xl font-extrabold tracking-tight mb-1">{totals.totalQueries.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">All time</p>
            </div>
            <div className="text-5xl opacity-40 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">🔍</div>
          </div>
        </div>

        <div className="group relative rounded-2xl border border-border/50 bg-gradient-to-br from-card-elevated/60 to-card/40 backdrop-blur-sm p-6 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-green-400 uppercase tracking-wide mb-3">Total Grabs</p>
              <p className="text-4xl font-extrabold tracking-tight mb-1">{totals.totalGrabs.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Successful downloads</p>
            </div>
            <div className="text-5xl opacity-40 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">✅</div>
          </div>
        </div>

        <div className="group relative rounded-2xl border border-border/50 bg-gradient-to-br from-card-elevated/60 to-card/40 backdrop-blur-sm p-6 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-3">Failed Queries</p>
              <p className="text-4xl font-extrabold tracking-tight mb-1">{totals.totalFailed.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                {totals.totalQueries > 0 ? `${((totals.totalFailed / totals.totalQueries) * 100).toFixed(1)}% failure rate` : 'No queries'}
              </p>
            </div>
            <div className="text-5xl opacity-40 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">❌</div>
          </div>
        </div>

        <div className="group relative rounded-2xl border border-border/50 bg-gradient-to-br from-card-elevated/60 to-card/40 backdrop-blur-sm p-6 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-accent uppercase tracking-wide mb-3">Avg Response Time</p>
              <p className="text-4xl font-extrabold tracking-tight mb-1">
                {totals.avgResponseTime > 0 ? formatResponseTime(totals.avgResponseTime).split(/(\d+\.?\d*)/)[1] : '0'}
              </p>
              <p className="text-xs text-muted-foreground">
                {totals.avgResponseTime > 0 ? formatResponseTime(totals.avgResponseTime).split(/(\d+\.?\d*)/)[2] : 'ms'}
              </p>
            </div>
            <div className="text-5xl opacity-40 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">⚡</div>
          </div>
        </div>
      </div>

      {/* Indexer Statistics Table */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/30">
            <ServiceIcon service="prowlarr" size={26} />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Indexer Performance</h2>
            <p className="text-sm text-muted-foreground">
              Detailed statistics for each indexer
            </p>
          </div>
        </div>

        {!indexerStats || !Array.isArray(indexerStats) || indexerStats.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <div className="text-6xl opacity-20">📊</div>
            <p className="text-muted-foreground font-medium">No indexer statistics available</p>
            <p className="text-xs text-muted-foreground/70">Configure indexers in Prowlarr to see statistics</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background/40 border-b border-border/50">
                  <tr>
                    <th className="text-left p-4 font-bold text-sm text-foreground">Indexer</th>
                    <th className="text-center p-4 font-bold text-sm text-foreground">Queries</th>
                    <th className="text-center p-4 font-bold text-sm text-foreground">Grabs</th>
                    <th className="text-center p-4 font-bold text-sm text-foreground">Success Rate</th>
                    <th className="text-center p-4 font-bold text-sm text-foreground">Avg Response</th>
                    <th className="text-center p-4 font-bold text-sm text-foreground">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(indexerStats) && indexerStats
                    .sort((a: IndexerStat, b: IndexerStat) => b.numberOfQueries - a.numberOfQueries)
                    .map((stat: IndexerStat, index: number) => {
                      const successRate = calculateSuccessRate(stat.numberOfQueries, stat.numberOfFailedQueries);
                      return (
                        <tr
                          key={stat.indexerId}
                          className="border-b border-border/30 hover:bg-card-elevated/80 transition-colors duration-200"
                        >
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-sm font-bold text-primary border border-primary/30">
                                {index + 1}
                              </div>
                              <span className="font-semibold text-foreground">{stat.indexerName}</span>
                            </div>
                          </td>
                          <td className="p-4 text-center font-medium text-foreground">
                            {stat.numberOfQueries.toLocaleString()}
                          </td>
                          <td className="p-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-success/10 text-success font-bold text-sm">
                              ✓ {stat.numberOfGrabs.toLocaleString()}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-20 h-2 bg-background-elevated rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-500 ${
                                    successRate >= 90 ? 'bg-success' : successRate >= 70 ? 'bg-accent' : 'bg-destructive'
                                  }`}
                                  style={{ width: `${successRate}%` }}
                                />
                              </div>
                              <span className="font-bold text-sm text-foreground">{successRate.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`font-bold text-sm ${
                              stat.averageResponseTime < 1000 ? 'text-success' :
                              stat.averageResponseTime < 3000 ? 'text-accent' : 'text-destructive'
                            }`}>
                              {formatResponseTime(stat.averageResponseTime)}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-destructive/10 text-destructive font-bold text-sm">
                              ✗ {stat.numberOfFailedQueries.toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
