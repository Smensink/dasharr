import { normalizeUnicode, stripEditionSuffix } from './TitleNormalizer';

/**
 * Shared normalization for similarity features.
 * Intentionally mirrors the kind of cleaning we do in matching heuristics so
 * the ML features are consistent between runtime + offline training/eval.
 */
export function normalizeForSimilarity(input: string): string {
  let cleaned = normalizeUnicode(input ?? '').toLowerCase();
  cleaned = cleaned.replace(/[\u0027\u2019]/g, '');
  cleaned = cleaned.replace(/([a-z])-([a-z])/g, '$1$2');
  cleaned = cleaned.replace(/[^a-z0-9\s]/g, ' ');
  cleaned = cleaned.replace(/\s*[–—-]\s*v?\d+[\d.]*.*$/i, '');
  cleaned = cleaned.replace(/\s+\+.*$/, '');
  cleaned = stripEditionSuffix(cleaned);
  cleaned = cleaned.replace(/\s*\(\s*\d{4}\s*\)\s*$/, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

function tokenize(s: string): string[] {
  return (s ?? '')
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function tokenJaccard(a: string, b: string): number {
  const at = new Set(tokenize(a));
  const bt = new Set(tokenize(b));
  if (at.size === 0 && bt.size === 0) return 1;
  if (at.size === 0 || bt.size === 0) return 0;

  let inter = 0;
  for (const t of at) {
    if (bt.has(t)) inter++;
  }
  const union = at.size + bt.size - inter;
  return union > 0 ? inter / union : 0;
}

function charNgrams(s: string, n: number): Set<string> {
  const out = new Set<string>();
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return out;
  if (t.length <= n) {
    out.add(t);
    return out;
  }
  for (let i = 0; i <= t.length - n; i += 1) {
    out.add(t.slice(i, i + n));
  }
  return out;
}

export function charNgramJaccard(a: string, b: string, n = 3): number {
  const an = charNgrams(a, n);
  const bn = charNgrams(b, n);
  if (an.size === 0 && bn.size === 0) return 1;
  if (an.size === 0 || bn.size === 0) return 0;

  let inter = 0;
  for (const g of an) {
    if (bn.has(g)) inter++;
  }
  const union = an.size + bn.size - inter;
  return union > 0 ? inter / union : 0;
}

export function lengthRatio(a: string, b: string): number {
  const la = (a ?? '').length;
  const lb = (b ?? '').length;
  if (la === 0 && lb === 0) return 1;
  if (la === 0 || lb === 0) return 0;
  return Math.min(la, lb) / Math.max(la, lb);
}

