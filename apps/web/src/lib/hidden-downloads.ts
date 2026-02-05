const STORAGE_KEY = 'dasharr.hidden-downloads';

export function getHiddenDownloadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry) => typeof entry === 'string'));
  } catch {
    return new Set();
  }
}

export function setHiddenDownloadIds(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore storage failures
  }
}

export function pruneHiddenDownloadIds(
  ids: Set<string>,
  availableIds: string[]
): Set<string> {
  const available = new Set(availableIds);
  const next = new Set<string>();
  ids.forEach((id) => {
    if (available.has(id)) {
      next.add(id);
    }
  });
  return next;
}
