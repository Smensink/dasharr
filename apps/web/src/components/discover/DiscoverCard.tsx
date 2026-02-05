import { DiscoverMediaItem } from '@shared/index';
import { cn } from '@/lib/utils';

interface DiscoverCardProps {
  item: DiscoverMediaItem;
  onAdd?: (item: DiscoverMediaItem) => void;
  onDismiss?: (id: string) => void;
  addState?: 'adding' | 'added';
}

export function DiscoverCard({ item, onAdd, onDismiss, addState }: DiscoverCardProps) {
  const canAdd =
    !item.inLibrary &&
    ((item.mediaType === 'movie' && !!item.tmdbId) ||
      (item.mediaType === 'series' && !!(item.tvdbId || item.tmdbId)));
  const isAdding = addState === 'adding';
  const isAdded = addState === 'added';

  const actionLabel = item.inLibrary
    ? 'In Library'
    : !canAdd
      ? item.mediaType === 'movie'
        ? 'Missing TMDB ID'
        : 'Missing IDs'
      : isAdded
        ? `${item.mediaType === 'movie' ? 'Movie' : 'Series'} successfully added`
        : isAdding
          ? 'Adding...'
          : item.mediaType === 'series' && !item.tvdbId
            ? 'Resolve & Add'
            : '+ Add to Library';

  const awardHeadline =
    item.awardSource && item.awardResult
      ? `${item.awardSource} ${item.awardResult === 'winner' ? 'Winner' : 'Nominee'}`
      : item.awardNote;
  const awardCategories =
    item.awardCategories && item.awardCategories.length > 0
      ? item.awardCategories
      : undefined;
  const awardInfoParts: string[] = [];
  if (item.awardSource) awardInfoParts.push(`Source: ${item.awardSource}`);
  if (item.awardResult) {
    awardInfoParts.push(
      `Result: ${item.awardResult === 'winner' ? 'Winner' : 'Nominee'}`
    );
  }
  if (item.awardYear) awardInfoParts.push(`Award Year: ${item.awardYear}`);
  if (awardCategories?.length) {
    awardInfoParts.push(`Categories: ${awardCategories.join(', ')}`);
  }
  if (item.awardNote) awardInfoParts.push(`Note: ${item.awardNote}`);
  const awardInfoTitle = awardInfoParts.join('\n');

  return (
    <div className="group relative w-52 shrink-0 snap-start rounded-2xl border border-border/50 bg-card-elevated/70 backdrop-blur-sm hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/15 hover:border-primary/40 transition-all duration-500">
      <div className="relative overflow-hidden rounded-t-2xl">
        {item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            className="w-full aspect-[2/3] object-cover group-hover:scale-110 transition-transform duration-700"
            loading="lazy"
          />
        ) : (
          <div className="w-full aspect-[2/3] bg-gradient-to-br from-muted/60 via-background to-card-elevated flex items-center justify-center">
            <span className="text-5xl opacity-30">
              {item.mediaType === 'movie' ? '🎬' : '📺'}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {item.rating?.imdb?.value && (
          <div className="absolute top-3 left-3 rounded-lg bg-background/80 border border-border/50 px-2 py-1 text-xs font-bold text-primary shadow-lg">
            ⭐ {item.rating.imdb.value.toFixed(1)}
          </div>
        )}

        {onDismiss && !item.inLibrary && (
          <button
            onClick={() => onDismiss(item.id)}
            className="absolute top-2 right-2 p-2 rounded-lg bg-background/80 hover:bg-background border border-border/50 hover:border-red-500/50 text-muted-foreground hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
            title="Hide this item"
          >
            ✕
          </button>
        )}

        {item.inLibrary && (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-success/90 text-[10px] font-bold text-white uppercase tracking-wide border border-success/50 shadow-lg flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            In Library
          </div>
        )}

        <div className="absolute bottom-3 left-3 right-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
          <button
            onClick={() => onAdd?.(item)}
            disabled={!canAdd || isAdding || isAdded}
            className={cn(
              'w-full text-xs font-bold py-2.5 rounded-xl border transition-all',
              isAdded
                ? 'bg-success/90 text-white border-success/60'
                : canAdd
                  ? 'bg-gradient-to-r from-primary/90 to-accent/90 text-primary-foreground border-primary/30 hover:shadow-lg hover:shadow-primary/30'
                  : 'bg-muted/60 text-muted-foreground border-border/50 cursor-not-allowed'
            )}
          >
            {actionLabel}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-2">
        <h3
          className="font-bold text-sm text-foreground line-clamp-2 group-hover:text-primary transition-colors"
          title={item.title}
        >
          {item.title}
        </h3>
        {(awardHeadline || awardCategories || item.awardYear) && (
          <div className="space-y-1">
            {awardHeadline && (
              <div className="flex items-start gap-2">
                <p className="text-[11px] font-semibold text-amber-500/90 line-clamp-2">
                  🏆 {awardHeadline}
                </p>
                {awardInfoTitle && (
                  <div className="relative group/award-info">
                    <button
                      type="button"
                      className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-500/40 text-[9px] font-bold text-amber-500/90 hover:bg-amber-500/10"
                      aria-label="Award source and details"
                    >
                      i
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 rounded-xl border border-amber-500/30 bg-background/95 px-3 py-2 text-[11px] font-medium text-muted-foreground shadow-2xl opacity-0 transition-opacity group-hover/award-info:opacity-100">
                      <div className="space-y-1">
                        {awardInfoParts.map((line, idx) => (
                          <div key={`${item.id}-award-info-${idx}`}>{line}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {awardCategories && (
              <p className="text-[11px] font-semibold text-muted-foreground line-clamp-2">
                For {awardCategories.slice(0, 2).join(', ')}
                {awardCategories.length > 2
                  ? ` +${awardCategories.length - 2} more`
                  : ''}
              </p>
            )}
            <p className="text-[11px] font-semibold text-muted-foreground">
              Award Year: {item.awardYear || 'Unknown'}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
          <span>{item.year || '—'}</span>
          <span className="uppercase tracking-wide">
            {item.mediaType === 'movie' ? 'Movie' : 'Series'}
          </span>
        </div>
      </div>
    </div>
  );
}
