import radarr from '@/assets/service-icons/radarr.svg';
import sonarr from '@/assets/service-icons/sonarr.svg';
import readarr from '@/assets/service-icons/readarr.svg';
import prowlarr from '@/assets/service-icons/prowlarr.svg';
import bazarr from '@/assets/service-icons/bazarr.svg';
import sabnzbd from '@/assets/service-icons/sabnzbd.svg';
import qbittorrent from '@/assets/service-icons/qbittorrent.svg';
import rdtclient from '@/assets/service-icons/rdtclient.svg';
import plex from '@/assets/service-icons/plex.svg';
import tautulli from '@/assets/service-icons/tautulli.svg';
import tdarr from '@/assets/service-icons/tdarr.png';
import dasharr from '@/assets/service-icons/dasharr.svg';
import tmdb from '@/assets/service-icons/tmdb.svg';
import trakt from '@/assets/service-icons/trakt.svg';
import omdb from '@/assets/service-icons/omdb.svg';

const iconMap: Record<string, string> = {
  radarr,
  sonarr,
  readarr,
  prowlarr,
  bazarr,
  sabnzbd,
  qbittorrent,
  rdtclient,
  plex,
  tautulli,
  tdarr,
  dasharr,
  tmdb,
  trakt,
  omdb,
};

const normalizeService = (service: string): string =>
  service
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[-_]/g, '');

const resolveServiceKey = (service: string): string => {
  const normalized = normalizeService(service);
  if (normalized === 'qbit' || normalized === 'qbittorrent') return 'qbittorrent';
  if (normalized === 'sab' || normalized === 'sabnzbd') return 'sabnzbd';
  if (normalized === 'rdt' || normalized === 'rdtclient' || normalized === 'realdebrid') return 'rdtclient';
  if (normalized === 'themoviedb' || normalized === 'moviedb') return 'tmdb';
  if (normalized === 'igdb' || normalized === 'games') return 'dasharr';
  return normalized;
};

export function ServiceIcon({
  service,
  size = 24,
  className = '',
}: {
  service: string;
  size?: number;
  className?: string;
}) {
  const key = resolveServiceKey(service);
  const src = iconMap[key];
  if (!src) return null;

  return (
    <img
      src={src}
      alt={`${service} icon`}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      loading="lazy"
    />
  );
}
