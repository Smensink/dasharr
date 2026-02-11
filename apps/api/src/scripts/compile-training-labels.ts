/**
 * Compile Training Labels
 *
 * Merges auto-labels with manual review corrections from the smart-review process.
 * Key fixes applied:
 *   1. Version numbers (v1.0, v2.5, etc.) no longer trigger sequel mismatch
 *   2. Edition/remaster suffixes treated as same game (Deluxe, GOTY, Complete, etc.)
 *   3. exe.rar + tiny size flagged as malware (label 0)
 *   4. Improved sequel detection — only actual sequel NUMBERS trigger mismatch
 *   5. Review bucket rows labeled via improved heuristics based on human review
 *   6. IGDB franchise/collection data catches named sequels, word-order variants
 *
 * Usage: npx ts-node src/scripts/compile-training-labels.ts [path-to-autolabeled-csv]
 */
import fs from 'fs';
import path from 'path';
import {
  normalizeUnicode,
  normalizeName,
  stripFileExtensions,
  stripVersionStrings,
  stripEditionSuffix,
  extractSequelInfo,
  isNonGameContent,
  isUpdateOnlyRelease,
  isDlcOnlyRelease,
  isMalwarePattern,
  isSameGameVariant,
  isDifferentSequel,
  allWordsPresentIsSafe,
} from '../utils/TitleNormalizer';

// ── IGDB franchise data types ─────────────────────────────────────────

interface GameFranchiseData {
  id: number;
  name: string;
  franchiseSiblings: string[];
  collectionSiblings: string[];
  alternativeNames: string[];
  expansionNames: string[];
  allSiblingNames: string[];
}

/**
 * Pre-processed franchise data for a game, with sibling names filtered
 * to only genuinely different games (not just editions of the target).
 */
interface ProcessedFranchiseData {
  /** Normalized names of different games in the same franchise */
  differentGameNames: string[];
  /** Normalized alternative names for THIS game (positive match signal) */
  altNames: string[];
}

// ── CSV helpers ──────────────────────────────────────────────────────

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

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

// ── Improved labeling logic ──────────────────────────────────────────
// Core heuristic functions are imported from TitleNormalizer.ts

// ── IGDB franchise integration ────────────────────────────────────────

/** Global franchise cache: gameId → ProcessedFranchiseData */
let franchiseCache: Map<number, ProcessedFranchiseData> = new Map();

/**
 * Load and pre-process the IGDB franchise cache.
 * Filters siblings to only genuinely different games (not editions of the target).
 */
function loadFranchiseCache(cachePath: string): void {
  if (!fs.existsSync(cachePath)) {
    console.log(`No IGDB franchise cache found at ${cachePath}, skipping franchise checks`);
    return;
  }

  const raw: Record<string, GameFranchiseData> = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

  for (const [gameIdStr, data] of Object.entries(raw)) {
    const gameId = parseInt(gameIdStr, 10);
    const targetBase = normalizeName(stripEditionSuffix(stripVersionStrings(data.name)));

    // Build a set of expansion/DLC names for the target game (these are NOT different games)
    const expansionNamesNorm = new Set(
      data.expansionNames.map(n => normalizeName(stripEditionSuffix(stripVersionStrings(n))))
    );

    // Filter siblings to genuinely different games
    const differentGameNames: string[] = [];
    for (const siblingName of data.allSiblingNames) {
      const sibBase = normalizeName(stripEditionSuffix(stripVersionStrings(siblingName)));

      // Skip if it's just an edition of the target game
      if (sibBase === targetBase) continue;

      // Skip if it's an expansion/DLC of the target game
      // (repacks often bundle DLC with the base game → should be label=1)
      if (expansionNamesNorm.has(sibBase)) continue;

      // Skip edition variants of the target
      if (sibBase.startsWith(targetBase + ' ')) {
        const extra = sibBase.slice(targetBase.length).trim();
        // Skip if the extra part is just edition/metadata words
        if (/^(digital|deluxe|ultimate|premium|gold|platinum|diamond|collector|limited|standard|special|anniversary|bonus|complete|definitive|goty|game of the year)/i.test(extra)) continue;
      }

      // Skip if it starts with target name and the target game has this as an expansion
      // (some expansions aren't in expansionNames but start with the game name + DLC subtitle)
      if (sibBase.startsWith(targetBase + ' ')) {
        const sibNorm = normalizeName(siblingName);
        // Check if any expansion name contains or matches this sibling
        let isExpansionVariant = false;
        for (const expNorm of expansionNamesNorm) {
          if (sibNorm.includes(expNorm) || expNorm.includes(sibNorm)) {
            isExpansionVariant = true;
            break;
          }
        }
        if (isExpansionVariant) continue;
      }

      // This is a genuinely different game in the franchise
      differentGameNames.push(sibBase);
    }

    // Process alternative names for THIS game
    const altNames = data.alternativeNames
      .map(n => normalizeName(n))
      .filter(n => n.length > 2 && !n.includes('.exe')); // Skip exe names

    franchiseCache.set(gameId, { differentGameNames, altNames });
  }

  console.log(`Loaded IGDB franchise data for ${franchiseCache.size} games`);
  const withDiffGames = [...franchiseCache.values()].filter(d => d.differentGameNames.length > 0).length;
  console.log(`  ${withDiffGames} games have franchise siblings that are different games`);
}

