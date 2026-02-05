import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useState, useMemo, useEffect, type ReactNode } from 'react';
import {
  getHiddenDownloadIds,
  setHiddenDownloadIds,
  pruneHiddenDownloadIds,
} from '@/lib/hidden-downloads';
import { ServiceIcon } from '@/components/ServiceIcon';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + '/s';
}

// Extract the NZO ID from the queue item id (format: "sabnzbd:nzo_xxxx")
function extractNzoId(itemId: string): string {
  return itemId.replace('sabnzbd:', '');
}

// Extract the qBittorrent hash from the queue item id (format: "qbittorrent:hash")
function extractQbittorrentHash(itemId: string): string {
  return itemId.replace('qbittorrent:', '');
}

// Extract the RDT ID from the queue item id (format: "rdtclient:xxx")
function extractRdtId(itemId: string): string {
  return itemId.replace('rdtclient:', '');
}

// Normalize download client name for grouping
function normalizeDownloadClient(name: string | undefined): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower === 'qbittorrent' || lower.includes('qbit')) return 'qBittorrent';
  if (lower === 'sabnzbd' || lower.includes('sab') || lower.includes('nzb')) return 'SABnzbd';
  if (
    lower === 'rdtclient' ||
    lower.includes('rdt') ||
    lower.includes('realdebrid') ||
    lower.includes('real-debrid') ||
    lower.includes('debrid')
  ) {
    return 'RDTClient';
  }
  return null;
}

type NormalizedClient = 'qBittorrent' | 'SABnzbd' | 'RDTClient';

function getNormalizedClient(item: any): NormalizedClient | null {
  const normalized = normalizeDownloadClient(item.downloadClient);
  if (normalized) return normalized as NormalizedClient;
  if (typeof item.id === 'string') {
    if (item.id.startsWith('qbittorrent:')) return 'qBittorrent';
    if (item.id.startsWith('sabnzbd:')) return 'SABnzbd';
    if (item.id.startsWith('rdtclient:')) return 'RDTClient';
  }
  return null;
}

function getClientItemId(item: any, client: NormalizedClient | null): string | null {
  if (!client) return null;
  if (item.downloadId) return item.downloadId;
  if (typeof item.id !== 'string') return null;
  if (client === 'qBittorrent' && item.id.startsWith('qbittorrent:')) {
    return extractQbittorrentHash(item.id);
  }
  if (client === 'SABnzbd' && item.id.startsWith('sabnzbd:')) {
    return extractNzoId(item.id);
  }
  if (client === 'RDTClient' && item.id.startsWith('rdtclient:')) {
    return extractRdtId(item.id);
  }
  return null;
}

// Get parent *arr service from item
function getParentArr(item: any): string | null {
  // Check if source field is set (items from *arr services)
  if (item.source?.service) {
    return item.source.service;
  }
  // Fallback: check indexer patterns
  if (item.indexer) {
    const indexerLower = item.indexer.toLowerCase();
    if (indexerLower.includes('movie') || indexerLower.includes('radarr')) return 'Radarr';
    if (indexerLower.includes('tv') || indexerLower.includes('series') || indexerLower.includes('sonarr')) return 'Sonarr';
    if (indexerLower.includes('book') || indexerLower.includes('readarr')) return 'Readarr';
  }
  return null;
}

// Group download client items
interface GroupedItems {
  qbittorrent: any[];
  sabnzbd: any[];
  rdtclient: any[];
  arr: any[]; // Items from *arr services (not direct download client items)
}

