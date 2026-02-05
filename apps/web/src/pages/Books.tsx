import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api/client';

export function Books() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'wanted' | 'missing'>('all');
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const [plexLoadingId, setPlexLoadingId] = useState<number | null>(null);

  const { data: books, isLoading, error } = useQuery({
    queryKey: ['readarr', 'books'],
    queryFn: () => api.readarr.getBooks(),
  });

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

  const triggerSearch = useMutation({
    mutationFn: ({ id, interactive }: { id: number; interactive: boolean }) =>
      api.readarr.triggerSearch(id, interactive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['readarr', 'books'] });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error || error?.message || 'Failed to start search';
      setNotice('error', message);
    },
  });

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredBooks = useMemo(() => {
    if (!books) return [];

    return books.filter((book: any) => {
      const bookFileCount =
        book.bookFileCount ?? book.statistics?.bookFileCount ?? 0;
      const hasEditionFile = Array.isArray(book.editions)
        ? book.editions.some((edition: any) => edition.bookFileId)
        : false;
      const isAvailable = bookFileCount > 0 || hasEditionFile;
      const isGrabbed = book.grabbed || (Array.isArray(book.editions) && book.editions.some((edition: any) => edition.grabbed));
      const status = isAvailable ? 'available' : (isGrabbed || book.monitored) ? 'wanted' : 'missing';
      if (statusFilter !== 'all' && status !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) return true;
      const fields = [
        book.title,
        book.authorTitle,
        book.seriesTitle,
        book.isbn13,
        book.isbn10,
        book.year,
      ];
      return fields.some((field) =>
        field?.toString().toLowerCase().includes(normalizedQuery)
      );
    });
  }, [books, normalizedQuery, statusFilter]);

  const statusOptions: Array<{ key: 'all' | 'available' | 'wanted' | 'missing'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'available', label: 'Available' },
    { key: 'wanted', label: 'Wanted' },
    { key: 'missing', label: 'Missing' },
  ];

  const handleSearch = (id: number, interactive: boolean) => {
    setActioningId(id);
    triggerSearch.mutate(
      { id, interactive },
      {
        onSuccess: () => {
          const label = interactive ? 'Interactive search started' : 'Automatic search started';
          setNotice('success', label);
        },
        onSettled: () => {
          window.setTimeout(() => setActioningId(null), 400);
        },
      }
    );
  };

  const handleWatchOnPlex = async (book: any) => {
    setPlexLoadingId(book.id);
    try {
      // Try searching by title for audiobooks
      const searchQuery = `${book.title} ${book.authorTitle || ''}`.trim();
      const plexMedia = await api.plex.searchMedia(searchQuery);

      if (plexMedia && plexMedia.length > 0) {
        const firstResult = plexMedia[0];
        if (firstResult.machineIdentifier && firstResult.ratingKey) {
          // Use the key field which is the full path like /library/metadata/12345
          const key = firstResult.key || `/library/metadata/${firstResult.ratingKey}`;
          const plexUrl = `https://app.plex.tv/desktop/#!/server/${firstResult.machineIdentifier}/details?key=${encodeURIComponent(key)}`;
          window.open(plexUrl, '_blank');
        } else {
          setNotice('error', 'Book not found in Plex library');
        }
      } else {
        setNotice('error', 'Book not found in Plex library');
      }
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Failed to find book in Plex';
      setNotice('error', message);
    } finally {
      setPlexLoadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Books</h1>
        <p className="text-muted-foreground">Loading books...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Books</h1>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">
            Failed to load books. Make sure Readarr is configured and running.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 md:pb-8 animate-fade-in">
      {/* Header Section */}
      <div className="space-y-6 animate-slide-down">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">Books</h1>
          <p className="text-muted-foreground text-base">
            <span className="text-primary font-bold text-lg">{books?.length || 0}</span> books in your library
          </p>
        </div>

        {/* Search and Filters */}
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-3">
              <label className="text-sm font-bold text-foreground uppercase tracking-wide">Search Library</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">
                  🔍
                </div>
                <input
                  type="text"
                  placeholder="Search by title, author, or ISBN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-border/50 bg-background-elevated/60 pl-12 pr-4 py-3.5 text-sm font-medium ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary/50 transition-all"
                />
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Showing <span className="text-primary font-bold">{filteredBooks.length}</span> of <span className="text-foreground font-bold">{books?.length || 0}</span> books
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setStatusFilter(option.key)}
                  className={`text-xs font-bold px-4 py-2.5 rounded-xl border transition-all duration-300 ${
                    statusFilter === option.key
                      ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground border-primary/30 shadow-lg shadow-primary/30'
                      : 'bg-card-elevated/50 text-muted-foreground border-border/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action Notice */}
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

      {/* Books Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {filteredBooks.map((book: any, idx: number) => (
          <div
            key={book.id}
            className="group relative rounded-2xl border border-border/50 bg-card-elevated/60 backdrop-blur-sm overflow-hidden hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/40 transition-all duration-500 hover:-translate-y-2 animate-scale-in"
            style={{ animationDelay: `${(idx % 12) * 40}ms` }}
          >
            {/* Cover */}
            <div className="relative overflow-hidden">
              {book.images?.find((img: any) => img.coverType === 'cover') ? (
                <img
                  src={
                    book.images.find((img: any) => img.coverType === 'cover')
                      ?.remoteUrl
                  }
                  alt={book.title}
                  className="w-full aspect-[2/3] object-cover group-hover:scale-110 transition-transform duration-700"
                  loading="lazy"
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-gradient-to-br from-muted to-background flex items-center justify-center">
                  <span className="text-5xl opacity-30">📚</span>
                </div>
              )}

              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* Status Badge */}
              <div className="absolute top-3 right-3">
                {(() => {
                  const bookFileCount =
                    book.bookFileCount ?? book.statistics?.bookFileCount ?? 0;
                  const hasEditionFile = Array.isArray(book.editions)
                    ? book.editions.some((edition: any) => edition.bookFileId)
                    : false;
                  const isAvailable = bookFileCount > 0 || hasEditionFile;
                  const isGrabbed =
                    book.grabbed ||
                    (Array.isArray(book.editions) &&
                      book.editions.some((edition: any) => edition.grabbed));

                  if (isAvailable) {
                    return (
                      <div className="px-2.5 py-1 rounded-lg bg-success/90 backdrop-blur-sm border border-success/50 flex items-center gap-1.5 shadow-lg">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-wide">Available</span>
                      </div>
                    );
                  }
                  if (isGrabbed || book.monitored) {
                    return (
                      <div className="px-2.5 py-1 rounded-lg bg-primary/90 backdrop-blur-sm border border-primary/50 flex items-center gap-1.5 shadow-lg">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-wide">Wanted</span>
                      </div>
                    );
                  }
                  return (
                    <div className="px-2.5 py-1 rounded-lg bg-muted/90 backdrop-blur-sm border border-border/50 flex items-center gap-1.5 shadow-lg">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Missing</span>
                    </div>
                  );
                })()}
              </div>

              {/* Quick Actions - show on hover */}
              <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSearch(book.id, false)}
                    disabled={actioningId === book.id}
                    className="flex-1 text-xs font-bold px-2 py-2 rounded-lg bg-background/95 backdrop-blur-sm border border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                  >
                    {actioningId === book.id ? '...' : '🔎'}
                  </button>
                  <button
                    onClick={() => handleSearch(book.id, true)}
                    disabled={actioningId === book.id}
                    className="flex-1 text-xs font-bold px-2 py-2 rounded-lg bg-background/95 backdrop-blur-sm border border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                  >
                    {actioningId === book.id ? '...' : '🧭'}
                  </button>
                </div>
                <button
                  onClick={() => handleWatchOnPlex(book)}
                  disabled={plexLoadingId === book.id}
                  className="w-full text-xs font-bold px-2 py-2 rounded-lg bg-gradient-to-r from-primary to-accent backdrop-blur-sm border border-primary/30 text-primary-foreground hover:shadow-lg hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                  {plexLoadingId === book.id ? '...' : '🎧 Listen on Plex'}
                </button>
              </div>
            </div>

            {/* Info */}
            <div className="p-4 space-y-2">
              <h3 className="font-bold text-sm line-clamp-2 text-foreground group-hover:text-primary transition-colors leading-tight">
                {book.title}
              </h3>
              <p className="text-xs text-muted-foreground font-semibold line-clamp-1">
                {book.authorTitle}
              </p>
              {book.pageCount && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                  <span className="text-xs">📖</span>
                  <span className="text-xs font-bold text-primary">
                    {book.pageCount}p
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredBooks.length === 0 && (
        <div className="text-center py-20 space-y-4 animate-fade-in">
          <div className="text-8xl opacity-20 mb-4">📚</div>
          <p className="text-xl font-bold text-foreground">
            {books?.length
              ? 'No books match your search or filters'
              : 'No books found in your library'}
          </p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {books?.length
              ? 'Try adjusting your search query or filter settings'
              : 'Add books to your library to see them here'}
          </p>
        </div>
      )}
    </div>
  );
}