/**
 * Check if a candidate title matches a DIFFERENT game in the same franchise.
 * This catches named sequels like "Dreamfall: The Longest Journey" when
 * searching for "The Longest Journey".
 */
function matchesDifferentFranchiseGame(
  gameId: number,
  gameName: string,
  candidateTitle: string,
): string | null {
  const data = franchiseCache.get(gameId);
  if (!data || data.differentGameNames.length === 0) return null;

  const candidateNorm = normalizeName(stripEditionSuffix(stripVersionStrings(stripFileExtensions(candidateTitle))));
  const gameNorm = normalizeName(stripEditionSuffix(stripVersionStrings(gameName)));

  for (const siblingName of data.differentGameNames) {
    // Skip siblings that are shorter than the game name — they can't be more specific
    if (siblingName.length <= gameNorm.length) continue;

    // For siblings starting with the target game name: only include if they're genuinely
    // different games (not just editions/DLC). After edition stripping, if the sibling
    // still has extra content, it's likely a different game (Silksong, Extraction, Ascension).
    if (siblingName.startsWith(gameNorm + ' ') || siblingName.startsWith(gameNorm)) {
      // After edition stripping, check if sibling reduces to the game name
      const sibStripped = normalizeName(stripEditionSuffix(siblingName));
      if (sibStripped === gameNorm || sibStripped.length <= gameNorm.length + 2) continue;
      // isDifferentSequel already handles numbered sequels, so skip those too
      // to avoid double-counting
    }

    // Check if the sibling name appears in the candidate
    if (candidateNorm.includes(siblingName)) {
      return siblingName;
    }
  }

  return null;
}

/**
 * Check if a candidate title matches an alternative name for the game.
 * Positive signal for label=1.
 */
function matchesAlternativeName(gameId: number, candidateTitle: string): boolean {
  const data = franchiseCache.get(gameId);
  if (!data || data.altNames.length === 0) return false;

  const candidateNorm = normalizeName(stripFileExtensions(candidateTitle));
  for (const altName of data.altNames) {
    if (altName.length < 4) continue; // Skip very short alt names (abbreviations)
    if (candidateNorm.includes(altName)) return true;
  }
  return false;
}

/**
 * Label a single row with improved heuristics.
 */
