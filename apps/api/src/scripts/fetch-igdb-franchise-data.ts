/**
 * Fetch IGDB Franchise/Collection Data
 *
 * For each unique game in the training data, fetches:
 *   - Franchise siblings (other games in same franchise)
 *   - Collection siblings (other games in same collection/series)
 *   - Alternative names (variant spellings, regional titles)
 *   - Related games (expansions, DLCs, standalone expansions)
 *
 * Output: JSON lookup file used by compile-training-labels.ts to catch:
 *   - Named sequels that embed the original title ("Dreamfall: The Longest Journey")
 *   - Word-order variants ("Total War ROME" vs "Rome: Total War")
 *   - Sub-game numbering ("Halo MCC Halo 4")
 *
 * Usage: npx ts-node src/scripts/fetch-igdb-franchise-data.ts [path-to-training-csv]
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';

// ── IGDB API ──────────────────────────────────────────────────────────

const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID || '';
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET || '';
const IGDB_BASE_URL = 'https://api.igdb.com/v4';
const RATE_LIMIT_MS = 260; // ~4 requests/sec

let accessToken: string | null = null;

async function authenticate(): Promise<void> {
  const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
    params: {
      client_id: IGDB_CLIENT_ID,
      client_secret: IGDB_CLIENT_SECRET,
      grant_type: 'client_credentials',
    },
    timeout: 10000,
  });
  accessToken = response.data.access_token;
  console.log('Authenticated with Twitch/IGDB');
}

async function igdbQuery<T>(endpoint: string, body: string): Promise<T[]> {
  if (!accessToken) await authenticate();
  await sleep(RATE_LIMIT_MS);

  const response = await axios.post<T[]>(`${IGDB_BASE_URL}${endpoint}`, body, {
    headers: {
      'Client-ID': IGDB_CLIENT_ID,
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
    timeout: 30000,
  });
  return response.data;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── CSV parsing ───────────────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────

interface IGDBGameFull {
  id: number;
  name: string;
  slug?: string;
  franchises?: number[];
  collections?: number[];
  alternative_names?: Array<{ id: number; name: string; comment?: string }>;
  expansions?: number[];
  dlcs?: number[];
  standalone_expansions?: number[];
  parent_game?: number;
  version_parent?: number;
  similar_games?: number[];
  remakes?: number[];
  remasters?: number[];
  bundles?: number[];
  ports?: number[];
  forks?: number[];
}

interface FranchiseGameEntry {
  id: number;
  name: string;
  slug?: string;
  first_release_date?: number;
}

export interface GameFranchiseData {
  id: number;
  name: string;
  /** Other game names in the same franchise(s) */
  franchiseSiblings: string[];
  /** Other game names in the same collection(s)/series */
  collectionSiblings: string[];
  /** Alternative/regional names for THIS game */
  alternativeNames: string[];
  /** Expansion/DLC names */
  expansionNames: string[];
  /** All sibling names combined and deduplicated (excluding self) */
  allSiblingNames: string[];
}

// ── Fetching logic ────────────────────────────────────────────────────

async function fetchGameDetails(gameId: number): Promise<IGDBGameFull | null> {
  try {
    const results = await igdbQuery<IGDBGameFull>('/games', `
      fields id, name, slug, franchises, collections,
        alternative_names.id, alternative_names.name, alternative_names.comment,
        expansions, dlcs, standalone_expansions, parent_game, version_parent,
        similar_games, remakes, remasters, bundles, ports, forks;
      where id = ${gameId};
    `);
    return results[0] || null;
  } catch (err: any) {
    console.error(`  Failed to fetch game ${gameId}: ${err.message}`);
    return null;
  }
}

async function fetchGamesByFranchise(franchiseId: number): Promise<FranchiseGameEntry[]> {
  try {
    return await igdbQuery<FranchiseGameEntry>('/games', `
      fields id, name, slug, first_release_date;
      where franchises = (${franchiseId});
      limit 500;
    `);
  } catch (err: any) {
    console.error(`  Failed to fetch franchise ${franchiseId}: ${err.message}`);
    return [];
  }
}

async function fetchGamesByCollection(collectionId: number): Promise<FranchiseGameEntry[]> {
  try {
    return await igdbQuery<FranchiseGameEntry>('/games', `
      fields id, name, slug, first_release_date;
      where collections = (${collectionId});
      limit 500;
    `);
  } catch (err: any) {
    console.error(`  Failed to fetch collection ${collectionId}: ${err.message}`);
    return [];
  }
}