export function Downloads() {
  const queryClient = useQueryClient();
  const [actioningItem, setActioningItem] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActioning, setBulkActioning] = useState(false);
  const [dedupeNotice, setDedupeNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getHiddenDownloadIds());
  const [showHidden, setShowHidden] = useState(false);

  // Use unified downloads queue
  const { data: queue } = useQuery({
    queryKey: ['downloads', 'queue'],
    queryFn: () => api.downloads.getQueue(),
    refetchInterval: 10000,
  });

  const { data: stats } = useQuery({
    queryKey: ['downloads', 'stats'],
    queryFn: () => api.downloads.getStats(),
    refetchInterval: 5000,
  });

  const allItems = queue || [];
  const visibleItems = useMemo(() => {
    if (!allItems.length) return [];
    if (showHidden) return allItems;
    return allItems.filter((item) => !hiddenIds.has(item.id));
  }, [allItems, hiddenIds, showHidden]);

  const hiddenCount = useMemo(() => {
    if (!allItems.length) return 0;
    let count = 0;
    allItems.forEach((item) => {
      if (hiddenIds.has(item.id)) {
        count += 1;
      }
    });
    return count;
  }, [allItems, hiddenIds]);

  // Group and deduplicate items
  const groupedItems = useMemo(() => {
    if (!visibleItems.length) return { qbittorrent: [], sabnzbd: [], rdtclient: [], arr: [] };

    const groups: GroupedItems = {
      qbittorrent: [],
      sabnzbd: [],
      rdtclient: [],
      arr: [],
    };

    // Track seen download IDs to deduplicate
    const seenDownloadIds = new Set<string>();

    for (const item of visibleItems) {
      const normalizedClient = getNormalizedClient(item);
      const clientItemId = getClientItemId(item, normalizedClient);
      const dedupeKey = normalizedClient && clientItemId
        ? `${normalizedClient}:${clientItemId}`
        : item.id;

      if (normalizedClient === 'qBittorrent') {
        if (!seenDownloadIds.has(dedupeKey)) {
          seenDownloadIds.add(dedupeKey);
          groups.qbittorrent.push(item);
        }
      } else if (normalizedClient === 'SABnzbd') {
        if (!seenDownloadIds.has(dedupeKey)) {
          seenDownloadIds.add(dedupeKey);
          groups.sabnzbd.push(item);
        }
      } else if (normalizedClient === 'RDTClient') {
        if (!seenDownloadIds.has(dedupeKey)) {
          seenDownloadIds.add(dedupeKey);
          groups.rdtclient.push(item);
        }
      } else {
        if (!seenDownloadIds.has(dedupeKey)) {
          seenDownloadIds.add(dedupeKey);
          groups.arr.push(item);
        }
      }
    }

    return groups;
  }, [visibleItems]);

  // qBittorrent mutations
  const pauseQBitTorrent = useMutation({
    mutationFn: (hash: string) => api.downloads.qbittorrent.pauseTorrent(hash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setActioningItem(null);
    },
  });

  const resumeQBitTorrent = useMutation({
    mutationFn: (hash: string) => api.downloads.qbittorrent.resumeTorrent(hash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setActioningItem(null);
    },
  });

  const recheckQBitTorrent = useMutation({
    mutationFn: (hash: string) => api.downloads.qbittorrent.recheckTorrent(hash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setActioningItem(null);
    },
  });

  const deleteQBitTorrent = useMutation({
    mutationFn: ({ hash, deleteFiles }: { hash: string; deleteFiles: boolean }) =>
      api.downloads.qbittorrent.deleteTorrent(hash, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setActioningItem(null);
    },
  });

  // SABnzbd mutations
  const pauseSabnzbdItem = useMutation({
    mutationFn: (nzoId: string) => api.downloads.sabnzbd.pauseItem(nzoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setActioningItem(null);
    },
  });

  const resumeSabnzbdItem = useMutation({
    mutationFn: (nzoId: string) => api.downloads.sabnzbd.resumeItem(nzoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setActioningItem(null);
    },
  });

  const deleteSabnzbdItem = useMutation({
    mutationFn: ({ nzoId, deleteFiles }: { nzoId: string; deleteFiles: boolean }) =>
      api.downloads.sabnzbd.deleteItem(nzoId, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setActioningItem(null);
    },
  });

  const moveSabnzbdItem = useMutation({
    mutationFn: ({ nzoId, position }: { nzoId: string; position: number }) =>
      api.downloads.sabnzbd.moveItem(nzoId, position),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setActioningItem(null);
    },
  });

  // RDTClient mutations
  const retryRdtTorrent = useMutation({
    mutationFn: (id: string) => api.downloads.rdtclient.retryTorrent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setActioningItem(null);
    },
  });

  const updateRdtTorrent = useMutation({
    mutationFn: (id: string) => api.downloads.rdtclient.updateTorrent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setActioningItem(null);
    },
  });

  const deleteRdtTorrent = useMutation({
    mutationFn: ({ id, deleteFiles }: { id: string; deleteFiles: boolean }) =>
      api.downloads.rdtclient.deleteTorrent(id, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setActioningItem(null);
    },
  });

  const runDedupe = useMutation({
    mutationFn: () => api.downloads.dedupeQueue(),
    onSuccess: (data: any) => {
      const totalRemoved = Number(data?.totalRemoved || 0);
      setDedupeNotice({
        type: 'success',
        message: totalRemoved > 0
          ? `Removed ${totalRemoved} duplicate download${totalRemoved !== 1 ? 's' : ''}.`
          : 'No duplicate downloads found.',
      });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error || error?.message || 'Failed to dedupe queue';
      setDedupeNotice({ type: 'error', message });
    },
  });

  const handlePause = (item: any) => {
    setActioningItem(item.id);
    const normalizedClient = getNormalizedClient(item);
    const clientItemId = getClientItemId(item, normalizedClient);
    if (normalizedClient === 'qBittorrent' && clientItemId) {
      pauseQBitTorrent.mutate(clientItemId);
    } else if (normalizedClient === 'SABnzbd' && clientItemId) {
      pauseSabnzbdItem.mutate(clientItemId);
    }
  };

  const handleResume = (item: any) => {
    setActioningItem(item.id);
    const normalizedClient = getNormalizedClient(item);
    const clientItemId = getClientItemId(item, normalizedClient);
    if (normalizedClient === 'qBittorrent' && clientItemId) {
      resumeQBitTorrent.mutate(clientItemId);
    } else if (normalizedClient === 'SABnzbd' && clientItemId) {
      resumeSabnzbdItem.mutate(clientItemId);
    }
  };

  const handleRecheck = (item: any) => {
    setActioningItem(item.id);
    const normalizedClient = getNormalizedClient(item);
    const clientItemId = getClientItemId(item, normalizedClient);
    if (normalizedClient === 'qBittorrent' && clientItemId) {
      recheckQBitTorrent.mutate(clientItemId);
    }
  };

  const handleRetry = (item: any) => {
    setActioningItem(item.id);
    const normalizedClient = getNormalizedClient(item);
    const clientItemId = getClientItemId(item, normalizedClient);
    if (normalizedClient === 'RDTClient' && clientItemId) {
      retryRdtTorrent.mutate(clientItemId);
    }
  };

  const handleRefresh = (item: any) => {
    setActioningItem(item.id);
    const normalizedClient = getNormalizedClient(item);
    const clientItemId = getClientItemId(item, normalizedClient);
    if (normalizedClient === 'RDTClient' && clientItemId) {
      updateRdtTorrent.mutate(clientItemId);
    }
  };

  const handleDelete = (item: any) => {
    if (!confirm(`Delete "${item.title}"?\n\nThis will remove the download and delete the files.`)) {
      return;
    }
    setActioningItem(item.id);
    const normalizedClient = getNormalizedClient(item);
    const clientItemId = getClientItemId(item, normalizedClient);
    if (normalizedClient === 'qBittorrent' && clientItemId) {
      deleteQBitTorrent.mutate({ hash: clientItemId, deleteFiles: true });
    } else if (normalizedClient === 'SABnzbd' && clientItemId) {
      deleteSabnzbdItem.mutate({ nzoId: clientItemId, deleteFiles: true });
    } else if (normalizedClient === 'RDTClient' && clientItemId) {
      deleteRdtTorrent.mutate({ id: clientItemId, deleteFiles: true });
    }
  };

  const handleMoveUp = (item: any, index: number) => {
    if (index === 0) return;
    setActioningItem(item.id);
    const normalizedClient = getNormalizedClient(item);
    const clientItemId = getClientItemId(item, normalizedClient);
    if (normalizedClient === 'SABnzbd' && clientItemId) {
      moveSabnzbdItem.mutate({ nzoId: clientItemId, position: index - 1 });
    }
  };

  const handleMoveDown = (item: any, index: number, totalItems: number) => {
    if (index >= totalItems - 1) return;
    setActioningItem(item.id);
    const normalizedClient = getNormalizedClient(item);
    const clientItemId = getClientItemId(item, normalizedClient);
    if (normalizedClient === 'SABnzbd' && clientItemId) {
      moveSabnzbdItem.mutate({ nzoId: clientItemId, position: index + 1 });
    }
  };

  const handleMoveToTop = (item: any) => {
    setActioningItem(item.id);
    const normalizedClient = getNormalizedClient(item);
    const clientItemId = getClientItemId(item, normalizedClient);
    if (normalizedClient === 'SABnzbd' && clientItemId) {
      moveSabnzbdItem.mutate({ nzoId: clientItemId, position: 0 });
    }
  };

  const isActioning = (itemId: string) => actioningItem === itemId;

  const toggleSelected = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(visibleItems.map((item) => item.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    const selectedItems = allItems.filter((item) => selectedIds.has(item.id));
    if (selectedItems.length === 0) return;
    if (!confirm(`Delete ${selectedItems.length} selected item${selectedItems.length !== 1 ? 's' : ''}?\n\nThis will remove the downloads and delete the files.`)) {
      return;
    }

    setBulkActioning(true);
    try {
      for (const item of selectedItems) {
        const normalizedClient = getNormalizedClient(item);
        const clientItemId = getClientItemId(item, normalizedClient);
        if (!clientItemId || !normalizedClient) continue;

        if (normalizedClient === 'qBittorrent') {
          await api.downloads.qbittorrent.deleteTorrent(clientItemId, true);
        } else if (normalizedClient === 'SABnzbd') {
          await api.downloads.sabnzbd.deleteItem(clientItemId, true);
        } else if (normalizedClient === 'RDTClient') {
          await api.downloads.rdtclient.deleteTorrent(clientItemId, true);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      clearSelection();
    } finally {
      setBulkActioning(false);
    }
  };

  const totalItems = (groupedItems.qbittorrent.length + groupedItems.sabnzbd.length +
                      groupedItems.rdtclient.length + groupedItems.arr.length);
  const summaryCards = [
    {
      key: 'qbittorrent',
      title: 'qBittorrent',
      service: 'qbittorrent',
      stats: stats?.qbittorrent,
      items: groupedItems.qbittorrent,
    },
    {
      key: 'sabnzbd',
      title: 'SABnzbd',
      service: 'sabnzbd',
      stats: stats?.sabnzbd,
      items: groupedItems.sabnzbd,
    },
    {
      key: 'rdtclient',
      title: 'RDTClient',
      service: 'rdtclient',
      stats: stats?.rdtclient,
      items: groupedItems.rdtclient,
    },
  ];
  const hasSummaryCards = !!queue || !!stats;
  const selectedCount = selectedIds.size;

  useEffect(() => {
    if (!queue) return;
    const availableIds = queue.map((item) => item.id);
    setHiddenIds((prev) => {
      const next = pruneHiddenDownloadIds(prev, availableIds);
      if (next.size !== prev.size) {
        setHiddenDownloadIds(next);
      }
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(
        [...prev].filter((id) => availableIds.includes(id) && (showHidden || !hiddenIds.has(id)))
      );
      return next;
    });
  }, [queue, showHidden, hiddenIds]);

  const handleHideItem = (itemId: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(itemId);
      setHiddenDownloadIds(next);
      return next;
    });
    setSelectedIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  };

  const handleUnhideItem = (itemId: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      setHiddenDownloadIds(next);
      return next;
    });
  };

  // Render a download item card
  const renderDownloadItem = (item: any, index: number, items: any[], showReorder: boolean = false) => {
    const parentArr = getParentArr(item);
    const progress = item.progress || (item.size > 0 ? ((item.size - item.sizeleft) / item.size * 100) : 0);
    const isSelected = selectedIds.has(item.id);
    const isHidden = hiddenIds.has(item.id);

    return (
      <div
        key={item.id}
        className={`group relative rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm p-5 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300 ${
          isHidden ? 'opacity-70' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelected(item.id)}
              className="mt-1.5 rounded border-border/50"
              aria-label={`Select ${item.title}`}
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-base truncate text-foreground group-hover:text-primary transition-colors">{item.title}</h3>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mt-2">
                <span className="px-2 py-0.5 rounded-lg bg-background/60 backdrop-blur-sm border border-border/50 text-xs font-medium">{item.protocol || 'Unknown'}</span>
                {parentArr && (
                  <span className="px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-bold">
                    {parentArr}
                  </span>
                )}
                {item.game?.installed && (
                  <span
                    className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs font-bold"
                    title={item.game.matchName || 'Installed'}
                  >
                    Installed
                  </span>
                )}
                {item.indexer && <span className="text-xs font-medium">• {item.indexer}</span>}
                {item.category && <span className="text-xs font-medium">• {item.category}</span>}
              </div>
            </div>
          </div>

          <div className="text-right">
            <p className="font-bold text-base capitalize text-foreground">{item.status}</p>
            {progress > 0 && (
              <p className="text-2xl font-extrabold text-primary mt-1">
                {progress.toFixed(0)}%
              </p>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {item.size > 0 && (
          <div className="mt-4">
            <div className="relative">
              <div className="w-full bg-border/30 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary via-accent to-primary h-2.5 rounded-full transition-all duration-500 relative overflow-hidden"
                  style={{ width: `${Math.min(progress, 100).toFixed(1)}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                </div>
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2 font-medium">
              <span>
                {item.sizeleft !== undefined
                  ? `${formatBytes(item.size - item.sizeleft)} / ${formatBytes(item.size)}`
                  : formatBytes(item.size)}
              </span>
              {item.timeleft && <span className="text-primary font-bold">{item.timeleft}</span>}
            </div>
          </div>
        )}

        {item.errorMessage && (
          <p className="mt-3 text-sm text-destructive font-semibold bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{item.errorMessage}</p>
        )}

        {/* Action buttons */}
        {(() => {
          const normalizedClient = getNormalizedClient(item);
          return (
            <div className="mt-4 flex flex-wrap gap-2">
              {/* Pause/Resume for qBittorrent and SABnzbd */}
              {(normalizedClient === 'qBittorrent' || normalizedClient === 'SABnzbd') && (
                <>
                  {item.status !== 'paused' && (
                    <button
                      onClick={() => handlePause(item)}
                      disabled={isActioning(item.id)}
                      className="text-xs font-bold px-3 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      ⏸ Pause
                    </button>
                  )}
                  {item.status === 'paused' && (
                    <button
                      onClick={() => handleResume(item)}
                      disabled={isActioning(item.id)}
                      className="text-xs font-bold px-3 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      ▶ Resume
                    </button>
                  )}
                </>
              )}

              {/* Recheck for qBittorrent */}
              {normalizedClient === 'qBittorrent' && (
                <button
                  onClick={() => handleRecheck(item)}
                  disabled={isActioning(item.id)}
                  className="text-xs font-bold px-3 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  🔄 Recheck
                </button>
              )}

              {/* RDTClient actions */}
              {normalizedClient === 'RDTClient' && (
                <>
                  <button
                    onClick={() => handleRetry(item)}
                    disabled={isActioning(item.id)}
                    className="text-xs font-bold px-3 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    🔄 Retry
                  </button>
                  <button
                    onClick={() => handleRefresh(item)}
                    disabled={isActioning(item.id)}
                    className="text-xs font-bold px-3 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    🔃 Refresh
                  </button>
                </>
              )}

              {/* Reorder buttons for SABnzbd */}
              {showReorder && normalizedClient === 'SABnzbd' && (
                <>
                  {index > 0 && (
                    <>
                      <button
                        onClick={() => handleMoveToTop(item)}
                        disabled={isActioning(item.id)}
                        className="text-xs font-bold px-3 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        title="Move to top"
                      >
                        ⏫ Top
                      </button>
                      <button
                        onClick={() => handleMoveUp(item, index)}
                        disabled={isActioning(item.id)}
                        className="text-xs font-bold px-3 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        title="Move up"
                      >
                        ↑ Up
                      </button>
                    </>
                  )}
                  {index < items.length - 1 && (
                    <button
                      onClick={() => handleMoveDown(item, index, items.length)}
                      disabled={isActioning(item.id)}
                      className="text-xs font-bold px-3 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      title="Move down"
                    >
                      ↓ Down
                    </button>
                  )}
                </>
              )}

              {/* Delete for all download clients */}
              {normalizedClient && (
                <button
                  onClick={() => handleDelete(item)}
                  disabled={isActioning(item.id)}
                  className="text-xs font-bold px-3 py-2 rounded-xl border border-destructive/50 text-destructive bg-destructive/5 hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  🗑 Delete
                </button>
              )}
              {isHidden ? (
                <button
                  onClick={() => handleUnhideItem(item.id)}
                  className="text-xs font-bold px-3 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all"
                >
                  👁️ Show
                </button>
              ) : (
                <button
                  onClick={() => handleHideItem(item.id)}
                  className="text-xs font-bold px-3 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all"
                >
                  🙈 Hide
                </button>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  // Render a section for a download client
  const renderSection = (title: string, icon: ReactNode, items: any[], showReorder: boolean = false) => {
    if (items.length === 0) return null;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/30">
            {icon}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground">
              {items.length} item{items.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="space-y-4">
          {items.map((item, index) => renderDownloadItem(item, index, items, showReorder))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-20 md:pb-8 animate-fade-in">
      {/* Header Section */}
      <div className="space-y-6 animate-slide-down">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">Downloads</h1>
            <p className="text-muted-foreground text-base">
              <span className="text-primary font-bold text-lg">{totalItems}</span> item{totalItems !== 1 ? 's' : ''} in queue
              {hiddenCount > 0 && !showHidden ? (
                <span className="ml-2 text-xs font-semibold text-muted-foreground/80">
                  ({hiddenCount} hidden)
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => runDedupe.mutate()}
              disabled={runDedupe.isPending}
              className="text-xs font-bold px-4 py-2.5 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {runDedupe.isPending ? 'Deduping...' : '🧹 Deduplicate'}
            </button>
            {hiddenCount > 0 && (
              <button
                onClick={() => setShowHidden((prev) => !prev)}
                className="text-xs font-bold px-4 py-2.5 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all"
              >
                {showHidden ? `🙈 Hide Hidden (${hiddenCount})` : `👁️ Show Hidden (${hiddenCount})`}
              </button>
            )}
          </div>
        </div>
      </div>

      {dedupeNotice && (
        <div
          className={`rounded-xl border p-4 text-sm font-semibold flex items-center gap-3 animate-slide-down ${
            dedupeNotice.type === 'success'
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-destructive/40 bg-destructive/10 text-destructive'
          }`}
        >
          <span className="text-xl">{dedupeNotice.type === 'success' ? '✅' : '⚠️'}</span>
          {dedupeNotice.message}
        </div>
      )}

      {totalItems > 0 && (
        <div className="sticky top-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card-elevated/80 backdrop-blur-sm px-6 py-4 shadow-lg animate-slide-down">
          <div className="text-sm font-semibold">
            <span className="text-primary font-bold text-lg">{selectedCount}</span>{' '}
            <span className="text-muted-foreground">
              selected / {visibleItems.length} total
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={selectAll}
              disabled={visibleItems.length === 0 || selectedCount === visibleItems.length}
              className="text-xs font-bold px-4 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Select All
            </button>
            <button
              onClick={clearSelection}
              disabled={selectedCount === 0}
              className="text-xs font-bold px-4 py-2 rounded-xl border border-border/50 bg-card-elevated/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Clear
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={selectedCount === 0 || bulkActioning}
              className="text-xs font-bold px-4 py-2 rounded-xl border border-destructive/50 text-destructive bg-destructive/5 hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {bulkActioning ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        </div>
      )}

      {/* Download Stats */}
      {hasSummaryCards && (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {summaryCards.map((card, idx) => {
            const isAvailable = card.stats?.isAvailable;
            const itemCount = card.items.length;
            return (
              <div
                key={card.key}
                className="group relative rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm p-6 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 overflow-hidden animate-scale-in"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/30">
                        <ServiceIcon service={card.service} size={26} />
                      </div>
                      <h3 className="font-bold text-lg tracking-tight">{card.title}</h3>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    {isAvailable ? (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground font-medium">Download:</span>
                          <span className="font-bold text-success flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                            {formatSpeed(card.stats.downloadSpeed || 0)}
                          </span>
                        </div>
                        {card.key === 'qbittorrent' && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground font-medium">Upload:</span>
                            <span className="font-bold text-primary">
                              ↑ {formatSpeed(card.stats.uploadSpeed || 0)}
                            </span>
                          </div>
                        )}
                        {card.key !== 'qbittorrent' && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground font-medium">Queue:</span>
                            <span className="font-bold text-foreground">
                              {card.stats.totalDownloading ?? itemCount} item{(card.stats.totalDownloading ?? itemCount) !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        {card.key === 'sabnzbd' && card.stats.diskSpace && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground font-medium">Free space:</span>
                            <span className="font-bold text-foreground">
                              {formatBytes(card.stats.diskSpace.free)}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground font-medium">Queue:</span>
                          <span className="font-bold text-foreground">
                            {itemCount} item{itemCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground font-medium">Status:</span>
                          <span className="font-bold text-muted-foreground">Unavailable</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Download sections by client */}
      <div className="space-y-8">
        {renderSection('qBittorrent', <ServiceIcon service="qbittorrent" size={26} />, groupedItems.qbittorrent)}
        {renderSection('SABnzbd', <ServiceIcon service="sabnzbd" size={26} />, groupedItems.sabnzbd, true)}
        {renderSection('RDTClient', <ServiceIcon service="rdtclient" size={26} />, groupedItems.rdtclient)}
        {renderSection('Activity Queue', <span className="text-xl">📋</span>, groupedItems.arr)}
      </div>

      {totalItems === 0 && (
        <div className="text-center py-20 space-y-4 animate-fade-in">
          <div className="text-8xl opacity-20 mb-4">⬇️</div>
          <p className="text-xl font-bold text-foreground">No active downloads</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Downloads will appear here when active
          </p>
        </div>
      )}
    </div>
  );
}
