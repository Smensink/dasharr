import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useState, type ReactNode, useEffect, useCallback } from 'react';
import { ServiceIcon } from '@/components/ServiceIcon';

// Types
interface ServiceConfig {
  enabled: boolean;
  baseUrl: string;
  hasApiKey?: boolean;
  hasUsername?: boolean;
  hasPassword?: boolean;
  hasClientId?: boolean;
  hasClientSecret?: boolean;
}

interface ConfigResponse {
  services: {
    [key: string]: ServiceConfig;
  };
}

interface ServiceFormData {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
}

interface ConnectionResult {
  service: string;
  connected: boolean;
  message?: string;
}

type HydraSourceTrustLevel = 'trusted' | 'safe' | 'abandoned' | 'unsafe' | 'nsfw';

interface HydraSource {
  id: string;
  name: string;
  url: string;
  trustLevel: HydraSourceTrustLevel;
  description?: string;
  author?: string;
  enabled?: boolean;
}

interface AppSettings {
  games: {
    rssMonitorEnabled: boolean;
    searchFrequencyMinutes: number;
    fitgirlRssIntervalMinutes: number;
    prowlarrRssIntervalMinutes: number;
    minSearchIntervalMinutes: number;
    searchAgents: {
      fitgirl: boolean;
      dodi: boolean;
      steamrip: boolean;
      prowlarr: boolean;
      rezi: boolean;
    };
    searchAgentOrder: Array<'hydra' | 'fitgirl' | 'dodi' | 'steamrip' | 'rezi' | 'prowlarr'>;
  };
  downloads: {
    dedupeArrEnabled: boolean;
    gamesDirectories: string;
  };
  cache: {
    defaultTtlSeconds: number;
    queueTtlSeconds: number;
    healthTtlSeconds: number;
  };
  system: {
    logStoreMaxEntries: number;
    timezone: string;
    dataDirectory: string;
  };
  tdarr: {
    fileAgeRetryMinutes: number;
    localDbPath: string;
  };
  flaresolverr: {
    enabled: boolean;
    url: string;
    timeoutMs: number;
  };
  hydra: {
    enabled: boolean;
    enabledSources: string[];
    allowedTrustLevels: HydraSourceTrustLevel[];
    penalizeBundles: boolean;
    cacheDurationMinutes: number;
    maxResultsPerSource: number;
  };
  ddl: {
    enabled: boolean;
    downloadPath: string;
    maxConcurrentDownloads: number;
    maxRetries: number;
    retryDelayMs: number;
    createGameSubfolders: boolean;
  };
}

type TabType = 'services' | 'games' | 'downloads' | 'system' | 'advanced';

// Service Card Component
interface ServiceCardProps {
  displayName: string;
  icon: ReactNode;
  fields: { name: string; type: string; placeholder: string; field: string; required?: boolean }[];
  config?: ServiceConfig;
  isEditing: boolean;
  formData?: ServiceFormData;
  isConnected?: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onChange: (field: string, value: any) => void;
  isPending: boolean;
}

