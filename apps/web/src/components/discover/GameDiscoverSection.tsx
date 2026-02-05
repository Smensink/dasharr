import type { GameSearchResult } from '@shared/index';
import { HorizontalScroll } from './HorizontalScroll';
import { cn } from '@/lib/utils';

interface GameDiscoverSectionProps {
  title: string;
  description?: string;
  items: GameSearchResult[];
  icon?: string;
  accentClass?: string;
  isLoading?: boolean;
  onDismiss?: (igdbId: number) => void;
  onMonitor?: (game: GameSearchResult) => void;
  monitoringId?: number | null;
  monitoredIds?: Record<number, boolean>;
}

export function GameDiscoverSection({
  title,
  description,
  items,
  icon,
  accentClass,
  isLoading,
  onDismiss,
  onMonitor,
  monitoringId,
  monitoredIds,
}: GameDiscoverSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'w-12 h-12 rounded-2xl border border-border/50 flex items-center justify-center text-2xl shadow-lg',
              accentClass || 'bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/30'
            )}
          >
            {icon || '🎮'}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <div className="text-xs font-semibold text-muted-foreground">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`game-skeleton-${index}`}
              className="h-72 rounded-2xl border border-border/50 bg-card-elevated/50 animate-pulse"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card-elevated/40 p-8 text-center text-sm text-muted-foreground">
          No games available right now.
        </div>
      ) : (
        <HorizontalScroll>
          {items.map((game) => (
            <GameDiscoverCard
              key={game.igdbId}
              game={game}
              onDismiss={onDismiss}
              onMonitor={onMonitor}
              monitorState={
                monitoredIds?.[game.igdbId] ? 'monitored' : monitoringId === game.igdbId ? 'monitoring' : undefined
              }
            />
          ))}
        </HorizontalScroll>
      )}
    </section>
  );
}

interface GameDiscoverCardProps {
  game: GameSearchResult;
  onDismiss?: (igdbId: number) => void;
  onMonitor?: (game: GameSearchResult) => void;
  monitorState?: 'monitoring' | 'monitored';
}

function GameDiscoverCard({ game, onDismiss, onMonitor, monitorState }: GameDiscoverCardProps) {
  const releaseDate = game.releaseDate
    ? new Date(game.releaseDate).toLocaleDateString()
    : undefined;

  const canMonitor = !game.isMonitored;
  const isMonitoring = monitorState === 'monitoring';
  const isMonitored = monitorState === 'monitored';

  const actionLabel = game.isMonitored
    ? 'Monitored'
    : isMonitored
      ? 'Game added to monitoring'
      : isMonitoring
        ? 'Adding...'
        : '+ Monitor Game';

  return (
    <div className="group relative w-52 shrink-0 snap-start rounded-2xl border border-border/50 bg-card-elevated/70 backdrop-blur-sm hover:-translate-y-2 hover:shadow-2xl hover:shadow-emerald-500/15 hover:border-emerald-500/40 transition-all duration-500">
      <div className="relative overflow-hidden rounded-t-2xl">
        {game.coverUrl ? (
          <img
            src={game.coverUrl}
            alt={game.name}
            className="w-full aspect-[2/3] object-cover group-hover:scale-110 transition-transform duration-700"
            loading="lazy"
          />
        ) : (
          <div className="w-full aspect-[2/3] bg-gradient-to-br from-muted/60 via-background to-card-elevated flex items-center justify-center">
            <span className="text-5xl opacity-30">🎮</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {onDismiss && (
          <button
            onClick={() => onDismiss(game.igdbId)}
            className="absolute top-2 right-2 p-2 rounded-lg bg-background/80 hover:bg-background border border-border/50 hover:border-red-500/50 text-muted-foreground hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
            title="Hide this game"
          >
            ✕
          </button>
        )}

        {game.rating && (
          <div className="absolute top-3 left-3 rounded-lg bg-background/80 border border-border/50 px-2 py-1 text-xs font-bold text-emerald-500 shadow-lg">
            ⭐ {game.rating.toFixed(1)}
          </div>
        )}

        {game.isMonitored && (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-success/90 text-[10px] font-bold text-white uppercase tracking-wide border border-success/50 shadow-lg flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Monitored
          </div>
        )}

        <div className="absolute bottom-3 left-3 right-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
          <button
            onClick={() => onMonitor?.(game)}
            disabled={!canMonitor || isMonitoring || isMonitored}
            className={cn(
              'w-full text-xs font-bold py-2.5 rounded-xl border transition-all',
              isMonitored
                ? 'bg-success/90 text-white border-success/60'
                : canMonitor
                  ? 'bg-gradient-to-r from-emerald-500/90 to-teal-500/90 text-white border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/30'
                  : 'bg-muted/60 text-muted-foreground border-border/50 cursor-not-allowed'
            )}
          >
            {actionLabel}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-2">
        <h3
          className="font-bold text-sm text-foreground line-clamp-2 group-hover:text-emerald-500 transition-colors"
          title={game.name}
        >
          {game.name}
        </h3>
        <div className="space-y-1 text-xs text-muted-foreground font-semibold">
          <div>{releaseDate ? `Release: ${releaseDate}` : 'Release: TBA'}</div>
          <div className="line-clamp-2">
            {game.platforms.length > 0
              ? `Platforms: ${game.platforms.slice(0, 3).join(', ')}`
              : 'Platforms: —'}
          </div>
        </div>
      </div>
    </div>
  );
}
