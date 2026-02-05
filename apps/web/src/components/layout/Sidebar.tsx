import { NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ServiceIcon } from '@/components/ServiceIcon';

const navigation = [
  { name: 'Dashboard', path: '/', icon: '📊' },
  { name: 'Search', path: '/search', icon: '🔍' },
  { name: 'Discover', path: '/discover', icon: '✨' },
  { name: 'Calendar', path: '/calendar', icon: '📅' },
  { name: 'Movies', path: '/movies', icon: <ServiceIcon service="radarr" size={24} /> },
  { name: 'Series', path: '/series', icon: <ServiceIcon service="sonarr" size={24} /> },
  { name: 'Books', path: '/books', icon: <ServiceIcon service="readarr" size={24} /> },
  { name: 'Games', path: '/games', icon: '🎮' },
  { name: 'Downloads', path: '/downloads', icon: '⬇️' },
  { name: 'Tdarr', path: '/tdarr', icon: <ServiceIcon service="tdarr" size={24} /> },
  { name: 'Stats', path: '/stats', icon: <ServiceIcon service="prowlarr" size={24} /> },
];

export function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem('sidebar-expanded');
    return stored !== null ? stored === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('sidebar-expanded', String(isExpanded));
  }, [isExpanded]);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden md:flex md:flex-col border-r border-border/50 bg-background-elevated/80 backdrop-blur-xl transition-all duration-300",
        isExpanded ? "md:w-72" : "md:w-20"
      )}>
        {/* Logo Area */}
        <div className={cn(
          "flex h-20 items-center border-b border-border/30 transition-all duration-300",
          isExpanded ? "px-8 justify-start" : "px-4 justify-center"
        )}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center font-bold text-xl glow-primary flex-shrink-0">
              D
            </div>
            {isExpanded && (
              <div className="animate-fade-in">
                <h1 className="text-2xl font-extrabold tracking-tight text-gradient">
                  DashArr
                </h1>
                <p className="text-[10px] text-muted-foreground tracking-wider uppercase">
                  Media Center
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-4 py-6 overflow-y-auto">
          {navigation.map((item, index) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              title={!isExpanded ? item.name : undefined}
              className={({ isActive }) =>
                cn(
                  'group flex items-center rounded-xl py-3.5 text-[15px] font-medium transition-all duration-300 relative overflow-hidden',
                  isExpanded ? 'gap-4 px-4' : 'gap-0 px-3 justify-center',
                  isActive
                    ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card-elevated/70'
                )
              }
              style={{
                animationDelay: `${index * 50}ms`,
              }}
            >
              {({ isActive }) => (
                <>
                  {/* Hover glow effect */}
                  {!isActive && (
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  )}

                  <span className={cn(
                    "text-2xl transition-transform duration-300 group-hover:scale-110 relative z-10",
                    isActive && "drop-shadow-[0_0_8px_rgba(228,143,29,0.5)]"
                  )}>
                    {item.icon}
                  </span>
                  {isExpanded && (
                    <span className="relative z-10 animate-fade-in">{item.name}</span>
                  )}

                  {/* Active indicator */}
                  {isActive && isExpanded && (
                    <div className="absolute right-3 w-1.5 h-8 bg-primary-foreground rounded-full opacity-80" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className={cn(
          "border-t border-border/30 bg-background/40 transition-all duration-300",
          isExpanded ? "p-6" : "p-4"
        )}>
          {isExpanded ? (
            <div className="glass-card rounded-xl p-4 animate-fade-in">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <p className="text-sm font-semibold text-foreground">All Systems Operational</p>
              </div>
              <p className="text-xs text-muted-foreground">
                DashArr v0.1.0 • Modern Media Dashboard
              </p>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="w-3 h-3 rounded-full bg-success animate-pulse" />
            </div>
          )}

          {/* Toggle Button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              "w-full rounded-xl bg-card-elevated/70 border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 group mt-3",
              isExpanded ? "py-2" : "py-3"
            )}
            aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            <span className={cn(
              "text-lg transition-transform duration-300",
              isExpanded ? "group-hover:scale-110" : "group-hover:scale-110 rotate-180"
            )}>
              {isExpanded ? '◀' : '▶'}
            </span>
            {isExpanded && (
              <span className="ml-2 text-xs font-semibold animate-fade-in">Collapse</span>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background-elevated/95 backdrop-blur-xl">
        <div className="grid grid-cols-4 gap-1 px-2 py-3 overflow-x-auto">
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1.5 rounded-xl py-2.5 px-2 text-xs font-medium transition-all duration-300 min-w-[70px]',
                  isActive
                    ? 'bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card-elevated/50'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn(
                    "text-xl transition-transform duration-300",
                    isActive && "scale-110 drop-shadow-[0_0_6px_rgba(228,143,29,0.5)]"
                  )}>
                    {item.icon}
                  </span>
                  <span className="text-[10px] font-semibold">{item.name}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
