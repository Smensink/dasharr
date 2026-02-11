type Pair = { id: string; query: string; text: string };

type BatchScoreResponse = {
  scores: Array<{ id?: string | null; score: number }>;
};

class Semaphore {
  private available: number;
  private queue: Array<() => void> = [];

  constructor(max: number) {
    this.available = Math.max(1, max);
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.available -= 1;
    return () => this.release();
  }

  private release() {
    this.available += 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

const cache = new Map<string, number>();
const MAX_CACHE = 50_000;
const sem = new Semaphore(parseInt(process.env.MATCH_RERANKER_CONCURRENCY ?? '4', 10) || 4);

function cacheKey(query: string, text: string): string {
  return `${query}|||${text}`;
}

function setCache(k: string, v: number) {
  cache.set(k, v);
  if (cache.size > MAX_CACHE) {
    // Drop oldest entries (insertion order) to cap memory.
    const first = cache.keys().next().value as string | undefined;
    if (first) cache.delete(first);
  }
}

function getBaseUrl(): string | null {
  const enabled = (process.env.MATCH_RERANKER_ENABLED ?? 'false').toLowerCase() === 'true';
  if (!enabled) return null;
  const url = (process.env.MATCH_RERANKER_URL ?? '').trim();
  if (!url) return null;
  return url.replace(/\/+$/, '');
}

function timeoutMs(): number {
  const n = parseInt(process.env.MATCH_RERANKER_TIMEOUT_MS ?? '2500', 10);
  return Number.isFinite(n) ? Math.max(250, n) : 2500;
}

async function postJson<T>(url: string, body: unknown, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Reranker HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function rerankerBatchScore(
  query: string,
  texts: string[]
): Promise<Array<number | null>> {
  const base = getBaseUrl();
  if (!base) return texts.map(() => null);

  const ms = timeoutMs();
  const out: Array<number | null> = new Array(texts.length).fill(null);

  // Use cache first.
  const pairs: Pair[] = [];
  for (let i = 0; i < texts.length; i += 1) {
    const text = texts[i] ?? '';
    const k = cacheKey(query, text);
    const cached = cache.get(k);
    if (cached !== undefined) {
      out[i] = cached;
    } else {
      pairs.push({ id: String(i), query, text });
    }
  }

  if (pairs.length === 0) return out;

  const release = await sem.acquire();
  try {
    const resp = await postJson<BatchScoreResponse>(
      `${base}/batch_score`,
      { pairs },
      ms
    );
    for (const s of resp.scores ?? []) {
      const id = s.id ?? '';
      const idx = parseInt(String(id), 10);
      if (!Number.isFinite(idx) || idx < 0 || idx >= texts.length) continue;
      const score = Number(s.score);
      if (!Number.isFinite(score)) continue;
      out[idx] = score;
      setCache(cacheKey(query, texts[idx] ?? ''), score);
    }
  } catch {
    // Best-effort: leave nulls on errors/timeouts.
    return out;
  } finally {
    release();
  }

  return out;
}

