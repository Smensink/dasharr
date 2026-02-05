const STORAGE_KEY = 'dasharr-plex-client-id';

export function getPlexClientId(): string {
  if (typeof window === 'undefined') {
    return `dasharr-${Date.now()}`;
  }

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const id = `dasharr-${crypto.randomUUID()}`;
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return `dasharr-${Date.now()}`;
  }
}
