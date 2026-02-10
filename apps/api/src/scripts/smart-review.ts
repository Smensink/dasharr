/**
 * Smart Review Script
 *
 * Analyzes a large audit CSV and produces:
 *   1) Summary statistics
 *   2) Auto-labels for obvious cases (high-confidence 0/1)
 *   3) A focused review CSV of ~500-1500 borderline rows that need human eyes
 *
 * Heuristic buckets:
 *
 *   AUTO-LABEL 0 (false positive — matched but shouldn't be):
 *     - Unreleased game has matches (game not out yet = fake release)
 *     - Tiny file size (<50 MB) for a "matched" result
 *     - Candidate published >6 months before game release date
 *     - "demo/alpha/beta" or "DLC/expansion only" in reasons but matched
 *     - Sequel mismatch in reasons but matched
 *
 *   AUTO-LABEL 1 (true positive — matched and clearly correct):
 *     - Exact name match from a trusted source
 *     - Exact phrase + very high word match + trusted source
 *
 *   AUTO-LABEL 0 (true negative — not matched and clearly correct):
 *     - Score 0, no name overlap at all
 *
 *   REVIEW BUCKET (borderline cases for human review):
 *     - Matched but score 30-75 (low-confidence match)
 *     - Not matched but score 50-69 (close miss)
 *     - Unreleased game with score > 0 (might be scam worth looking at)
 *     - Matched, from untrusted source, size < 500 MB
 *     - Matched but "many extra words" reason
 *     - Random sample from auto-labeled buckets (validation)
 *
 * Usage: npx ts-node src/scripts/smart-review.ts [path-to-csv]
 */
import fs from 'fs';
import path from 'path';