function labelRow(row: {
  gameId: number;
  gameName: string;
  gameReleaseStatus: string;
  candidateTitle: string;
  candidateSource: string;
  matchScore: number;
  matched: boolean;
  reasons: string;
  sizeBytes: number;
  seeders: number;
  sourceTrustLevel: string;
  autoLabel: string;
  autoReason: string;
  reviewBucket: string;
}): { label: string; reason: string } {
  const {
    gameId, gameName, gameReleaseStatus, candidateTitle, candidateSource,
    matchScore, matched, reasons, sizeBytes, sourceTrustLevel,
    autoLabel, autoReason, reviewBucket,
  } = row;

  // ── Malware detection (highest priority) ──
  if (isMalwarePattern(candidateTitle, sizeBytes)) {
    return { label: '0', reason: 'malware pattern (exe.rar or tiny file)' };
  }

  // ── Non-game content (soundtracks, trailers, trainers, artbooks) ──
  if (isNonGameContent(candidateTitle)) {
    return { label: '0', reason: 'non-game content (soundtrack/trailer/trainer/artbook)' };
  }

  // ── Update/patch-only releases ──
  if (isUpdateOnlyRelease(candidateTitle)) {
    // Exception: very large files (>5 GB) labeled as "Update" are full game rips
    // (e.g., "Wolfenstein II Update 10 Steam Rip [nemos]" at 60 GB)
    if (sizeBytes > 5_000_000_000) {
      // Don't reject — likely a full game that mentions which update is included
    } else {
      return { label: '0', reason: 'update/patch only release' };
    }
  }

  // ── DLC-only releases ──
  if (isDlcOnlyRelease(gameName, candidateTitle)) {
    return { label: '0', reason: 'DLC-only release (not base game)' };
  }

  // ── Unreleased games ──
  if (gameReleaseStatus !== 'released' && matched) {
    return { label: '0', reason: 'unreleased game with match (likely fake)' };
  }

  // ── Score 0 = no match at all ──
  if (matchScore === 0) {
    return { label: '0', reason: 'score 0 (no match)' };
  }

  // Pre-compute cleaned title (scene groups stripped) for word-presence checks
  // This prevents scene group names from matching game words (e.g. DARKSiDERS ≠ Darksiders)
  const titleCleaned = normalizeName(extractSequelInfo(candidateTitle).baseName);

  // ── Same game variant check (before sequel/franchise to avoid false rejections) ──
  const isSameGame = isSameGameVariant(gameName, candidateTitle);

  // ── Sequel mismatch check (improved: version numbers excluded) ──
  // Skip if name analysis already confirmed same game (e.g. SOTFS is same as DS2)
  if (!isSameGame) {
    const isSequel = isDifferentSequel(gameName, candidateTitle);
    if (isSequel) {
      return { label: '0', reason: 'different sequel detected' };
    }

    // ── IGDB franchise check: catch named sequels that don't follow number patterns ──
    const franchiseMatch = matchesDifferentFranchiseGame(gameId, gameName, candidateTitle);
    if (franchiseMatch) {
      return { label: '0', reason: `IGDB: matches different franchise game "${franchiseMatch}"` };
    }
  }

  // ── IGDB alternative name match (positive signal) ──
  const isAltName = matchesAlternativeName(gameId, candidateTitle);

  // ── Auto-labeled rows: fix version number issue ──
  if (!reviewBucket && autoLabel !== '') {
    // Fix: "sequel mismatch but matched" where it was a version number
    if (autoLabel === '0' && autoReason === 'sequel mismatch but matched') {
      if (isSameGame) {
        return { label: '1', reason: 'fixed: version number not sequel (was auto-label 0)' };
      }
      // If our improved isDifferentSequel says no actual sequel mismatch, re-evaluate
      // Require high score (>=85) to override — lower scores with messy titles can be false
      const isSequel = isDifferentSequel(gameName, candidateTitle);
      if (!isSequel && matched && matchScore >= 85) {
        // Original auto-labeler thought sequel mismatch, but improved logic disagrees
        // and the title matched with high score — likely a version number issue
        return { label: '1', reason: 'fixed: version number not sequel (was auto-label 0)' };
      }
      // Keep as 0 — it really is a sequel mismatch
      return { label: '0', reason: 'confirmed sequel mismatch' };
    }

    // Fix: "too many unrelated words" for valid matches with release metadata
    if (autoLabel === '0' && autoReason === 'too many unrelated words' && matched) {
      if (isSameGame && matchScore >= 50) {
        return { label: '1', reason: 'fixed: extra words are release metadata (was auto-label 0)' };
      }
    }

    // Fix: "published >6mo before game release" for early access games
    // If the candidate is an exact or near-exact match with high score, it's likely legitimate
    // (e.g., Hades II was in early access for over a year before official "release" date)
    if (autoLabel === '0' && autoReason === 'published >6mo before game release') {
      if (isSameGame && matchScore >= 80) {
        return { label: '1', reason: 'fixed: early access release (was auto-label 0)' };
      }
    }

    // Keep other auto-labels as-is
    return { label: autoLabel, reason: `auto: ${autoReason}` };
  }

  // ── Review bucket rows ──

  // High score + trusted source + same game → almost certainly correct
  if (isSameGame && matchScore >= 80 && (sourceTrustLevel === 'trusted' || sourceTrustLevel === 'safe')) {
    return { label: '1', reason: 'high score + trusted + same game' };
  }

  // Same game variant from any source with good score
  if (isSameGame && matchScore >= 50) {
    return { label: '1', reason: 'same game variant with decent score' };
  }

  // Matched + high score from any source
  if (matched && matchScore >= 85) {
    // Check if title reasonably contains the game name — with short-name protection
    // Strip scene groups first to avoid false positives (e.g. "DARKSiDERS" scene group matching "Darksiders" game)
    const gameLower = gameName.toLowerCase();
    const titleClean = normalizeName(extractSequelInfo(candidateTitle).baseName);
    const titleLower = titleClean;
    if (titleLower.includes(normalizeName(gameName)) && allWordsPresentIsSafe(gameName, candidateTitle)) {
      return { label: '1', reason: 'matched + high score + title contains game name' };
    }
    // "All words present" check — but protect short game names
    if (gameLower.split(' ').every(w => titleLower.includes(w))) {
      if (allWordsPresentIsSafe(gameName, candidateTitle)) {
        return { label: '1', reason: 'matched + high score + title contains game name' };
      }
    }
  }

  // Close miss bucket: matched=false but decent score
  if (reviewBucket === 'close_miss') {
    if (isSameGame) {
      return { label: '1', reason: 'close miss but actually same game variant' };
    }
    if (isAltName && matchScore >= 30) {
      return { label: '1', reason: 'close miss but matches IGDB alternative name' };
    }
    return { label: '0', reason: 'close miss, not same game' };
  }

  // Trusted rejected: high-trust source but rejected
  if (reviewBucket === 'trusted_rejected') {
    if (isSameGame) {
      return { label: '1', reason: 'trusted source + same game (false negative)' };
    }
    return { label: '0', reason: 'trusted source but wrong game' };
  }

  // Extra words match: most are valid, just have release metadata
  if (reviewBucket === 'extra_words_match') {
    if (isSameGame) {
      return { label: '1', reason: 'extra words are release metadata' };
    }
    // Check if all main words from game name appear in candidate
    const gameWords = gameName.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    const titleCleanLower = normalizeName(extractSequelInfo(candidateTitle).baseName);
    const allPresent = gameWords.every(w => titleCleanLower.includes(w));
    if (allPresent && matchScore >= 50 && allWordsPresentIsSafe(gameName, candidateTitle)) {
      return { label: '1', reason: 'all game words present + good score' };
    }
    return { label: '0', reason: 'extra words, missing game identity' };
  }

  // Low confidence match
  if (reviewBucket === 'low_confidence_match') {
    if (isSameGame) {
      return { label: '1', reason: 'low confidence but same game' };
    }
    // Very low scores with unmatched game identity = false positive
    if (matchScore < 50) {
      return { label: '0', reason: 'low score + not same game' };
    }
    // Check game name words — with short-name protection
    const gameWords = gameName.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    const titleCleanLower = normalizeName(extractSequelInfo(candidateTitle).baseName);
    const allPresent = gameWords.every(w => titleCleanLower.includes(w));
    if (allPresent && allWordsPresentIsSafe(gameName, candidateTitle)) {
      return { label: '1', reason: 'all game words present in title' };
    }
    return { label: '0', reason: 'low confidence, incomplete match' };
  }

  // Untrusted small match
  if (reviewBucket === 'untrusted_small_match') {
    if (isSameGame && sizeBytes > 50_000_000) {
      return { label: '1', reason: 'same game, reasonable size' };
    }
    if (isSameGame && sizeBytes === 0) {
      // Unknown size, trust the match
      return { label: '1', reason: 'same game, unknown size' };
    }
    if (sizeBytes > 0 && sizeBytes < 50_000_000) {
      return { label: '0', reason: 'suspiciously small file' };
    }
    if (!isSameGame) {
      return { label: '0', reason: 'not same game' };
    }
    return { label: '1', reason: 'untrusted but seems valid' };
  }

  // Zero seeders match: most are legitimate just dead
  if (reviewBucket === 'zero_seeders_match') {
    if (isSameGame) {
      return { label: '1', reason: 'same game, just dead torrent' };
    }
    const gameWords = gameName.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    const titleCleanLower = normalizeName(extractSequelInfo(candidateTitle).baseName);
    const allPresent = gameWords.every(w => titleCleanLower.includes(w));
    if (allPresent && matchScore >= 50 && allWordsPresentIsSafe(gameName, candidateTitle)) {
      return { label: '1', reason: 'good match, dead torrent' };
    }
    return { label: '0', reason: 'wrong game, dead torrent' };
  }

  // Validation buckets: re-label using our improved logic
  if (reviewBucket.startsWith('validation_')) {
    if (isSameGame && matchScore >= 30) {
      return { label: '1', reason: 'validation: same game confirmed' };
    }
    if (matched && matchScore >= 80) {
      const gameWords = gameName.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
      const titleCleanLower = normalizeName(extractSequelInfo(candidateTitle).baseName);
      if (gameWords.every(w => titleCleanLower.includes(w)) && allWordsPresentIsSafe(gameName, candidateTitle)) {
        return { label: '1', reason: 'validation: high score + all words match' };
      }
    }
    if (!matched && matchScore < 50) {
      return { label: '0', reason: 'validation: low score rejection confirmed' };
    }
    // Fall through to default
  }

  // ── Default fallback ──
  if (matched && matchScore >= 50) {
    return { label: '1', reason: 'default: matched with decent score' };
  }
  if (!matched) {
    // Even if matcher said "not matched", our name analysis may confirm same game
    if (isSameGame && matchScore > 0) {
      return { label: '1', reason: 'default: not matched but same game confirmed' };
    }
    // IGDB alternative name match (e.g., "Metal Gear Solid 5" for "Metal Gear Solid V")
    if (isAltName && matchScore >= 30) {
      return { label: '1', reason: 'default: matches IGDB alternative name' };
    }
    return { label: '0', reason: 'default: not matched' };
  }
  // Matched but low score
  return { label: '0', reason: 'default: matched but very low score' };
}

