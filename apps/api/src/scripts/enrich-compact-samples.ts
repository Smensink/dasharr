import fs from 'fs';

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

function readCsvAsObjects(filePath: string): { header: string[]; rows: Row[] } {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(raw);
  if (rows.length < 2) return { header: [], rows: [] };

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

  return { header, rows: out };
}

function escapeCsvField(v: string): string {
  if (v.includes('"') || v.includes(',') || v.includes('\n') || v.includes('\r')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function writeCsv(filePath: string, header: string[], rows: Row[]): void {
  const lines: string[] = [];
  lines.push(header.map(escapeCsvField).join(','));
  for (const r of rows) {
    lines.push(header.map((h) => escapeCsvField(r[h] ?? '')).join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

function normalizeKeyPart(s: string): string {
  let out = (s ?? '').trim();
  out = out.replace(/\u00a0/g, ' ');
  out = out
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  out = out.replace(/\s+/g, ' ');
  return out;
}

function makeKey(gameName: string, candidateTitle: string): string {
  return `${normalizeKeyPart(gameName)}\u0000${normalizeKeyPart(candidateTitle)}`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    // eslint-disable-next-line no-console
    console.error('Usage: tsx enrich-compact-samples.ts <compact-sample.csv> [...]\n');
    process.exit(2);
  }

  const trainingCsv = process.env.TRAINING_CSV ?? '/tmp/autolabeled-training.csv';
  if (!fs.existsSync(trainingCsv)) {
    // eslint-disable-next-line no-console
    console.error(`Training CSV not found: ${trainingCsv}`);
    process.exit(2);
  }

  // eslint-disable-next-line no-console
  console.log(`Training CSV: ${trainingCsv}`);
  // eslint-disable-next-line no-console
  console.log('Indexing training rows by (gameName, candidateTitle)...');

  const { rows: trainingRows } = readCsvAsObjects(trainingCsv);
  const index = new Map<string, Row>();

  for (const r of trainingRows) {
    const gameName = r.gameName ?? '';
    const candidateTitle = r.candidateTitle ?? '';
    if (!gameName || !candidateTitle) continue;
    const key = makeKey(gameName, candidateTitle);
    if (!index.has(key)) index.set(key, r);
  }

  // eslint-disable-next-line no-console
  console.log(`Indexed ${index.size} unique (gameName,candidateTitle) pairs.`);
  // eslint-disable-next-line no-console
  console.log('');

  // Keep required fields for evaluation, but include extra audit context when available.
  const outHeader = [
    'gameName',
    'candidateTitle',
    'candidateSource',
    'indexerName',
    'matchScore',
    'matched',
    'reasons',
    'label',
    'sourceTrustLevel',
    'seeders',
    'leechers',
    'uploader',
    'publishDate',
    'size',
    'sizeBytes',
    'releaseType',
    'type',
  ];

  for (const filePath of args) {
    if (!fs.existsSync(filePath)) {
      // eslint-disable-next-line no-console
      console.log(`Missing: ${filePath}`);
      continue;
    }

    const { header, rows } = readCsvAsObjects(filePath);
    const hasReasons = header.includes('reasons');
    const hasMatchScore = header.includes('matchScore');
    const hasCompactScore = header.includes('score');
    const isCompact = !hasReasons && !hasMatchScore && hasCompactScore;

    if (!isCompact) {
      // eslint-disable-next-line no-console
      console.log(`Skip (not compact): ${filePath}`);
      continue;
    }

    let hits = 0;
    let misses = 0;

    const outRows: Row[] = [];
    for (const r of rows) {
      const gameName = r.gameName ?? '';
      const candidateTitle = r.candidateTitle ?? '';
      const label = (r.label ?? '').trim();
      const matched = (r.matched ?? '').trim();
      const key = makeKey(gameName, candidateTitle);
      const t = index.get(key);

      if (!t) {
        misses++;
        outRows.push({
          gameName,
          candidateTitle,
          candidateSource: r.candidateSource ?? r.source ?? '',
          indexerName: r.indexerName ?? '',
          matchScore: (r.score ?? '').trim(),
          matched,
          reasons: '',
          label,
          sourceTrustLevel: '',
          seeders: '',
          leechers: '',
          uploader: '',
          publishDate: '',
          size: r.size ?? '',
          sizeBytes: '',
          releaseType: '',
          type: '',
        });
        continue;
      }

      hits++;
      outRows.push({
        gameName: t.gameName ?? gameName,
        candidateTitle: t.candidateTitle ?? candidateTitle,
        candidateSource: t.candidateSource ?? '',
        indexerName: t.indexerName ?? '',
        matchScore: (t.matchScore ?? '').trim(),
        matched,
        reasons: t.reasons ?? '',
        label,
        sourceTrustLevel: t.sourceTrustLevel ?? '',
        seeders: t.seeders ?? '',
        leechers: t.leechers ?? '',
        uploader: t.uploader ?? '',
        publishDate: t.publishDate ?? '',
        size: t.size ?? '',
        sizeBytes: t.sizeBytes ?? '',
        releaseType: t.releaseType ?? '',
        type: t.type ?? '',
      });
    }

    const outPath = filePath.replace(/\.csv$/i, '-full.csv');
    writeCsv(outPath, outHeader, outRows);

    // eslint-disable-next-line no-console
    console.log(`Wrote: ${outPath}`);
    // eslint-disable-next-line no-console
    console.log(`  rows=${outRows.length}, hits=${hits}, misses=${misses}`);
  }
}

main();