// ── CSV parsing ──────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(current); current = ''; }
      else current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function csvEscape(val: string | number | boolean | undefined | null): string {
  if (val === undefined || val === null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── Types ────────────────────────────────────────────────────────────

interface Row {
  gameId: string;
  gameName: string;
  gameReleaseDate: string;
  gameReleaseStatus: string;
  candidateTitle: string;
  candidateSource: string;
  indexerName: string;
  matchScore: number;
  matched: boolean;
  reasons: string;
  size: string;
  sizeBytes: number;
  seeders: number;
  leechers: number;
  grabs: number;
  uploader: string;
  publishDate: string;
  releaseType: string;
  type: string;
  reviewFlag: string;
  label: string;
  sourceTrustLevel: string;
  // Added by this script:
  autoLabel: string;       // '0', '1', or ''
  autoReason: string;      // Why it was auto-labeled
  reviewBucket: string;    // Which review bucket it falls into
}

function parseRow(fields: string[], headers: string[]): Row {
  const obj: any = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = fields[i] || '';
  }
  return {
    ...obj,
    matchScore: parseFloat(obj.matchScore) || 0,
    matched: obj.matched === 'true',
    sizeBytes: parseFloat(obj.sizeBytes) || 0,
    seeders: parseInt(obj.seeders) || 0,
    leechers: parseInt(obj.leechers) || 0,
    grabs: parseInt(obj.grabs) || 0,
    autoLabel: '',
    autoReason: '',
    reviewBucket: '',
  };
}

// ── Heuristics ───────────────────────────────────────────────────────

function isUnreleased(row: Row): boolean {
  return row.gameReleaseStatus === 'unreleased' || row.gameReleaseStatus === 'no-date';
}

function hasReason(row: Row, keyword: string): boolean {
  return row.reasons.toLowerCase().includes(keyword.toLowerCase());
}

function candidateBeforeRelease(row: Row): boolean {
  if (!row.publishDate || !row.gameReleaseDate || row.gameReleaseDate === 'unknown') return false;
  try {
    const pub = new Date(row.publishDate).getTime();
    const rel = new Date(row.gameReleaseDate).getTime();
    if (isNaN(pub) || isNaN(rel)) return false;
    // Published more than 180 days before release
    return pub < rel - 180 * 24 * 60 * 60 * 1000;
  } catch { return false; }
}

function candidateAfterRelease(row: Row): boolean {
  if (!row.publishDate || !row.gameReleaseDate || row.gameReleaseDate === 'unknown') return false;
  try {
    const pub = new Date(row.publishDate).getTime();
    const rel = new Date(row.gameReleaseDate).getTime();
    if (isNaN(pub) || isNaN(rel)) return false;
    return pub >= rel;
  } catch { return false; }
}

function isTrusted(row: Row): boolean {
  return row.sourceTrustLevel === 'trusted' || row.sourceTrustLevel === 'safe';
}

// ── Auto-labeling logic ──────────────────────────────────────────────

function autoLabel(row: Row): { label: string; reason: string } {
  const r = row.reasons.toLowerCase();

  // ── Auto 0: Obvious false positives ──

  // Unreleased game with a match = almost certainly fake
  if (row.matched && isUnreleased(row)) {
    return { label: '0', reason: 'unreleased game matched (likely fake)' };
  }

  // Matched but has sequel mismatch
  if (row.matched && (hasReason(row, 'different sequel number') || hasReason(row, 'title is numbered sequel'))) {
    if (!hasReason(row, 'sequel number matches') && !hasReason(row, 'exact name match')) {
      return { label: '0', reason: 'sequel mismatch but matched' };
    }
  }

  // Matched but it's a demo/DLC/update/non-game
  if (row.matched && (hasReason(row, 'demo/alpha/beta') || hasReason(row, 'DLC/expansion only') ||
      hasReason(row, 'update/patch only') || hasReason(row, 'non-game media') ||
      hasReason(row, 'crack/fix only') || hasReason(row, 'language pack') || hasReason(row, 'mod/fan content'))) {
    return { label: '0', reason: 'matched but content type excluded' };
  }

  // Tiny file size for a matched result (< 50 MB) — likely not a real game
  if (row.matched && row.sizeBytes > 0 && row.sizeBytes < 50 * 1024 * 1024) {
    return { label: '0', reason: 'matched but tiny file (<50MB)' };
  }

  // Published way before game release (pre-release scam)
  if (row.matched && candidateBeforeRelease(row)) {
    return { label: '0', reason: 'published >6mo before game release' };
  }

  // ── Auto 1: Obvious true positives ──

  // Exact name match from trusted source
  if (row.matched && hasReason(row, 'exact name match') && isTrusted(row)) {
    return { label: '1', reason: 'exact name + trusted source' };
  }

  // Exact phrase + very high word match + high score from trusted source
  if (row.matched && hasReason(row, 'exact phrase in title') &&
      hasReason(row, 'very high word match') && row.matchScore >= 80 && isTrusted(row)) {
    return { label: '1', reason: 'exact phrase + high score + trusted' };
  }

  // High score match from trusted source with all keywords
  if (row.matched && row.matchScore >= 90 && isTrusted(row) &&
      hasReason(row, 'all main keywords present')) {
    return { label: '1', reason: 'high score + trusted + all keywords' };
  }

  // ── Auto 0: Obvious true negatives ──

  // Score 0, clearly not a match
  if (!row.matched && row.matchScore === 0) {
    return { label: '0', reason: 'score 0 (no match at all)' };
  }

  // Not matched, very low score, and not from trusted source
  if (!row.matched && row.matchScore < 20) {
    return { label: '0', reason: 'very low score rejected' };
  }

  // Not matched, has too many unrelated words
  if (!row.matched && hasReason(row, 'too many unrelated words')) {
    return { label: '0', reason: 'too many unrelated words' };
  }

  // ── Auto 1: Obvious true negatives that are actually positives ──

  // Score >= 80, all keywords, from trusted source but rejected by ML
  if (!row.matched && row.matchScore >= 80 && isTrusted(row) &&
      hasReason(row, 'all main keywords present') && hasReason(row, 'ml probability')) {
    // ML rejected a high-score trusted match — likely a false negative
    return { label: '1', reason: 'high score trusted match rejected by ML' };
  }

  return { label: '', reason: '' };
}

// ── Review bucket assignment ─────────────────────────────────────────

function assignReviewBucket(row: Row): string {
  // Already auto-labeled? Only flag for validation sampling
  // Return empty — we'll sample from auto-labeled separately

  // Matched with low confidence (score 30-75)
  if (row.matched && row.matchScore >= 30 && row.matchScore <= 75) {
    return 'low_confidence_match';
  }

  // Not matched but close (score 50-69)
  if (!row.matched && row.matchScore >= 50 && row.matchScore < 70) {
    return 'close_miss';
  }

  // Unreleased game with any score > 0 (interesting to review whether any results are legit)
  if (isUnreleased(row) && row.matchScore > 0) {
    return 'unreleased_with_results';
  }

  // Matched but from untrusted source with small size
  if (row.matched && !isTrusted(row) && row.sizeBytes > 0 && row.sizeBytes < 500 * 1024 * 1024) {
    return 'untrusted_small_match';
  }

  // Matched but has "many extra words"
  if (row.matched && hasReason(row, 'many extra words')) {
    return 'extra_words_match';
  }

  // 0 seeders on a matched torrent (could be dead/fake)
  if (row.matched && row.seeders === 0 && row.sizeBytes > 0 && row.type === 'prowlarr') {
    return 'zero_seeders_match';
  }

  // Not matched, from trusted source, score > 30 (potential FN)
  if (!row.matched && isTrusted(row) && row.matchScore > 30) {
    return 'trusted_rejected';
  }

  return '';
}

// ── Main ─────────────────────────────────────────────────────────────

function run() {
  const csvArg = process.argv[2] || '/app/data/audit-500-trust.csv';
  const csvPath = path.resolve(csvArg);

  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());
  const headers = parseCsvLine(lines[0]);

  console.log(`Loading ${lines.length - 1} rows...\n`);

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length >= headers.length) {
      rows.push(parseRow(fields, headers));
    }
  }

  // ── Phase 1: Auto-label ──
  const stats = {
    total: rows.length,
    matched: 0,
    notMatched: 0,
    autoLabel1: 0,
    autoLabel0: 0,
    unlabeled: 0,
    bySource: {} as Record<string, { total: number; matched: number }>,
    byReleaseStatus: {} as Record<string, { total: number; matched: number }>,
    byTrustLevel: {} as Record<string, { total: number; matched: number }>,
    autoReasons: {} as Record<string, number>,
    reviewBuckets: {} as Record<string, number>,
  };

  for (const row of rows) {
    if (row.matched) stats.matched++;
    else stats.notMatched++;

    // Source stats
    const srcKey = row.candidateSource.split(' (')[0]; // "Prowlarr (1337x)" → "Prowlarr"
    if (!stats.bySource[srcKey]) stats.bySource[srcKey] = { total: 0, matched: 0 };
    stats.bySource[srcKey].total++;
    if (row.matched) stats.bySource[srcKey].matched++;

    // Release status stats
    if (!stats.byReleaseStatus[row.gameReleaseStatus]) stats.byReleaseStatus[row.gameReleaseStatus] = { total: 0, matched: 0 };
    stats.byReleaseStatus[row.gameReleaseStatus].total++;
    if (row.matched) stats.byReleaseStatus[row.gameReleaseStatus].matched++;

    // Trust level stats
    const tl = row.sourceTrustLevel || 'none';
    if (!stats.byTrustLevel[tl]) stats.byTrustLevel[tl] = { total: 0, matched: 0 };
    stats.byTrustLevel[tl].total++;
    if (row.matched) stats.byTrustLevel[tl].matched++;

    // Auto-label
    const al = autoLabel(row);
    row.autoLabel = al.label;
    row.autoReason = al.reason;

    if (al.label === '1') stats.autoLabel1++;
    else if (al.label === '0') stats.autoLabel0++;
    else stats.unlabeled++;

    if (al.reason) {
      stats.autoReasons[al.reason] = (stats.autoReasons[al.reason] || 0) + 1;
    }

    // Review bucket (only for unlabeled rows)
    if (!al.label) {
      row.reviewBucket = assignReviewBucket(row);
      if (row.reviewBucket) {
        stats.reviewBuckets[row.reviewBucket] = (stats.reviewBuckets[row.reviewBucket] || 0) + 1;
      }
    }
  }

  // ── Phase 2: Build review set ──
  // Take all review-bucketed rows + validation sample from auto-labeled
  const reviewRows: Row[] = [];
  const bucketedRows = rows.filter((r) => r.reviewBucket);

  // Cap each bucket to avoid one bucket dominating
  const bucketGroups: Record<string, Row[]> = {};
  for (const row of bucketedRows) {
    if (!bucketGroups[row.reviewBucket]) bucketGroups[row.reviewBucket] = [];
    bucketGroups[row.reviewBucket].push(row);
  }

  const MAX_PER_BUCKET = 150;
  for (const [bucket, bRows] of Object.entries(bucketGroups)) {
    // Shuffle and take up to MAX_PER_BUCKET
    const shuffled = bRows.sort(() => Math.random() - 0.5);
    reviewRows.push(...shuffled.slice(0, MAX_PER_BUCKET));
  }

  // Add validation samples from auto-labeled
  const autoLabel1Rows = rows.filter((r) => r.autoLabel === '1');
  const autoLabel0Matched = rows.filter((r) => r.autoLabel === '0' && r.matched);
  const autoLabel0NotMatched = rows.filter((r) => r.autoLabel === '0' && !r.matched);

  // Sample ~30 from each auto-labeled category for spot-checking
  const VALIDATION_SAMPLE = 30;
  function sample(arr: Row[], n: number): Row[] {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n).map((r) => ({ ...r, reviewBucket: 'validation_auto1' }));
  }

  reviewRows.push(...sample(autoLabel1Rows, VALIDATION_SAMPLE).map((r) => ({ ...r, reviewBucket: 'validation_auto1' })));
  reviewRows.push(...sample(autoLabel0Matched, VALIDATION_SAMPLE).map((r) => ({ ...r, reviewBucket: 'validation_auto0_matched' })));
  reviewRows.push(...sample(autoLabel0NotMatched, VALIDATION_SAMPLE).map((r) => ({ ...r, reviewBucket: 'validation_auto0_rejected' })));

  // ── Phase 3: Output ──

  // Print summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('                   AUDIT SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Total rows:      ${stats.total.toLocaleString()}`);
  console.log(`Matched:         ${stats.matched.toLocaleString()} (${(stats.matched / stats.total * 100).toFixed(1)}%)`);
  console.log(`Not matched:     ${stats.notMatched.toLocaleString()} (${(stats.notMatched / stats.total * 100).toFixed(1)}%)`);
  console.log('');

  console.log('── By Source ──');
  for (const [src, s] of Object.entries(stats.bySource).sort((a, b) => b[1].total - a[1].total)) {
    const pct = (s.matched / s.total * 100).toFixed(1);
    console.log(`  ${src.padEnd(20)} ${String(s.total).padStart(7)} total, ${String(s.matched).padStart(6)} matched (${pct}%)`);
  }
  console.log('');

  console.log('── By Release Status ──');
  for (const [status, s] of Object.entries(stats.byReleaseStatus).sort((a, b) => b[1].total - a[1].total)) {
    const pct = (s.matched / s.total * 100).toFixed(1);
    console.log(`  ${status.padEnd(20)} ${String(s.total).padStart(7)} total, ${String(s.matched).padStart(6)} matched (${pct}%)`);
  }
  console.log('');

  console.log('── By Trust Level ──');
  for (const [tl, s] of Object.entries(stats.byTrustLevel).sort((a, b) => b[1].total - a[1].total)) {
    const pct = (s.matched / s.total * 100).toFixed(1);
    console.log(`  ${tl.padEnd(20)} ${String(s.total).padStart(7)} total, ${String(s.matched).padStart(6)} matched (${pct}%)`);
  }
  console.log('');

  console.log('═══════════════════════════════════════════════════════');
  console.log('                   AUTO-LABELING');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Auto-labeled 1:  ${stats.autoLabel1.toLocaleString()}`);
  console.log(`Auto-labeled 0:  ${stats.autoLabel0.toLocaleString()}`);
  console.log(`Unlabeled:       ${stats.unlabeled.toLocaleString()}`);
  console.log('');

  console.log('── Auto-label reasons ──');
  for (const [reason, count] of Object.entries(stats.autoReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason.padEnd(45)} ${String(count).padStart(7)}`);
  }
  console.log('');

  console.log('═══════════════════════════════════════════════════════');
  console.log('                   REVIEW BUCKETS');
  console.log('═══════════════════════════════════════════════════════\n');

  for (const [bucket, count] of Object.entries(stats.reviewBuckets).sort((a, b) => b[1] - a[1])) {
    const capped = Math.min(count, MAX_PER_BUCKET);
    console.log(`  ${bucket.padEnd(30)} ${String(count).padStart(6)} flagged → ${capped} in review set`);
  }
  console.log(`\n  Total review rows: ${reviewRows.length}`);
  console.log('');

  // Write auto-labeled CSV (full dataset with auto-labels)
  const autoLabeledPath = csvPath.replace('.csv', '-autolabeled.csv');
  const outHeaders = [...headers, 'autoLabel', 'autoReason', 'reviewBucket'];
  const autoLines = [outHeaders.map(csvEscape).join(',')];
  for (const row of rows) {
    const fields = headers.map((h) => csvEscape((row as any)[h]));
    fields.push(csvEscape(row.autoLabel), csvEscape(row.autoReason), csvEscape(row.reviewBucket));
    autoLines.push(fields.join(','));
  }
  fs.writeFileSync(autoLabeledPath, autoLines.join('\n') + '\n', 'utf-8');
  console.log(`Full auto-labeled CSV: ${autoLabeledPath}`);

  // Write review CSV (just the rows that need human eyes)
  const reviewPath = csvPath.replace('.csv', '-review.csv');
  const reviewHeaders = [...outHeaders];
  const reviewLines = [reviewHeaders.map(csvEscape).join(',')];
  // Sort review rows: review buckets first, then validation
  reviewRows.sort((a, b) => {
    if (a.reviewBucket.startsWith('validation') && !b.reviewBucket.startsWith('validation')) return 1;
    if (!a.reviewBucket.startsWith('validation') && b.reviewBucket.startsWith('validation')) return -1;
    return a.reviewBucket.localeCompare(b.reviewBucket);
  });
  for (const row of reviewRows) {
    const fields = headers.map((h) => csvEscape((row as any)[h]));
    fields.push(csvEscape(row.autoLabel), csvEscape(row.autoReason), csvEscape(row.reviewBucket));
    reviewLines.push(fields.join(','));
  }
  fs.writeFileSync(reviewPath, reviewLines.join('\n') + '\n', 'utf-8');
  console.log(`Review CSV (needs human labels): ${reviewPath}`);

  // Write summary stats as JSON
  const statsPath = csvPath.replace('.csv', '-stats.json');
  fs.writeFileSync(statsPath, JSON.stringify({
    ...stats,
    reviewRowCount: reviewRows.length,
    reviewBucketSizes: Object.fromEntries(
      Object.entries(bucketGroups).map(([k, v]) => [k, { flagged: v.length, inReview: Math.min(v.length, MAX_PER_BUCKET) }])
    ),
  }, null, 2), 'utf-8');
  console.log(`Stats JSON: ${statsPath}`);
}

run();