// ── Main ──────────────────────────────────────────────────────────────

function findDataDir(): string | null {
  let current = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(current, 'data');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function run() {
  const csvArg = process.argv[2];
  let csvPath: string;

  if (csvArg) {
    csvPath = path.resolve(csvArg);
  } else {
    const dataDir = findDataDir();
    if (!dataDir) { console.error('Data dir not found, pass CSV path as argument'); process.exit(1); }
    csvPath = path.join(dataDir, 'audit-500-trust-autolabeled.csv');
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  // Load IGDB franchise cache (optional — script works without it)
  const franchiseCachePath = process.argv[3] || '/tmp/igdb-franchise-cache.json';
  loadFranchiseCache(franchiseCachePath);

  console.log(`Reading: ${csvPath}`);
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());

  const headers = parseCsvLine(lines[0]);
  const col = (name: string) => headers.indexOf(name);

  const gameIdIdx = col('gameId');
  const gameNameIdx = col('gameName');
  const releaseStatusIdx = col('gameReleaseStatus');
  const candidateTitleIdx = col('candidateTitle');
  const candidateSourceIdx = col('candidateSource');
  const matchScoreIdx = col('matchScore');
  const matchedIdx = col('matched');
  const reasonsIdx = col('reasons');
  const sizeBytesIdx = col('sizeBytes') !== -1 ? col('sizeBytes') : col('sizeBytes');
  const seedersIdx = col('seeders');
  const labelIdx = col('label');
  const trustIdx = col('sourceTrustLevel');
  const autoLabelIdx = col('autoLabel');
  const autoReasonIdx = col('autoReason');
  const reviewBucketIdx = col('reviewBucket');

  // Replace 'label' header with final label + add labelReason column
  const outHeaders = [...headers];
  if (!outHeaders.includes('labelReason')) {
    outHeaders.push('labelReason');
  }
  const outLines: string[] = [outHeaders.map(csvEscape).join(',')];

  let stats = {
    total: 0,
    labeled1: 0,
    labeled0: 0,
    unlabeled: 0,
    autoKept: 0,
    autoFixed: 0,
    reviewLabeled: 0,
    malwareDetected: 0,
    sequelFixed: 0,
    franchiseRejected: 0,
    altNameMatched: 0,
  };

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < headers.length) continue;

    stats.total++;

    const rowData = {
      gameId: parseInt(fields[gameIdIdx], 10) || 0,
      gameName: fields[gameNameIdx] || '',
      gameReleaseStatus: fields[releaseStatusIdx] || '',
      candidateTitle: fields[candidateTitleIdx] || '',
      candidateSource: fields[candidateSourceIdx] || '',
      matchScore: parseInt(fields[matchScoreIdx], 10) || 0,
      matched: fields[matchedIdx] === 'true',
      reasons: fields[reasonsIdx] || '',
      sizeBytes: parseInt(fields[sizeBytesIdx] || '0', 10) || 0,
      seeders: parseInt(fields[seedersIdx] || '0', 10) || 0,
      sourceTrustLevel: fields[trustIdx] || 'unknown',
      autoLabel: fields[autoLabelIdx] || '',
      autoReason: fields[autoReasonIdx] || '',
      reviewBucket: fields[reviewBucketIdx] || '',
    };

    const { label, reason } = labelRow(rowData);

    // Track stats
    if (label === '1') stats.labeled1++;
    else if (label === '0') stats.labeled0++;
    else stats.unlabeled++;

    if (rowData.reviewBucket) stats.reviewLabeled++;
    if (reason.startsWith('auto:')) stats.autoKept++;
    if (reason.startsWith('fixed:')) {
      stats.autoFixed++;
      if (reason.includes('version number')) stats.sequelFixed++;
    }
    if (reason.includes('malware')) stats.malwareDetected++;
    if (reason.includes('IGDB: matches different franchise')) stats.franchiseRejected++;
    if (reason.includes('IGDB alternative name')) stats.altNameMatched++;

    // Write label and reason
    fields[labelIdx] = label;
    // Ensure we have the labelReason column
    while (fields.length < outHeaders.length) fields.push('');
    fields[outHeaders.indexOf('labelReason')] = reason;

    outLines.push(fields.map(csvEscape).join(','));
  }

  // Write output
  const outPath = csvPath.replace('-autolabeled.csv', '-training.csv').replace('.csv', '-training.csv');
  const finalOutPath = outPath.includes('-training-training') ? outPath.replace('-training-training', '-training') : outPath;
  fs.writeFileSync(finalOutPath, outLines.join('\n') + '\n', 'utf-8');

  console.log(`\nCompilation complete:`);
  console.log(`  Output: ${finalOutPath}`);
  console.log(`  Total rows: ${stats.total}`);
  console.log(`  Label 1 (match): ${stats.labeled1} (${(100 * stats.labeled1 / stats.total).toFixed(1)}%)`);
  console.log(`  Label 0 (no match): ${stats.labeled0} (${(100 * stats.labeled0 / stats.total).toFixed(1)}%)`);
  console.log(`  Unlabeled: ${stats.unlabeled}`);
  console.log(`  Auto-labels kept: ${stats.autoKept}`);
  console.log(`  Auto-labels fixed: ${stats.autoFixed}`);
  console.log(`    Sequel→version fixes: ${stats.sequelFixed}`);
  console.log(`  Review rows labeled: ${stats.reviewLabeled}`);
  console.log(`  Malware detected: ${stats.malwareDetected}`);
  console.log(`  IGDB franchise rejected: ${stats.franchiseRejected}`);
  console.log(`  IGDB alt name matched: ${stats.altNameMatched}`);

  // Write stats JSON
  const statsPath = finalOutPath.replace('.csv', '-stats.json');
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2) + '\n', 'utf-8');
  console.log(`  Stats: ${statsPath}`);
}

run();
