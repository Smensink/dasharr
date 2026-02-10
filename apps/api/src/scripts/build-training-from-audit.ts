import fs from 'fs';
import path from 'path';

/**
 * Build Training Data from Audit Results
 *
 * Converts the matching-audit.json (or single-word-matching-audit.json) output
 * into the CSV format used by train-match-model.ts, giving us multi-agent
 * training data (FitGirl, SteamRip, DODI, Prowlarr) in addition to the
 * existing Hydra-only data.
 *
 * Usage:
 *   node build-training-from-audit.js [--audit=<path>] [--output=<path>] [--auto-label]
 *
 * Flags:
 *   --audit=<path>    Path to audit JSON (default: data/matching-audit.json)
 *   --output=<path>   Path for output CSV (default: scripts/audit-training-review.csv)
 *   --auto-label      Apply heuristic auto-labels for obvious cases
 *   --merge=<path>    Merge with existing labeled CSV to avoid duplicates
 */

type AuditMatch = {
  title: string;
  score: number;
  reasons: string[];
};

type AgentAudit = {
  best: AuditMatch | null;
  matches: AuditMatch[];
  skipped?: boolean;
  totalResults?: number;
};

type AuditGame = {
  igdbId: number;
  name: string;
  platforms: string[];
  agents: Record<string, AgentAudit>;
};

type AuditOutput = {
  generatedAt: string;
  criteria: string;
  games: AuditGame[];
  falsePositives: Array<{
    agent: string;
    game: string;
    title: string;
    score: number;
    reasons: string[];
  }>;
  falseNegatives: Array<{
    agent: string;
    game: string;
    title: string;
    score: number;
    reasons: string[];
  }>;
};

type CsvRow = {
  gameId: number;
  gameName: string;
  candidateTitle: string;
  candidateSource: string;
  matchScore: number;
  matched: boolean;
  reasons: string;
  type: 'top_candidate' | 'broad_candidate';
  reviewFlag: string;
  label: '' | '1' | '0';
};

const AGENT_NAME_MAP: Record<string, string> = {
  fitgirl: 'FitGirl',
  steamrip: 'SteamRIP',
  dodi: 'DODI',
  prowlarr: 'Prowlarr',
};

// High-confidence auto-labeling heuristics
const OBVIOUS_NEGATIVE_REASONS = new Set([
  'different sequel number',
  'title is numbered sequel',
  'non-game media',
  'language pack',
  'crack/fix only',
  'update/patch only',
  'DLC/expansion only',
  'mod/fan content',
  'demo/alpha/beta',
]);

const OBVIOUS_POSITIVE_INDICATORS = new Set([
  'exact name match',
  'exact phrase in title',
]);

