/**
 * Backfill trust levels into the audit CSV.
 * Adds "source trust: X" to the reasons column based on the candidateSource.
 * Also adds a sourceTrustLevel column at the end.
 *
 * Usage: node dist/scripts/backfill-trust-levels.js [path-to-csv]
 */
import fs from 'fs';
import path from 'path';

function findSettingsFile(): string | null {
  let current = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    const candidate = path.join(current, 'data', 'settings.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

// Map source names to trust levels
function getTrustLevel(candidateSource: string, indexerName: string): string {
  const src = candidateSource.toLowerCase();

  // Direct site agents - known trusted/safe
  if (src.includes('fitgirl')) return 'trusted';
  if (src.includes('dodi')) return 'safe';
  if (src.includes('steamrip')) return 'safe';

  // Prowlarr - depends on indexer
  if (src.includes('prowlarr')) {
    const idx = indexerName.toLowerCase();
    // Trusted torrent indexers
    if (idx.includes('1337x')) return 'safe';
    if (idx.includes('rarbg')) return 'safe';
    if (idx.includes('rutor')) return 'safe';
    if (idx.includes('rutracker')) return 'safe';
    if (idx.includes('kat') || idx.includes('kickass')) return 'safe';
    // Less trusted / general
    if (idx.includes('tpb') || idx.includes('piratebay')) return 'unknown';
    if (idx.includes('torrentgalaxy')) return 'safe';
    if (idx.includes('lime')) return 'unknown';
    // Default for unknown Prowlarr indexers
    return 'unknown';
  }

  // Hydra sources - their trust level should already be set, but if not
  if (src.includes('hydra')) return 'unknown';

  return 'unknown';
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function run() {
  const csvArg = process.argv[2];
  let csvPath: string;

  if (csvArg) {
    csvPath = path.resolve(csvArg);
  } else {
    const settingsPath = findSettingsFile();
    if (!settingsPath) {
      console.error('Settings file not found, pass CSV path as argument');
      process.exit(1);
    }
    csvPath = path.join(path.dirname(settingsPath), 'audit-500.csv');
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());

  if (lines.length < 2) {
    console.error('CSV has no data rows');
    process.exit(1);
  }

  const headers = parseCsvLine(lines[0]);
  const reasonsIdx = headers.indexOf('reasons');
  const sourceIdx = headers.indexOf('candidateSource');
  const indexerIdx = headers.indexOf('indexerName');

  if (reasonsIdx === -1 || sourceIdx === -1) {
    console.error('CSV missing required columns (reasons, candidateSource)');
    process.exit(1);
  }

  // Add sourceTrustLevel column if not present
  const hasTrustCol = headers.includes('sourceTrustLevel');
  const outHeaders = hasTrustCol ? headers : [...headers, 'sourceTrustLevel'];

  const outLines: string[] = [outHeaders.map(csvEscape).join(',')];
  let backfilled = 0;
  let alreadyHad = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < headers.length) continue;

    const reasons = fields[reasonsIdx];
    const source = fields[sourceIdx];
    const indexer = indexerIdx !== -1 ? fields[indexerIdx] : '';

    // Check if already has trust reason
    if (reasons.includes('source trust:')) {
      alreadyHad++;
      if (!hasTrustCol) fields.push(getTrustLevel(source, indexer));
      outLines.push(fields.map(csvEscape).join(','));
      continue;
    }

    const trustLevel = getTrustLevel(source, indexer);
    const updatedReasons = reasons ? `${reasons}|source trust: ${trustLevel}` : `source trust: ${trustLevel}`;
    fields[reasonsIdx] = updatedReasons;

    if (!hasTrustCol) fields.push(trustLevel);
    else {
      const trustColIdx = headers.indexOf('sourceTrustLevel');
      if (trustColIdx !== -1) fields[trustColIdx] = trustLevel;
    }

    outLines.push(fields.map(csvEscape).join(','));
    backfilled++;
  }

  // Write output
  const outPath = csvPath.replace('.csv', '-trust.csv');
  fs.writeFileSync(outPath, outLines.join('\n') + '\n', 'utf-8');

  console.log(`Backfill complete:`);
  console.log(`  Input: ${csvPath}`);
  console.log(`  Output: ${outPath}`);
  console.log(`  Total rows: ${lines.length - 1}`);
  console.log(`  Backfilled: ${backfilled}`);
  console.log(`  Already had trust: ${alreadyHad}`);
}

run();
