import { DiscoverMediaItem } from '@shared/index';
import { HorizontalScroll } from './HorizontalScroll';
import { DiscoverCard } from './DiscoverCard';
import { cn } from '@/lib/utils';

interface DiscoverSectionProps {
  title: string;
  description?: string;
  items: DiscoverMediaItem[];
  icon?: string;
  accentClass?: string;
  isLoading?: boolean;
  onAdd?: (item: DiscoverMediaItem) => void;
  onDismiss?: (id: string) => void;
  addingId?: string | null;
  addedIds?: Record<string, boolean>;
}

export function DiscoverSection({
  title,
  description,
  items,
  icon,
  accentClass,
  isLoading,
  onAdd,
  onDismiss,
  addingId,
  addedIds,
}: DiscoverSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'w-12 h-12 rounded-2xl border border-border/50 flex items-center justify-center text-2xl shadow-lg',
              accentClass || 'bg-gradient-to-br from-primary/20 to-accent/20'
            )}
          >
            {icon || '✨'}
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
              key={`skeleton-${index}`}
              className="h-72 rounded-2xl border border-border/50 bg-card-elevated/50 animate-pulse"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card-elevated/40 p-8 text-center text-sm text-muted-foreground">
          No items available right now.
        </div>
      ) : (
        <HorizontalScroll>
          {items.map((item) => (
            <DiscoverCard
              key={item.id}
              item={item}
              onAdd={onAdd}
              onDismiss={onDismiss}
              addState={
                addedIds?.[item.id] ? 'added' : addingId === item.id ? 'adding' : undefined
              }
            />
          ))}
        </HorizontalScroll>
      )}
    </section>
  );
}
