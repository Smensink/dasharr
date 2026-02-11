import fs from 'fs';

import {
  extractFeatures,
  loadCombinedModel,
  resolveModelPath,
  predictCombined,
} from '../utils/MatchModel';
import {
  normalizeForSimilarity,
  tokenJaccard,
  charNgramJaccard,
  lengthRatio,
} from '../utils/TextSimilarity';

type Row = Record<string, string>;

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = content[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      continue;
    }

    if (ch === '\r') continue;

    field += ch;
  }

  // Final field/row (if file doesn't end with newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function readCsvAsObjects(filePath: string): Row[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(raw);
  if (rows.length < 2) return [];

  const header = rows[0];
  const out: Row[] = [];
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.length === 1 && values[0] === '') continue;
    const obj: Row = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = values[j] ?? '';
    }
    out.push(obj);
  }
  return out;
}

function toBool(v: string | undefined): boolean {
  const s = (v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function toNumber(v: string | undefined): number {
  const n = Number((v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
}

function maybeInt(v: string | undefined): number | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

type Confusion = {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
};

function initConfusion(): Confusion {
  return { tp: 0, fp: 0, tn: 0, fn: 0 };
}

function addOutcome(c: Confusion, truthPos: boolean, predPos: boolean): void {
  if (truthPos && predPos) c.tp++;
  else if (!truthPos && predPos) c.fp++;
  else if (!truthPos && !predPos) c.tn++;
  else c.fn++;
}

function metrics(c: Confusion) {
  const precision = c.tp + c.fp > 0 ? c.tp / (c.tp + c.fp) : 0;
  const recall = c.tp + c.fn > 0 ? c.tp / (c.tp + c.fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const acc = c.tp + c.tn + c.fp + c.fn > 0 ? (c.tp + c.tn) / (c.tp + c.tn + c.fp + c.fn) : 0;
  return { precision, recall, f1, acc };
}

function fmt(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function printReport(label: string, c: Confusion): void {
  const m = metrics(c);
  // Keep output stable and scannable.
  // eslint-disable-next-line no-console
  console.log(
    [
      label.padEnd(18),
      `P=${fmt(m.precision)}`,
      `R=${fmt(m.recall)}`,
      `F1=${fmt(m.f1)}`,
      `Acc=${fmt(m.acc)}`,
      `TP=${c.tp}`,
      `FP=${c.fp}`,
      `TN=${c.tn}`,
      `FN=${c.fn}`,
    ].join('  ')
  );
}

function main() {
  const args = process.argv.slice(2);
  const files = args.length > 0
    ? args
    : Array.from({ length: 10 }, (_, i) => `/tmp/sample${i + 1}.csv`);

  const modelPath = resolveModelPath(process.env.MATCH_MODEL_PATH);
  const combined = loadCombinedModel(modelPath);
  if (!combined) {
    // eslint-disable-next-line no-console
    console.error(`No combined model found at ${modelPath}`);
    process.exit(2);
  }
  const threshold = process.env.MATCH_MODEL_THRESHOLD
    ? parseFloat(process.env.MATCH_MODEL_THRESHOLD)
    : combined.threshold;

  // eslint-disable-next-line no-console
  console.log(`Model: ${modelPath}`);
  // eslint-disable-next-line no-console
  console.log(`Type: ${combined.type}, threshold=${threshold}, ensembleWeight=${combined.ensembleWeight}`);
  // eslint-disable-next-line no-console
  console.log('');

  const totalBaseline = initConfusion();
  const totalHybrid = initConfusion();
  const totalMlOnly = initConfusion();
  const totalTriage = initConfusion();

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      // eslint-disable-next-line no-console
      console.log(`Missing: ${filePath}`);
      continue;
    }

    const rows = readCsvAsObjects(filePath);
    const baseline = initConfusion();
    const hybrid = initConfusion();
    const mlOnly = initConfusion();
    const triage = initConfusion();

    const triageRejectOverride = process.env.MATCH_MODEL_REJECT_THRESHOLD
      ? parseFloat(process.env.MATCH_MODEL_REJECT_THRESHOLD)
      : null;
    const triageReject = triageRejectOverride !== null && Number.isFinite(triageRejectOverride)
      ? triageRejectOverride
      : null;

    for (const r of rows) {
      const truthPos = (r.label ?? '').trim() === '1';
      const matched = toBool(r.matched);
      const score = toNumber(r.matchScore);
      const reasonsRaw = (r.reasons ?? '').trim();
      const reasons = reasonsRaw ? reasonsRaw.split('|').map((x) => x.trim()).filter(Boolean) : [];

      // Backfill ML-only feature reasons from columns for older sample files.
      const a = normalizeForSimilarity(r.candidateTitle ?? '');
      const b = normalizeForSimilarity(r.gameName ?? '');
      if (a && b) {
        if (!reasons.some((x) => x.startsWith('token jaccard '))) {
          reasons.push(`token jaccard ${tokenJaccard(a, b).toFixed(3)}`);
        }
        if (!reasons.some((x) => x.startsWith('char3 jaccard '))) {
          reasons.push(`char3 jaccard ${charNgramJaccard(a, b, 3).toFixed(3)}`);
        }
        if (!reasons.some((x) => x.startsWith('len ratio '))) {
          reasons.push(`len ratio ${lengthRatio(a, b).toFixed(3)}`);
        }
      }
      const seeders = maybeInt(r.seeders);
      const leechers = maybeInt(r.leechers);
      const grabs = maybeInt(r.grabs);
      if (seeders !== null && !reasons.some((x) => x.startsWith('seeders:'))) reasons.push(`seeders: ${seeders}`);
      if (leechers !== null && !reasons.some((x) => x.startsWith('leechers:'))) reasons.push(`leechers: ${leechers}`);
      if (grabs !== null && !reasons.some((x) => x.startsWith('grabs:'))) reasons.push(`grabs: ${grabs}`);

      const feats = extractFeatures(reasons, score);
      const prob = predictCombined(combined, feats);
      const mlPass = prob >= threshold;
      const triagePass = triageReject !== null ? prob >= triageReject : mlPass;

      // Baseline: current heuristic matcher decision already in the CSV.
      addOutcome(baseline, truthPos, matched);
      // Hybrid: what production does today (ML filter can only turn matches off).
      addOutcome(hybrid, truthPos, matched && mlPass);
      // ML only: ignore the heuristic matcher decision entirely.
      addOutcome(mlOnly, truthPos, mlPass);
      // Triage: use a looser reject threshold (keeps more candidates, but marks review-band in prod).
      addOutcome(triage, truthPos, matched && triagePass);
    }

    // eslint-disable-next-line no-console
    console.log(`File: ${filePath}  (n=${rows.length})`);
    printReport('baseline(matched)', baseline);
    printReport('hybrid(+ML)', hybrid);
    printReport('ml_only', mlOnly);
    if (triageReject !== null) {
      printReport(`triage(rej>=${triageReject.toFixed(2)})`, triage);
    }
    // eslint-disable-next-line no-console
    console.log('');

    totalBaseline.tp += baseline.tp;
    totalBaseline.fp += baseline.fp;
    totalBaseline.tn += baseline.tn;
    totalBaseline.fn += baseline.fn;

    totalHybrid.tp += hybrid.tp;
    totalHybrid.fp += hybrid.fp;
    totalHybrid.tn += hybrid.tn;
    totalHybrid.fn += hybrid.fn;

    totalMlOnly.tp += mlOnly.tp;
    totalMlOnly.fp += mlOnly.fp;
    totalMlOnly.tn += mlOnly.tn;
    totalMlOnly.fn += mlOnly.fn;

    totalTriage.tp += triage.tp;
    totalTriage.fp += triage.fp;
    totalTriage.tn += triage.tn;
    totalTriage.fn += triage.fn;
  }

  // eslint-disable-next-line no-console
  console.log('TOTAL (across evaluated files)');
  printReport('baseline(matched)', totalBaseline);
  printReport('hybrid(+ML)', totalHybrid);
  printReport('ml_only', totalMlOnly);
  if (process.env.MATCH_MODEL_REJECT_THRESHOLD) {
    const v = parseFloat(process.env.MATCH_MODEL_REJECT_THRESHOLD);
    if (Number.isFinite(v)) {
      printReport(`triage(rej>=${v.toFixed(2)})`, totalTriage);
    }
  }
}

main();