function resolveDataPath(...segments: string[]): string {
  let current = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(current, 'data', ...segments);
    if (fs.existsSync(path.dirname(candidate))) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve('data', ...segments);
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  const str = `${value ?? ''}`;
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsv(filePath: string, rows: CsvRow[]): void {
  const header = [
    'gameId', 'gameName', 'candidateTitle', 'candidateSource',
    'matchScore', 'matched', 'reasons', 'type', 'reviewFlag', 'label',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      csvEscape(row.gameId),
      csvEscape(row.gameName),
      csvEscape(row.candidateTitle),
      csvEscape(row.candidateSource),
      csvEscape(row.matchScore),
      csvEscape(row.matched),
      csvEscape(row.reasons),
      csvEscape(row.type),
      csvEscape(row.reviewFlag),
      csvEscape(row.label),
    ].join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
}

function loadExistingKeys(csvPath: string): Set<string> {
  const keys = new Set<string>();
  if (!fs.existsSync(csvPath)) return keys;

  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  if (!header) return keys;

  const cols = parseCsvLine(header);
  const gameIdIdx = cols.indexOf('gameId');
  const titleIdx = cols.indexOf('candidateTitle');
  const sourceIdx = cols.indexOf('candidateSource');

  for (const line of lines) {
    const fields = parseCsvLine(line);
    const key = `${fields[gameIdIdx]}|${fields[titleIdx]}|${fields[sourceIdx]}`;
    keys.add(key);
  }
  return keys;
}

function autoLabel(
  match: AuditMatch,
  gameName: string,
  agentName: string
): '' | '1' | '0' {
  const reasons = match.reasons;

  // Obvious negatives: contains clear disqualifiers
  if (reasons.some((r) => OBVIOUS_NEGATIVE_REASONS.has(r))) {
    return '0';
  }

  // High score + exact match indicators = likely positive
  const hasExactMatch = reasons.some((r) => OBVIOUS_POSITIVE_INDICATORS.has(r));
  if (hasExactMatch && match.score >= 100) {
    return '1';
  }

  // Very low scores are likely negative
  if (match.score < 30) {
    return '0';
  }

  // Everything else needs human review
  return '';
}

function classifyReviewFlag(
  match: AuditMatch,
  gameName: string
): string {
  const reasons = match.reasons;

  if (reasons.some((r) => OBVIOUS_NEGATIVE_REASONS.has(r)) && match.score >= 70) {
    return 'likely_fp';
  }

  // Title contains game name but score is low — possible false negative
  const normalizedTitle = match.title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const normalizedGame = gameName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  if (normalizedTitle.includes(normalizedGame) && match.score < 70) {
    return 'likely_fn';
  }

  return '';
}

function main(): void {
  const args = process.argv.slice(2);
  const getArg = (prefix: string): string | undefined => {
    const found = args.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
  };

  const doAutoLabel = args.includes('--auto-label');
  const auditPath = getArg('--audit=') || resolveDataPath('matching-audit.json');
  const outputPath = getArg('--output=') || path.resolve(
    __dirname, '..', '..', '..', '..', 'apps', 'api', 'src', 'scripts', 'audit-training-review.csv'
  );
  const mergePath = getArg('--merge=');

  // Try fallback paths
  let actualAuditPath = auditPath;
  if (!fs.existsSync(actualAuditPath)) {
    const alt = resolveDataPath('single-word-matching-audit.json');
    if (fs.existsSync(alt)) {
      actualAuditPath = alt;
      console.log(`Audit file not found at ${auditPath}, using ${alt}`);
    } else {
      console.error(`Audit file not found: ${auditPath}`);
      process.exit(1);
    }
  }

  console.log(`Reading audit data from: ${actualAuditPath}`);
  const audit: AuditOutput = JSON.parse(fs.readFileSync(actualAuditPath, 'utf-8'));

  // Load existing keys to avoid duplicates
  const existingKeys = mergePath ? loadExistingKeys(mergePath) : new Set<string>();
  if (existingKeys.size > 0) {
    console.log(`Loaded ${existingKeys.size} existing entries from ${mergePath}`);
  }

  const rows: CsvRow[] = [];
  let skippedDupes = 0;
  let autoLabeled = 0;
  let needsReview = 0;

  for (const game of audit.games) {
    for (const [agentKey, agentData] of Object.entries(game.agents)) {
      if (agentData.skipped) continue;

      const agentName = AGENT_NAME_MAP[agentKey] || agentKey;
      const matches = agentData.matches || [];

      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const dedupeKey = `${game.igdbId}|${match.title}|${agentName}`;

        if (existingKeys.has(dedupeKey)) {
          skippedDupes++;
          continue;
        }

        const isTop = i === 0 && agentData.best?.title === match.title;
        const reviewFlag = classifyReviewFlag(match, game.name);
        const label = doAutoLabel ? autoLabel(match, game.name, agentName) : '';

        if (label) autoLabeled++;
        else needsReview++;

        rows.push({
          gameId: game.igdbId,
          gameName: game.name,
          candidateTitle: match.title,
          candidateSource: agentName,
          matchScore: match.score,
          matched: match.score >= 70,
          reasons: match.reasons.join('|'),
          type: isTop ? 'top_candidate' : 'broad_candidate',
          reviewFlag,
          label,
        });
      }
    }
  }

  // Also add false positive/negative flags from the audit
  const fpTitles = new Set(audit.falsePositives.map((fp) => `${fp.game}|${fp.title}|${fp.agent}`));
  const fnTitles = new Set(audit.falseNegatives.map((fn) => `${fn.game}|${fn.title}|${fn.agent}`));

  for (const row of rows) {
    const key = `${row.gameName}|${row.candidateTitle}|${row.candidateSource}`;
    if (fpTitles.has(key) && !row.reviewFlag) {
      row.reviewFlag = 'likely_fp';
    }
    if (fnTitles.has(key) && !row.reviewFlag) {
      row.reviewFlag = 'likely_fn';
    }
  }

  writeCsv(outputPath, rows);

  console.log(`\nTraining data generation complete:`);
  console.log(`  Total rows: ${rows.length}`);
  console.log(`  Skipped duplicates: ${skippedDupes}`);
  if (doAutoLabel) {
    console.log(`  Auto-labeled: ${autoLabeled}`);
    console.log(`  Needs human review: ${needsReview}`);
  }
  console.log(`  Games covered: ${audit.games.length}`);
  console.log(`  Agents: ${Object.keys(AGENT_NAME_MAP).join(', ')}`);
  console.log(`\nWrote: ${outputPath}`);

  // Print summary stats
  const byAgent: Record<string, { total: number; matched: number }> = {};
  for (const row of rows) {
    if (!byAgent[row.candidateSource]) {
      byAgent[row.candidateSource] = { total: 0, matched: 0 };
    }
    byAgent[row.candidateSource].total++;
    if (row.matched) byAgent[row.candidateSource].matched++;
  }

  console.log(`\nPer-agent breakdown:`);
  for (const [agent, stats] of Object.entries(byAgent)) {
    const matchRate = ((stats.matched / stats.total) * 100).toFixed(1);
    console.log(`  ${agent}: ${stats.total} rows, ${stats.matched} matched (${matchRate}%)`);
  }

  const labelDist = { positive: 0, negative: 0, unlabeled: 0 };
  for (const row of rows) {
    if (row.label === '1') labelDist.positive++;
    else if (row.label === '0') labelDist.negative++;
    else labelDist.unlabeled++;
  }
  if (doAutoLabel) {
    console.log(`\nLabel distribution:`);
    console.log(`  Positive (1): ${labelDist.positive}`);
    console.log(`  Negative (0): ${labelDist.negative}`);
    console.log(`  Unlabeled: ${labelDist.unlabeled}`);
  }
}

main();
