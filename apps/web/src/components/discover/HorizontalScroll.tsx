import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface HorizontalScrollProps extends PropsWithChildren {
  className?: string;
}

export function HorizontalScroll({ children, className }: HorizontalScrollProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollState();
    const el = containerRef.current;
    if (!el) return;
    const handle = () => updateScrollState();
    el.addEventListener('scroll', handle, { passive: true });
    window.addEventListener('resize', handle);
    return () => {
      el.removeEventListener('scroll', handle);
      window.removeEventListener('resize', handle);
    };
  }, []);

  const scrollByAmount = (direction: 'left' | 'right') => {
    const el = containerRef.current;
    if (!el) return;
    const offset = Math.max(el.clientWidth * 0.8, 260);
    el.scrollBy({
      left: direction === 'left' ? -offset : offset,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => scrollByAmount('left')}
        disabled={!canScrollLeft}
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 z-10 h-11 w-11 rounded-full border border-border/50 bg-background/90 text-xl shadow-lg shadow-primary/10 transition-all duration-300',
          canScrollLeft
            ? 'opacity-100 hover:border-primary/40 hover:text-primary'
            : 'opacity-0 pointer-events-none'
        )}
        aria-label="Scroll left"
      >
        ◀
      </button>
      <div
        ref={containerRef}
        className={cn(
          'flex gap-5 overflow-x-auto pb-4 scroll-smooth snap-x snap-mandatory',
          className
        )}
      >
        {children}
      </div>
      <button
        type="button"
        onClick={() => scrollByAmount('right')}
        disabled={!canScrollRight}
        className={cn(
          'absolute right-0 top-1/2 -translate-y-1/2 z-10 h-11 w-11 rounded-full border border-border/50 bg-background/90 text-xl shadow-lg shadow-primary/10 transition-all duration-300',
          canScrollRight
            ? 'opacity-100 hover:border-primary/40 hover:text-primary'
            : 'opacity-0 pointer-events-none'
        )}
        aria-label="Scroll right"
      >
        ▶
      </button>
    </div>
  );
}