async function fetchGameNames(ids: number[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const batchSize = 50;
  const names: string[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    try {
      const results = await igdbQuery<{ id: number; name: string }>('/games', `
        fields id, name;
        where id = (${batch.join(',')});
        limit ${batchSize};
      `);
      names.push(...results.map(r => r.name));
    } catch (err: any) {
      console.error(`  Failed to fetch game names batch: ${err.message}`);
    }
  }
  return names;
}

async function fetchFranchiseDataForGame(gameId: number, gameName: string): Promise<GameFranchiseData> {
  const data: GameFranchiseData = {
    id: gameId,
    name: gameName,
    franchiseSiblings: [],
    collectionSiblings: [],
    alternativeNames: [],
    expansionNames: [],
    allSiblingNames: [],
  };

  const game = await fetchGameDetails(gameId);
  if (!game) return data;

  // Alternative names for THIS game
  if (game.alternative_names) {
    data.alternativeNames = game.alternative_names
      .map(an => an.name)
      .filter(n => n.toLowerCase() !== gameName.toLowerCase());
  }

  // Franchise siblings
  const franchiseSiblingSet = new Set<string>();
  if (game.franchises && game.franchises.length > 0) {
    for (const fId of game.franchises) {
      const siblings = await fetchGamesByFranchise(fId);
      for (const s of siblings) {
        if (s.id !== gameId) {
          franchiseSiblingSet.add(s.name);
        }
      }
    }
  }
  data.franchiseSiblings = [...franchiseSiblingSet];

  // Collection siblings
  const collectionSiblingSet = new Set<string>();
  if (game.collections && game.collections.length > 0) {
    for (const cId of game.collections) {
      const siblings = await fetchGamesByCollection(cId);
      for (const s of siblings) {
        if (s.id !== gameId) {
          collectionSiblingSet.add(s.name);
        }
      }
    }
  }
  data.collectionSiblings = [...collectionSiblingSet];

  // Expansion/DLC names
  const expansionIds = new Set<number>();
  const addIds = (ids?: number[]) => { if (ids) ids.forEach(id => expansionIds.add(id)); };
  addIds(game.expansions);
  addIds(game.dlcs);
  addIds(game.standalone_expansions);

  if (expansionIds.size > 0) {
    data.expansionNames = await fetchGameNames([...expansionIds]);
  }

  // Combine all siblings (excluding self)
  const allNames = new Set<string>();
  for (const n of data.franchiseSiblings) allNames.add(n);
  for (const n of data.collectionSiblings) allNames.add(n);
  for (const n of data.expansionNames) allNames.add(n);
  // Remove the game's own name and variants
  allNames.delete(gameName);
  for (const alt of data.alternativeNames) allNames.delete(alt);
  data.allSiblingNames = [...allNames];

  return data;
}

// ── Main ──────────────────────────────────────────────────────────────

async function run() {
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
    console.error('Missing IGDB_CLIENT_ID or IGDB_CLIENT_SECRET environment variables');
    process.exit(1);
  }

  // Find CSV
  const csvArg = process.argv[2] || '/tmp/autolabeled.csv';
  const csvPath = path.resolve(csvArg);
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  // Parse CSV to get unique gameId → gameName mappings
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);
  const gameIdIdx = headers.indexOf('gameId');
  const gameNameIdx = headers.indexOf('gameName');

  const gameMap = new Map<number, string>(); // gameId → gameName
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const gameId = parseInt(fields[gameIdIdx], 10);
    const gameName = fields[gameNameIdx];
    if (gameId && gameName && !gameMap.has(gameId)) {
      gameMap.set(gameId, gameName);
    }
  }

  console.log(`Found ${gameMap.size} unique games in training data`);

  // Check for existing cache (resume support)
  const outPath = '/tmp/igdb-franchise-cache.json';
  let cache: Record<string, GameFranchiseData> = {};
  if (fs.existsSync(outPath)) {
    cache = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    console.log(`Loaded existing cache with ${Object.keys(cache).length} entries`);
  }

  // Fetch data for each game
  let processed = 0;
  const total = gameMap.size;
  let skipped = 0;

  for (const [gameId, gameName] of gameMap) {
    processed++;

    // Skip if already in cache
    if (cache[gameId.toString()]) {
      skipped++;
      continue;
    }

    console.log(`[${processed}/${total}] Fetching: ${gameName} (${gameId})...`);

    const data = await fetchFranchiseDataForGame(gameId, gameName);
    cache[gameId.toString()] = data;

    // Log interesting findings
    if (data.allSiblingNames.length > 0) {
      console.log(`  → ${data.allSiblingNames.length} siblings: ${data.allSiblingNames.slice(0, 5).join(', ')}${data.allSiblingNames.length > 5 ? '...' : ''}`);
    }
    if (data.alternativeNames.length > 0) {
      console.log(`  → ${data.alternativeNames.length} alt names: ${data.alternativeNames.slice(0, 3).join(', ')}${data.alternativeNames.length > 3 ? '...' : ''}`);
    }

    // Save periodically (every 20 games)
    if (processed % 20 === 0) {
      fs.writeFileSync(outPath, JSON.stringify(cache, null, 2), 'utf-8');
      console.log(`  [Saved ${Object.keys(cache).length} entries to cache]`);
    }
  }

  // Final save
  fs.writeFileSync(outPath, JSON.stringify(cache, null, 2), 'utf-8');

  // Summary stats
  const entries = Object.values(cache);
  const withSiblings = entries.filter(e => e.allSiblingNames.length > 0).length;
  const withAlts = entries.filter(e => e.alternativeNames.length > 0).length;
  const totalSiblings = entries.reduce((sum, e) => sum + e.allSiblingNames.length, 0);
  const totalAlts = entries.reduce((sum, e) => sum + e.alternativeNames.length, 0);

  console.log(`\nDone! Saved to ${outPath}`);
  console.log(`  Total games: ${entries.length}`);
  console.log(`  Skipped (cached): ${skipped}`);
  console.log(`  Games with siblings: ${withSiblings} (${(100 * withSiblings / entries.length).toFixed(1)}%)`);
  console.log(`  Games with alt names: ${withAlts} (${(100 * withAlts / entries.length).toFixed(1)}%)`);
  console.log(`  Total sibling names: ${totalSiblings}`);
  console.log(`  Total alternative names: ${totalAlts}`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
