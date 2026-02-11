import fs from 'fs';

import {
  extractFeatures,
  loadCombinedModel,
  resolveModelPath,
  predictCombined,
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

type EvalRow = {
  truthPos: boolean;
  matched: boolean;
  prob: number;
};

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: tsx sweep-match-model-threshold.ts <sample.csv> [...]\n' +
        'Requires CSV columns: matched, matchScore, reasons, label.\n'
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
  const minRecall = process.env.MIN_RECALL ? Number(process.env.MIN_RECALL) : 0.0;
  const minPrecision = process.env.MIN_PRECISION ? Number(process.env.MIN_PRECISION) : 0.0;

  const evalRows: EvalRow[] = [];
  for (const filePath of args) {
    if (!fs.existsSync(filePath)) continue;
    const rows = readCsvAsObjects(filePath);
    for (const r of rows) {
      const truthPos = (r.label ?? '').trim() === '1';
      const matched = toBool(r.matched);
      const score = toNumber(r.matchScore);
      const reasonsRaw = (r.reasons ?? '').trim();
      const reasons = reasonsRaw
        ? reasonsRaw.split('|').map((x) => x.trim()).filter(Boolean)
        : [];
      const feats = extractFeatures(reasons, score);
      const prob = predictCombined(combined, feats);
      evalRows.push({ truthPos, matched, prob });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Model: ${modelPath}`);
  // eslint-disable-next-line no-console
  console.log(
    `Type: ${combined.type}, ensembleWeight=${combined.ensembleWeight}, sweepStep=${step}, minRecall=${minRecall}`
  );
  // eslint-disable-next-line no-console
  console.log(`Rows: ${evalRows.length}`);
  // eslint-disable-next-line no-console
  console.log('');

  let bestHybridF1 = { thr: 0, ...metrics(initConfusion()) };
  let bestMlOnlyF1 = { thr: 0, ...metrics(initConfusion()) };
  let bestHybridPrecAtRecall = { thr: 0, ...metrics(initConfusion()) };
  let bestMlOnlyPrecAtRecall = { thr: 0, ...metrics(initConfusion()) };
  let bestHybridRecallAtPrecision = { thr: 0, ...metrics(initConfusion()) };
  let bestMlOnlyRecallAtPrecision = { thr: 0, ...metrics(initConfusion()) };

  for (let thr = 0; thr <= 1.000001; thr += step) {
    const hybrid = initConfusion();
    const mlOnly = initConfusion();

    for (const r of evalRows) {
      const mlPass = r.prob >= thr;
      addOutcome(hybrid, r.truthPos, r.matched && mlPass);
      addOutcome(mlOnly, r.truthPos, mlPass);
    }

    const mh = metrics(hybrid);
    const mm = metrics(mlOnly);

    if (mh.f1 > bestHybridF1.f1) bestHybridF1 = { thr, ...mh };
    if (mm.f1 > bestMlOnlyF1.f1) bestMlOnlyF1 = { thr, ...mm };

    if (mh.recall >= minRecall && mh.precision > bestHybridPrecAtRecall.precision) {
      bestHybridPrecAtRecall = { thr, ...mh };
    }
    if (mm.recall >= minRecall && mm.precision > bestMlOnlyPrecAtRecall.precision) {
      bestMlOnlyPrecAtRecall = { thr, ...mm };
    }

    if (mh.precision >= minPrecision && mh.recall > bestHybridRecallAtPrecision.recall) {
      bestHybridRecallAtPrecision = { thr, ...mh };
    }
    if (mm.precision >= minPrecision && mm.recall > bestMlOnlyRecallAtPrecision.recall) {
      bestMlOnlyRecallAtPrecision = { thr, ...mm };
    }
  }

  function printBest(label: string, r: { thr: number; precision: number; recall: number; f1: number }) {
    // eslint-disable-next-line no-console
    console.log(
      `${label.padEnd(24)} thr=${r.thr.toFixed(2)}  P=${fmtPct(r.precision)}  R=${fmtPct(r.recall)}  F1=${fmtPct(r.f1)}`
    );
  }

  // eslint-disable-next-line no-console
  console.log('Best by F1:');
  printBest('hybrid(+ML)', bestHybridF1);
  printBest('ml_only', bestMlOnlyF1);
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log(`Best precision with recall>=${fmtPct(minRecall)}:`);
  printBest('hybrid(+ML)', bestHybridPrecAtRecall);
  printBest('ml_only', bestMlOnlyPrecAtRecall);

  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log(`Best recall with precision>=${fmtPct(minPrecision)}:`);
  printBest('hybrid(+ML)', bestHybridRecallAtPrecision);
  printBest('ml_only', bestMlOnlyRecallAtPrecision);
}

main();