function ServiceCard({
  displayName,
  icon,
  fields,
  config,
  isEditing,
  formData,
  isConnected,
  onEdit,
  onSave,
  onCancel,
  onChange,
  isPending,
}: ServiceCardProps) {
  const currentData = formData || config;

  // Auto-enable when valid credentials are entered
  useEffect(() => {
    if (isEditing && currentData) {
      const hasRequiredCredentials = fields.every(field => {
        if (!field.required) return true;
        const value = (currentData as any)?.[field.field];
        return value && value.toString().trim().length > 0;
      });
      
      if (hasRequiredCredentials && !currentData.enabled) {
        onChange('enabled', true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, fields.map(f => (currentData as any)?.[f.field]).join(','), currentData?.enabled]);

  return (
    <div className="group relative rounded-xl border border-border/50 bg-card p-5 hover:shadow-lg hover:border-primary/30 transition-all duration-300">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
          isConnected 
            ? 'bg-green-500/10 border-green-500/30 text-green-500' 
            : 'bg-primary/10 border-primary/30 text-primary'
        }`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base truncate">{displayName}</h3>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${isConnected ? 'text-green-500' : 'text-muted-foreground'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
            {config?.enabled && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                Enabled
              </span>
            )}
          </div>
        </div>
      </div>

      {!isEditing ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">URL</span>
            <span className="truncate max-w-[180px] font-mono text-xs">
              {config?.baseUrl || 'Not configured'}
            </span>
          </div>
          {fields.map(f => f.field !== 'baseUrl' && (
            <div key={f.field} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{f.name}</span>
              <span className="text-xs">
                {(config as any)?.[`has${f.field.charAt(0).toUpperCase() + f.field.slice(1)}`] 
                  ? '✓ Set' 
                  : 'Not set'}
              </span>
            </div>
          ))}
          <button
            onClick={onEdit}
            className="w-full mt-3 text-sm font-medium py-2 px-3 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            Configure
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 cursor-pointer">
            <input
              type="checkbox"
              checked={currentData?.enabled || false}
              onChange={(e) => onChange('enabled', e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-sm font-medium">Enable Service</span>
          </label>
          
          {fields.map(({ name, type, placeholder, field }) => (
            <div key={field}>
              <label className="text-xs text-muted-foreground block mb-1">{name}</label>
              <input
                type={type}
                placeholder={placeholder}
                value={(currentData as any)?.[field] || ''}
                onChange={(e) => onChange(field, e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          ))}
          
          <div className="flex gap-2 pt-2">
            <button
              onClick={onSave}
              disabled={isPending}
              className="flex-1 text-sm font-medium py-2 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={onCancel}
              disabled={isPending}
              className="flex-1 text-sm font-medium py-2 px-3 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Settings Section Component
function SettingsSection({ 
  title, 
  description, 
  children,
  icon
}: { 
  title: string; 
  description?: string; 
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {icon && <div className="text-2xl">{icon}</div>}
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="bg-card/50 rounded-xl p-4 border border-border/50">
        {children}
      </div>
    </div>
  );
}

// Number Input Component
function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  unit,
  description,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
            className="w-24 text-right rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          />
          {unit && <span className="text-sm text-muted-foreground w-16">{unit}</span>}
        </div>
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

// Toggle Component
function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-lg bg-card hover:bg-muted/50 transition-colors cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-border"
      />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>
    </label>
  );
}

// Text Input Component
function TextInput({
  label,
  value,
  onChange,
  placeholder,
  description,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

// Main Settings Component
export function Settings() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('services');
  const [editingService, setEditingService] = useState<string | null>(null);
  const [formData, setFormData] = useState<{[key: string]: ServiceFormData}>({});
  const [connectionResult, setConnectionResult] = useState<ConnectionResult | null>(null);

  // Fetch data
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
  });

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const response = await api.get<ConfigResponse>('/config');
      return response;
    },
  });

  const { data: appSettings, isLoading: appSettingsLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const response = await api.get<{ settings: AppSettings }>('/app-settings');
      return response.settings;
    },
  });

  // Mutations
  const updateServiceMutation = useMutation({
    mutationFn: async ({ service, data }: { service: string; data: Partial<ServiceFormData> }) => {
      const response = await api.put<{ success: boolean; connection: { connected: boolean; message?: string } }>(`/config/${service}`, data);
      return { service, response };
    },
    onSuccess: ({ service, response }) => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
      setEditingService(null);
      setFormData({});
      setConnectionResult({
        service,
        connected: response.connection?.connected ?? false,
        message: response.connection?.message,
      });
      setTimeout(() => setConnectionResult(null), 5000);
    },
  });

  const updateAppSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<AppSettings>) => {
      await api.put('/app-settings', updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
    },
  });

  // Service form handlers
  const handleEdit = (serviceName: string) => {
    const serviceConfig = config?.services[serviceName];
    if (serviceConfig) {
      setFormData({
        ...formData,
        [serviceName]: {
          enabled: serviceConfig.enabled,
          baseUrl: serviceConfig.baseUrl,
          apiKey: '',
          username: '',
          password: '',
          clientId: '',
          clientSecret: '',
        },
      });
      setEditingService(serviceName);
    }
  };

  const handleCancel = () => {
    setEditingService(null);
    setFormData({});
  };

  const handleSave = (serviceName: string) => {
    const data = formData[serviceName];
    if (!data) return;

    const updates: Partial<ServiceFormData> = {
      enabled: data.enabled,
      baseUrl: data.baseUrl,
    };

    if (data.apiKey) updates.apiKey = data.apiKey;
    if (data.username) updates.username = data.username;
    if (data.password) updates.password = data.password;
    if (data.clientId) updates.clientId = data.clientId;
    if (data.clientSecret) updates.clientSecret = data.clientSecret;

    updateServiceMutation.mutate({ service: serviceName, data: updates });
  };

  const handleInputChange = (serviceName: string, field: string, value: any) => {
    const currentData = formData[serviceName];
    setFormData({
      ...formData,
      [serviceName]: {
        enabled: currentData?.enabled || false,
        baseUrl: currentData?.baseUrl || '',
        apiKey: currentData?.apiKey || '',
        username: currentData?.username || '',
        password: currentData?.password || '',
        clientId: currentData?.clientId || '',
        clientSecret: currentData?.clientSecret || '',
        [field]: value,
      },
    });
  };

  // App settings update helper
  const updateGamesSettings = useCallback((updates: Partial<AppSettings['games']>) => {
    if (!appSettings?.games) return;
    updateAppSettingsMutation.mutate({ games: { ...appSettings.games, ...updates } as AppSettings['games'] });
  }, [appSettings?.games, updateAppSettingsMutation]);

  const updateDownloadsSettings = useCallback((updates: Partial<AppSettings['downloads']>) => {
    if (!appSettings?.downloads) return;
    updateAppSettingsMutation.mutate({ downloads: { ...appSettings.downloads, ...updates } as AppSettings['downloads'] });
  }, [appSettings?.downloads, updateAppSettingsMutation]);

  const updateCacheSettings = useCallback((updates: Partial<AppSettings['cache']>) => {
    if (!appSettings?.cache) return;
    updateAppSettingsMutation.mutate({ cache: { ...appSettings.cache, ...updates } as AppSettings['cache'] });
  }, [appSettings?.cache, updateAppSettingsMutation]);

  const updateSystemSettings = useCallback((updates: Partial<AppSettings['system']>) => {
    if (!appSettings?.system) return;
    updateAppSettingsMutation.mutate({ system: { ...appSettings.system, ...updates } as AppSettings['system'] });
  }, [appSettings?.system, updateAppSettingsMutation]);

  const updateTdarrSettings = useCallback((updates: Partial<AppSettings['tdarr']>) => {
    if (!appSettings?.tdarr) return;
    updateAppSettingsMutation.mutate({ tdarr: { ...appSettings.tdarr, ...updates } as AppSettings['tdarr'] });
  }, [appSettings?.tdarr, updateAppSettingsMutation]);

  const updateFlareSolverrSettings = useCallback((updates: Partial<AppSettings['flaresolverr']>) => {
    if (!appSettings?.flaresolverr) return;
    updateAppSettingsMutation.mutate({ flaresolverr: { ...appSettings.flaresolverr, ...updates } as AppSettings['flaresolverr'] });
  }, [appSettings?.flaresolverr, updateAppSettingsMutation]);

  const updateHydraSettings = useCallback((updates: Partial<AppSettings['hydra']>) => {
    if (!appSettings?.hydra) return;
    updateAppSettingsMutation.mutate({ hydra: { ...appSettings.hydra, ...updates } as AppSettings['hydra'] });
  }, [appSettings?.hydra, updateAppSettingsMutation]);

  const updateDDLSettings = useCallback((updates: Partial<AppSettings['ddl']>) => {
    if (!appSettings?.ddl) return;
    updateAppSettingsMutation.mutate({ ddl: { ...appSettings.ddl, ...updates } as AppSettings['ddl'] });
  }, [appSettings?.ddl, updateAppSettingsMutation]);

  // Hydra sources query
  const { data: hydraSources, refetch: refetchHydraSources, isFetching: isRefetchingHydra } = useQuery({
    queryKey: ['hydra-sources'],
    queryFn: async () => {
      const response = await api.get<{ sources: HydraSource[] }>('/hydra/sources');
      return response.sources;
    },
  });

  // Hydra sources info query
  const { data: hydraSourcesInfo } = useQuery({
    queryKey: ['hydra-sources-info'],
    queryFn: async () => {
      const response = await api.get<{ info: { count: number; lastFetchedFormatted: string | null; persistedFilePath: string } }>('/hydra/sources/info');
      return response.info;
    },
  });

  // Service definitions
  const serviceGroups = [
    {
      title: 'Media Managers',
      services: [
        { key: 'radarr', name: 'Radarr', icon: <ServiceIcon service="radarr" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'http://radarr:7878', field: 'baseUrl' },
          { name: 'API Key', type: 'password', placeholder: 'Enter API key', field: 'apiKey' },
        ]},
        { key: 'sonarr', name: 'Sonarr', icon: <ServiceIcon service="sonarr" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'http://sonarr:8989', field: 'baseUrl' },
          { name: 'API Key', type: 'password', placeholder: 'Enter API key', field: 'apiKey' },
        ]},
        { key: 'readarr', name: 'Readarr', icon: <ServiceIcon service="readarr" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'http://readarr:8787', field: 'baseUrl' },
          { name: 'API Key', type: 'password', placeholder: 'Enter API key', field: 'apiKey' },
        ]},
        { key: 'prowlarr', name: 'Prowlarr', icon: <ServiceIcon service="prowlarr" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'http://prowlarr:9696', field: 'baseUrl' },
          { name: 'API Key', type: 'password', placeholder: 'Enter API key', field: 'apiKey' },
        ]},
        { key: 'bazarr', name: 'Bazarr', icon: <ServiceIcon service="bazarr" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'http://bazarr:6767', field: 'baseUrl' },
          { name: 'API Key', type: 'password', placeholder: 'Enter API key', field: 'apiKey' },
        ]},
      ]
    },
    {
      title: 'Download Clients',
      services: [
        { key: 'qbittorrent', name: 'qBittorrent', icon: <ServiceIcon service="qbittorrent" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'http://qbittorrent:8080', field: 'baseUrl' },
          { name: 'Username', type: 'text', placeholder: 'admin', field: 'username' },
          { name: 'Password', type: 'password', placeholder: 'Enter password', field: 'password' },
        ]},
        { key: 'sabnzbd', name: 'SABnzbd', icon: <ServiceIcon service="sabnzbd" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'http://sabnzbd:8080', field: 'baseUrl' },
          { name: 'API Key', type: 'password', placeholder: 'Enter API key', field: 'apiKey' },
        ]},
        { key: 'rdtclient', name: 'RDTClient', icon: <ServiceIcon service="rdtclient" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'http://rdtclient:6500', field: 'baseUrl' },
          { name: 'Username', type: 'text', placeholder: 'admin', field: 'username' },
          { name: 'Password', type: 'password', placeholder: 'Enter password', field: 'password' },
        ]},
      ]
    },
    {
      title: 'Media Servers',
      services: [
        { key: 'plex', name: 'Plex', icon: <ServiceIcon service="plex" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'http://plex:32400', field: 'baseUrl' },
          { name: 'Token', type: 'password', placeholder: 'Enter Plex token', field: 'apiKey' },
        ]},
        { key: 'tautulli', name: 'Tautulli', icon: <ServiceIcon service="tautulli" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'http://tautulli:8181', field: 'baseUrl' },
          { name: 'API Key', type: 'password', placeholder: 'Enter API key', field: 'apiKey' },
        ]},
      ]
    },
    {
      title: 'Processing & Games',
      services: [
        { key: 'tdarr', name: 'Tdarr', icon: <ServiceIcon service="tdarr" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'http://tdarr:8266', field: 'baseUrl' },
          { name: 'API Key', type: 'password', placeholder: 'Optional', field: 'apiKey' },
        ]},
        { key: 'igdb', name: 'IGDB (Games)', icon: <ServiceIcon service="igdb" size={24} />, fields: [
          { name: 'Client ID', type: 'text', placeholder: 'Twitch Client ID', field: 'clientId', required: true },
          { name: 'Client Secret', type: 'password', placeholder: 'Twitch Client Secret', field: 'clientSecret', required: true },
        ]},
        { key: 'rezi', name: 'Rezi (DDL)', icon: <ServiceIcon service="rezi" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'https://search.rezi.one', field: 'baseUrl' },
          { name: 'API Key', type: 'password', placeholder: 'Enter Rezi API key', field: 'apiKey' },
        ]},
      ]
    },
    {
      title: 'Metadata Providers',
      services: [
        { key: 'tmdb', name: 'TMDB', icon: <ServiceIcon service="tmdb" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'https://api.themoviedb.org/3', field: 'baseUrl' },
          { name: 'API Key', type: 'password', placeholder: 'Enter TMDB API key', field: 'apiKey' },
        ]},
        { key: 'trakt', name: 'Trakt', icon: <ServiceIcon service="trakt" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'https://api.trakt.tv', field: 'baseUrl' },
          { name: 'Client ID', type: 'password', placeholder: 'Enter Trakt client ID', field: 'apiKey' },
        ]},
        { key: 'omdb', name: 'OMDb', icon: <ServiceIcon service="omdb" size={24} />, fields: [
          { name: 'URL', type: 'text', placeholder: 'https://www.omdbapi.com', field: 'baseUrl' },
          { name: 'API Key', type: 'password', placeholder: 'Enter OMDb API key', field: 'apiKey' },
        ]},
      ]
    },
  ];

  if (configLoading || appSettingsLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Loading configuration...</p>
      </div>
    );
  }

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'services', label: 'Services', icon: '🔌' },
    { id: 'games', label: 'Games', icon: '🎮' },
    { id: 'downloads', label: 'Downloads', icon: '⬇️' },
    { id: 'system', label: 'System', icon: '⚙️' },
    { id: 'advanced', label: 'Advanced', icon: '🔧' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure DashArr services and preferences</p>
      </div>

      {/* Connection Result Toast */}
      {connectionResult && (
        <div className={`rounded-lg p-4 flex items-center justify-between ${
          connectionResult.connected
            ? 'bg-green-500/10 border border-green-500/30 text-green-600'
            : 'bg-red-500/10 border border-red-500/30 text-red-600'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-xl">{connectionResult.connected ? '✓' : '✗'}</span>
            <div>
              <p className="font-medium capitalize">{connectionResult.service}</p>
              <p className="text-sm opacity-90">
                {connectionResult.connected ? 'Connected successfully' : 'Connection failed'}
                {connectionResult.message && ` - ${connectionResult.message}`}
              </p>
            </div>
          </div>
          <button onClick={() => setConnectionResult(null)} className="text-xl hover:opacity-70">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-8">
        {/* Services Tab */}
        {activeTab === 'services' && (
          <div className="space-y-8">
            {serviceGroups.map(group => (
              <SettingsSection key={group.title} title={group.title} icon="🔧">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {group.services.map(service => (
                    <ServiceCard
                      key={service.key}
                      displayName={service.name}
                      icon={service.icon}
                      fields={service.fields}
                      config={config?.services[service.key]}
                      isEditing={editingService === service.key}
                      formData={formData[service.key]}
                      isConnected={health?.services?.[service.key]}
                      onEdit={() => handleEdit(service.key)}
                      onSave={() => handleSave(service.key)}
                      onCancel={handleCancel}
                      onChange={(field, value) => handleInputChange(service.key, field, value)}
                      isPending={updateServiceMutation.isPending}
                    />
                  ))}
                </div>
              </SettingsSection>
            ))}
          </div>
        )}

        {/* Games Tab */}
        {activeTab === 'games' && appSettings && (
          <div className="space-y-8">
            <SettingsSection title="Game Monitoring" description="Configure how games are monitored and searched" icon="🎮">
              <div className="space-y-4">
                <Toggle
                  label="Enable RSS Monitoring"
                  description="Automatically check RSS feeds for new game releases from monitored sources"
                  checked={appSettings.games.rssMonitorEnabled}
                  onChange={(v) => updateGamesSettings({ rssMonitorEnabled: v })}
                />
                
                <div className="pt-4 border-t border-border space-y-4">
                  <NumberInput
                    label="Search Frequency"
                    description="How often to search for monitored games (in minutes)"
                    value={appSettings.games.searchFrequencyMinutes}
                    onChange={(v) => updateGamesSettings({ searchFrequencyMinutes: v })}
                    min={5}
                    max={1440}
                    unit="min"
                  />
                  
                  <NumberInput
                    label="FitGirl RSS Interval"
                    description="How often to check FitGirl RSS feed (in minutes)"
                    value={appSettings.games.fitgirlRssIntervalMinutes}
                    onChange={(v) => updateGamesSettings({ fitgirlRssIntervalMinutes: v })}
                    min={5}
                    max={1440}
                    unit="min"
                  />
                  
                  <NumberInput
                    label="Prowlarr RSS Interval"
                    description="How often to check Prowlarr RSS feeds (in minutes)"
                    value={appSettings.games.prowlarrRssIntervalMinutes}
                    onChange={(v) => updateGamesSettings({ prowlarrRssIntervalMinutes: v })}
                    min={5}
                    max={1440}
                    unit="min"
                  />
                  
                  <NumberInput
                    label="Minimum Search Interval"
                    description="Minimum time between searches for the same game (in minutes)"
                    value={appSettings.games.minSearchIntervalMinutes}
                    onChange={(v) => updateGamesSettings({ minSearchIntervalMinutes: v })}
                    min={1}
                    max={1440}
                    unit="min"
                  />
                </div>
              </div>
            </SettingsSection>

            <SettingsSection title="Search Agents" description="Enable or disable individual game search sources" icon="🧭">
              <div className="space-y-4">
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="text-sm font-medium mb-2">Agent Order</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Higher items are tried first. This affects ranking when multiple agents return results.
                  </p>
                  <div className="space-y-2">
                    {appSettings.games.searchAgentOrder.map((agent, index) => (
                      <div
                        key={agent}
                        className="flex items-center justify-between rounded-md bg-card px-3 py-2 border border-border/50"
                      >
                        <span className="text-sm font-medium capitalize">{agent}</span>
                        <div className="flex gap-2">
                          <button
                            className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/70 disabled:opacity-40"
                            disabled={index === 0}
                            onClick={() => {
                              const order = [...appSettings.games.searchAgentOrder];
                              const temp = order[index - 1];
                              order[index - 1] = order[index];
                              order[index] = temp;
                              updateGamesSettings({ searchAgentOrder: order });
                            }}
                          >
                            Up
                          </button>
                          <button
                            className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/70 disabled:opacity-40"
                            disabled={index === appSettings.games.searchAgentOrder.length - 1}
                            onClick={() => {
                              const order = [...appSettings.games.searchAgentOrder];
                              const temp = order[index + 1];
                              order[index + 1] = order[index];
                              order[index] = temp;
                              updateGamesSettings({ searchAgentOrder: order });
                            }}
                          >
                            Down
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Toggle
                  label="FitGirl Repacks"
                  description="Curated repacks with strong metadata; good for larger AAA titles."
                  checked={appSettings.games.searchAgents.fitgirl}
                  onChange={(v) =>
                    updateGamesSettings({
                      searchAgents: { ...appSettings.games.searchAgents, fitgirl: v },
                    })
                  }
                />
                <Toggle
                  label="DODI Repacks"
                  description="Repack releases, sometimes faster to appear than FitGirl."
                  checked={appSettings.games.searchAgents.dodi}
                  onChange={(v) =>
                    updateGamesSettings({
                      searchAgents: { ...appSettings.games.searchAgents, dodi: v },
                    })
                  }
                />
                <Toggle
                  label="SteamRip"
                  description="Direct-download style releases, often cleaner titles."
                  checked={appSettings.games.searchAgents.steamrip}
                  onChange={(v) =>
                    updateGamesSettings({
                      searchAgents: { ...appSettings.games.searchAgents, steamrip: v },
                    })
                  }
                />
                <Toggle
                  label="Prowlarr"
                  description="Search configured torrent indexers for game releases."
                  checked={appSettings.games.searchAgents.prowlarr}
                  onChange={(v) =>
                    updateGamesSettings({
                      searchAgents: { ...appSettings.games.searchAgents, prowlarr: v },
                    })
                  }
                />
                <Toggle
                  label="Rezi"
                  description="Search Rezi for DDL sources (requires Rezi API key)."
                  checked={appSettings.games.searchAgents.rezi}
                  onChange={(v) =>
                    updateGamesSettings({
                      searchAgents: { ...appSettings.games.searchAgents, rezi: v },
                    })
                  }
                />
                {appSettings.hydra.enabled && (
                  <p className="text-xs text-muted-foreground">
                    Hydra Library is enabled and will run alongside any other enabled agents.
                  </p>
                )}
              </div>
            </SettingsSection>

            <SettingsSection title="FlareSolverr" description="Configure Cloudflare bypass for DODI repacks" icon="🔓">
              <div className="space-y-4">
                <Toggle
                  label="Enable FlareSolverr"
                  description="Use FlareSolverr to bypass Cloudflare protection on DODI site"
                  checked={appSettings.flaresolverr.enabled}
                  onChange={(v) => updateFlareSolverrSettings({ enabled: v })}
                />
                
                <TextInput
                  label="FlareSolverr URL"
                  value={appSettings.flaresolverr.url}
                  onChange={(v) => updateFlareSolverrSettings({ url: v })}
                  placeholder="http://flaresolverr:8191"
                />
                
                <NumberInput
                  label="Request Timeout"
                  value={appSettings.flaresolverr.timeoutMs}
                  onChange={(v) => updateFlareSolverrSettings({ timeoutMs: v })}
                  min={10000}
                  max={300000}
                  unit="ms"
                />
              </div>
            </SettingsSection>

            <SettingsSection title="Hydra Library" description="Search game downloads from Hydra Library sources" icon="📚">
              <div className="space-y-4">
                <Toggle
                  label="Enable Hydra Library Search"
                  description="Use Hydra Library sources instead of manual search for finding game downloads"
                  checked={appSettings.hydra.enabled}
                  onChange={(v) => updateHydraSettings({ enabled: v })}
                />
                
                {appSettings.hydra.enabled && (
                  <>
                    <div className="pt-4 border-t border-border">
                      <label className="text-sm font-medium block mb-3">Trust Levels</label>
                      <div className="space-y-2">
                        {(['trusted', 'safe', 'abandoned', 'unsafe', 'nsfw'] as const).map((level) => (
                          <label key={level} className="flex items-start gap-3 p-2 rounded-lg bg-card hover:bg-muted/50 transition-colors cursor-pointer">
                            <input
                              type="checkbox"
                              checked={appSettings.hydra.allowedTrustLevels.includes(level)}
                              onChange={(e) => {
                                const newLevels = e.target.checked
                                  ? [...appSettings.hydra.allowedTrustLevels, level]
                                  : appSettings.hydra.allowedTrustLevels.filter((l) => l !== level);
                                updateHydraSettings({ allowedTrustLevels: newLevels });
                              }}
                              className="mt-0.5 rounded border-border"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{
                                    backgroundColor: {
                                      trusted: '#22c55e',
                                      safe: '#3b82f6',
                                      abandoned: '#f59e0b',
                                      unsafe: '#ef4444',
                                      nsfw: '#a855f7',
                                    }[level],
                                  }}
                                />
                                <span className="text-sm font-medium capitalize">{level.replace('_', ' ')}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {{
                                  trusted: 'Verified and trusted sources with good reputation',
                                  safe: 'Safe to use, but exercise normal caution',
                                  abandoned: 'No longer maintained, but may still work',
                                  unsafe: 'Potential security risks - use with caution',
                                  nsfw: 'Contains adult content',
                                }[level]}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border">
                      <Toggle
                        label="Penalize Bundle Matches"
                        description="Reduce scores for bundle/collection titles (e.g., all DLC, complete editions) to avoid accidental sequel matches"
                        checked={appSettings.hydra.penalizeBundles}
                        onChange={(v) => updateHydraSettings({ penalizeBundles: v })}
                      />
                    </div>

                    <div className="pt-4 border-t border-border">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <label className="text-sm font-medium">Enabled Sources</label>
                          {hydraSourcesInfo && (
                            <p className="text-xs text-muted-foreground">
                              {hydraSourcesInfo.count} sources available
                              {hydraSourcesInfo.lastFetchedFormatted && (
                                <> · Last updated: {new Date(hydraSourcesInfo.lastFetchedFormatted).toLocaleString()}</>
                              )}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => refetchHydraSources()}
                          disabled={isRefetchingHydra}
                          className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50 transition-colors"
                        >
                          {isRefetchingHydra ? 'Refreshing...' : 'Refresh List'}
                        </button>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {hydraSources?.map((source) => (
                          <label key={source.id} className="flex items-start gap-3 p-2 rounded-lg bg-card hover:bg-muted/50 transition-colors cursor-pointer">
                            <input
                              type="checkbox"
                              checked={appSettings.hydra.enabledSources.includes(source.id)}
                              onChange={(e) => {
                                const newSources = e.target.checked
                                  ? [...appSettings.hydra.enabledSources, source.id]
                                  : appSettings.hydra.enabledSources.filter((s) => s !== source.id);
                                updateHydraSettings({ enabledSources: newSources });
                              }}
                              className="mt-0.5 rounded border-border"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{
                                    backgroundColor: {
                                      trusted: '#22c55e',
                                      safe: '#3b82f6',
                                      abandoned: '#f59e0b',
                                      unsafe: '#ef4444',
                                      nsfw: '#a855f7',
                                    }[source.trustLevel],
                                  }}
                                />
                                <span className="text-sm font-medium truncate">{source.name}</span>
                              </div>
                              {source.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{source.description}</p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border space-y-4">
                      <NumberInput
                        label="Cache Duration"
                        description="How long to cache Hydra library data (in minutes)"
                        value={appSettings.hydra.cacheDurationMinutes}
                        onChange={(v) => updateHydraSettings({ cacheDurationMinutes: v })}
                        min={5}
                        max={1440}
                        unit="min"
                      />
                      
                      <NumberInput
                        label="Max Results Per Source"
                        description="Maximum number of results to return from each source"
                        value={appSettings.hydra.maxResultsPerSource}
                        onChange={(v) => updateHydraSettings({ maxResultsPerSource: v })}
                        min={1}
                        max={50}
                        unit="results"
                      />
                    </div>
                  </>
                )}
              </div>
            </SettingsSection>

            <SettingsSection title="Direct Download (DDL)" description="Configure direct download settings for Rezi and other DDL sources" icon="⬇️">
              <div className="space-y-4">
                <Toggle
                  label="Enable Direct Downloads"
                  description="Allow downloading games directly from DDL sources like archive.org, buzzheavier, etc."
                  checked={appSettings.ddl?.enabled ?? true}
                  onChange={(v) => updateDDLSettings({ enabled: v })}
                />
                
                <div className="pt-4 border-t border-border space-y-4">
                  <TextInput
                    label="Download Path"
                    description="Directory where direct downloads will be saved"
                    value={appSettings.ddl?.downloadPath || 'E:/Downloads'}
                    onChange={(v) => updateDDLSettings({ downloadPath: v })}
                    placeholder="E:/Downloads"
                  />
                  
                  <Toggle
                    label="Create Game Subfolders"
                    description="Create a separate subfolder for each game"
                    checked={appSettings.ddl?.createGameSubfolders ?? true}
                    onChange={(v) => updateDDLSettings({ createGameSubfolders: v })}
                  />
                  
                  <NumberInput
                    label="Max Concurrent Downloads"
                    description="Maximum number of simultaneous downloads"
                    value={appSettings.ddl?.maxConcurrentDownloads || 3}
                    onChange={(v) => updateDDLSettings({ maxConcurrentDownloads: v })}
                    min={1}
                    max={10}
                    unit="downloads"
                  />
                  
                  <NumberInput
                    label="Max Retries"
                    description="Number of retry attempts for failed downloads"
                    value={appSettings.ddl?.maxRetries || 3}
                    onChange={(v) => updateDDLSettings({ maxRetries: v })}
                    min={0}
                    max={10}
                    unit="retries"
                  />
                </div>
              </div>
            </SettingsSection>
          </div>
        )}

        {/* Downloads Tab */}
        {activeTab === 'downloads' && appSettings && (
          <div className="space-y-8">
            <SettingsSection title="Queue Management" description="Configure download queue behavior" icon="⬇️">
              <div className="space-y-4">
                <Toggle
                  label="Enable Arr Queue Deduplication"
                  description="Automatically remove duplicate items from Radarr, Sonarr, and Readarr queues"
                  checked={appSettings.downloads.dedupeArrEnabled}
                  onChange={(v) => updateDownloadsSettings({ dedupeArrEnabled: v })}
                />
              </div>
            </SettingsSection>

            <SettingsSection title="Game Directories" description="Configure game library paths" icon="🎮">
              <div className="space-y-4">
                <TextInput
                  label="Games Directories"
                  description="Comma-separated list of paths to scan for installed games"
                  value={appSettings.downloads.gamesDirectories}
                  onChange={(v) => updateDownloadsSettings({ gamesDirectories: v })}
                  placeholder="/games,/storage/games"
                />
              </div>
            </SettingsSection>
          </div>
        )}

        {/* System Tab */}
        {activeTab === 'system' && appSettings && (
          <div className="space-y-8">
            <SettingsSection title="Cache Configuration" description="Control how long data is cached" icon="💾">
              <div className="space-y-4">
                <NumberInput
                  label="Default Cache TTL"
                  description="Default time-to-live for cached data"
                  value={appSettings.cache.defaultTtlSeconds}
                  onChange={(v) => updateCacheSettings({ defaultTtlSeconds: v })}
                  min={10}
                  max={86400}
                  unit="sec"
                />
                
                <NumberInput
                  label="Queue Cache TTL"
                  description="How long to cache download queue data"
                  value={appSettings.cache.queueTtlSeconds}
                  onChange={(v) => updateCacheSettings({ queueTtlSeconds: v })}
                  min={1}
                  max={300}
                  unit="sec"
                />
                
                <NumberInput
                  label="Health Cache TTL"
                  description="How long to cache health check results"
                  value={appSettings.cache.healthTtlSeconds}
                  onChange={(v) => updateCacheSettings({ healthTtlSeconds: v })}
                  min={5}
                  max={600}
                  unit="sec"
                />
              </div>
            </SettingsSection>

            <SettingsSection title="System Settings" description="General system configuration" icon="⚙️">
              <div className="space-y-4">
                <NumberInput
                  label="Max Log Entries"
                  description="Maximum number of log entries to keep in memory"
                  value={appSettings.system.logStoreMaxEntries}
                  onChange={(v) => updateSystemSettings({ logStoreMaxEntries: v })}
                  min={100}
                  max={10000}
                  unit="entries"
                />
                
                <TextInput
                  label="Timezone"
                  value={appSettings.system.timezone}
                  onChange={(v) => updateSystemSettings({ timezone: v })}
                  placeholder="UTC"
                  description="Application timezone (e.g., UTC, America/New_York, Europe/London)"
                />
                
                <TextInput
                  label="Data Directory"
                  value={appSettings.system.dataDirectory}
                  onChange={(v) => updateSystemSettings({ dataDirectory: v })}
                  placeholder="/app/data"
                  description="Path where application data is stored"
                />
              </div>
            </SettingsSection>
          </div>
        )}

        {/* Advanced Tab */}
        {activeTab === 'advanced' && appSettings && (
          <div className="space-y-8">
            <SettingsSection title="Tdarr Integration" description="Advanced Tdarr configuration" icon="🎬">
              <div className="space-y-4">
                <NumberInput
                  label="File Age Retry Minutes"
                  description="How long to wait before retrying failed transcodes"
                  value={appSettings.tdarr.fileAgeRetryMinutes}
                  onChange={(v) => updateTdarrSettings({ fileAgeRetryMinutes: v })}
                  min={1}
                  max={1440}
                  unit="min"
                />
                
                <TextInput
                  label="Local Database Path"
                  value={appSettings.tdarr.localDbPath}
                  onChange={(v) => updateTdarrSettings({ localDbPath: v })}
                  placeholder="/app/data/tdarr-status.db"
                  description="Path to local Tdarr status database (optional)"
                />
              </div>
            </SettingsSection>

            <SettingsSection title="Configuration Management" description="Manage your settings" icon="⚠️">
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    <strong>Warning:</strong> Resetting settings will restore all values to their defaults. 
                    Service configurations will not be affected.
                  </p>
                </div>
                
                <button
                  onClick={() => {
                    if (confirm('Reset all app settings to defaults? Service configurations will not be affected.')) {
                      api.post('/app-settings/reset').then(() => {
                        queryClient.invalidateQueries({ queryKey: ['app-settings'] });
                      });
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition-colors"
                >
                  Reset App Settings to Defaults
                </button>
              </div>
            </SettingsSection>
          </div>
        )}
      </div>
    </div>
  );
}
