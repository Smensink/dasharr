import fs from 'fs';

import {
  extractFeatures,
  loadCombinedModel,
  predictCombined,
  resolveModelPath,
} from '../utils/MatchModel';

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

function normalizeTrust(v: string | undefined): string {
  const s = (v ?? '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (s === 'trusted') return 'trusted';
  if (s === 'safe') return 'safe';
  if (s === 'abandoned') return 'abandoned';
  if (s === 'unsafe') return 'unsafe';
  if (s === 'nsfw') return 'nsfw';
  return 'unknown';
}

type EvalRow = {
  truthPos: boolean;
  matched: boolean;
  prob: number;
  trust: string;
};

type Confusion = { tp: number; fp: number; tn: number; fn: number };

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
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

function fmtPct(x: number): string {
  return (x * 100).toFixed(1) + '%';
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: tsx sweep-match-model-threshold-by-trust.ts <sample.csv> [...]\n' +
        'Requires CSV columns: matched, matchScore, reasons, label, sourceTrustLevel (optional).\n'
    );
    process.exit(2);
  }

  const modelPath = resolveModelPath(process.env.MATCH_MODEL_PATH);
  const combined = loadCombinedModel(modelPath);
  if (!combined) {
    // eslint-disable-next-line no-console
    console.error(`No combined model found at ${modelPath}`);
    process.exit(2);
  }

  const step = process.env.SWEEP_STEP ? Number(process.env.SWEEP_STEP) : 0.01;
  const minPrecision = process.env.MIN_PRECISION ? Number(process.env.MIN_PRECISION) : 0.95;

  const evalRows: EvalRow[] = [];
  for (const filePath of args) {
    if (!fs.existsSync(filePath)) continue;
    const rows = readCsvAsObjects(filePath);
    for (const r of rows) {
      const truthPos = (r.label ?? '').trim() === '1';
      const matched = toBool(r.matched);
      const score = toNumber(r.matchScore);
      const trust = normalizeTrust(r.sourceTrustLevel);
      const reasonsRaw = (r.reasons ?? '').trim();
      const reasons = reasonsRaw
        ? reasonsRaw.split('|').map((x) => x.trim()).filter(Boolean)
        : [];
      const feats = extractFeatures(reasons, score);
      const prob = predictCombined(combined, feats);
      evalRows.push({ truthPos, matched, prob, trust });
    }
  }

  const trusts = Array.from(new Set(evalRows.map((r) => r.trust))).sort();

  // eslint-disable-next-line no-console
  console.log(`Model: ${modelPath}`);
  // eslint-disable-next-line no-console
  console.log(
    `Type: ${combined.type}, ensembleWeight=${combined.ensembleWeight}, sweepStep=${step}, minPrecision=${fmtPct(minPrecision)}`
  );
  // eslint-disable-next-line no-console
  console.log(`Rows: ${evalRows.length}`);
  // eslint-disable-next-line no-console
  console.log('');

  type Best = { thr: number; precision: number; recall: number; f1: number; accepted: number };

  const bestOverall: Best = { thr: 0, precision: 0, recall: 0, f1: 0, accepted: 0 };
  const bestByTrust = new Map<string, Best>();

  const findBest = (rows: EvalRow[]): Best => {
    let best: Best = { thr: 0, precision: 0, recall: 0, f1: 0, accepted: 0 };
    for (let thr = 0; thr <= 1.000001; thr += step) {
      const c = initConfusion();
      let accepted = 0;
      for (const r of rows) {
        const pred = r.matched && r.prob >= thr;
        if (pred) accepted++;
        addOutcome(c, r.truthPos, pred);
      }
      const m = metrics(c);
      if (m.precision >= minPrecision) {
        // Primary objective: maximize recall, secondary: maximize precision, then F1.
        if (
          m.recall > best.recall ||
          (m.recall === best.recall && m.precision > best.precision) ||
          (m.recall === best.recall && m.precision === best.precision && m.f1 > best.f1)
        ) {
          best = { thr, ...m, accepted };
        }
      }
    }
    return best;
  };

  bestByTrust.set('OVERALL', findBest(evalRows));
  for (const t of trusts) {
    bestByTrust.set(t, findBest(evalRows.filter((r) => r.trust === t)));
  }

  const rowsOut: Array<{ trust: string; best: Best; total: number; pos: number; neg: number }> = [];
  for (const [trust, best] of bestByTrust.entries()) {
    const subset = trust === 'OVERALL' ? evalRows : evalRows.filter((r) => r.trust === trust);
    const total = subset.length;
    const pos = subset.filter((r) => r.truthPos).length;
    const neg = total - pos;
    rowsOut.push({ trust, best, total, pos, neg });
  }

  rowsOut.sort((a, b) => (a.trust === 'OVERALL' ? -1 : b.trust === 'OVERALL' ? 1 : a.trust.localeCompare(b.trust)));

  // eslint-disable-next-line no-console
  console.log('Best ACCEPT threshold per trust (pred = matched && mlProb >= thr):');
  // eslint-disable-next-line no-console
  console.log('trust'.padEnd(10), 'thr'.padEnd(6), 'P'.padEnd(8), 'R'.padEnd(8), 'F1'.padEnd(8), 'accepted'.padEnd(10), 'pos/total');
  // eslint-disable-next-line no-console
  console.log('-'.repeat(70));
  for (const r of rowsOut) {
    const b = r.best;
    const hasAny = b.precision > 0 || b.recall > 0 || b.accepted > 0;
    const thrStr = hasAny ? b.thr.toFixed(2) : 'n/a';
    const pStr = hasAny ? fmtPct(b.precision) : 'n/a';
    const recStr = hasAny ? fmtPct(b.recall) : 'n/a';
    const f1Str = hasAny ? fmtPct(b.f1) : 'n/a';
    // eslint-disable-next-line no-console
    console.log(
      r.trust.padEnd(10),
      thrStr.padEnd(6),
      pStr.padEnd(8),
      recStr.padEnd(8),
      f1Str.padEnd(8),
      String(b.accepted).padEnd(10),
      `${r.pos}/${r.total}`
    );
  }
}

main();

