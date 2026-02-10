import fs from 'fs';
import path from 'path';
import { HydraLibraryService } from '../services/games/HydraLibraryService';
import { HydraLibraryAgent } from '../services/games/search-agents/HydraLibraryAgent';
import { CacheService } from '../services/cache.service';
import { IGDBClient } from '../clients/IGDBClient';
import { DEFAULT_HYDRA_SEARCH_SETTINGS, HydraSearchSettings, IGDBGame, HydraLibraryData } from '@dasharr/shared-types';
import { SequelDetector, SequelPatterns } from '../utils/SequelDetector';

type ApiGame = {
  igdbId?: number;
  id?: number;
  name: string;
  slug?: string;
  releaseDate?: string;
  platforms?: string[];
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

const REVIEW_NEGATIVE_REASONS = new Set([
  'different sequel number',
  'title is numbered sequel',
  'matches related game pattern',
  'related game bundle penalty',
  'single-word partial match',
  'single-word title has extra words',
  'title too short',
  'non-game media',
  'language pack',
  'crack/fix only',
  'update/patch only',
  'DLC/expansion only',
  'mod/fan content',
  'demo/alpha/beta',
  'platform not in IGDB',
]);

function resolveRepoPath(...segments: string[]): string {
  return path.resolve(__dirname, '..', '..', '..', '..', ...segments);
}

function loadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8');
    const entries: Record<string, string> = {};

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2] ?? '';
      value = value.replace(/^['"]|['"]$/g, '');
      entries[key] = value;
    }

    return entries;
  } catch {
    return {};
  }
}

async function fetchJson<T>(url: string, apiKey?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function normalizePopularGames(games: ApiGame[]): IGDBGame[] {
  return games.map((game, idx) => {
    const igdbId = typeof game.id === 'number' ? game.id : game.igdbId ?? idx + 1;
    return {
      id: igdbId,
      name: game.name,
      slug: game.slug ?? '',
      first_release_date: game.releaseDate
        ? Math.floor(new Date(game.releaseDate).getTime() / 1000)
        : undefined,
      platforms: Array.isArray(game.platforms)
        ? game.platforms.map((name: string, pidx: number) => ({
            id: pidx + 1,
            name,
            abbreviation: undefined,
          }))
        : undefined,
    } as IGDBGame;
  });
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeTitle(value: string): string[] {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'of',
    'to',
    'a',
    'an',
    'in',
    'on',
    'with',
    'edition',
    'deluxe',
    'complete',
    'ultimate',
    'game',
    'bundle',
  ]);
  return normalizeTitle(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

type SourceIndex = {
  sourceId: string;
  titles: Array<{ raw: string; normalized: string }>;
};

type SourceIndexResult = {
  indexes: SourceIndex[];
  cache: Record<string, HydraLibraryData>;
};

async function buildSourceIndex(
  hydraService: HydraLibraryService,
  disabledSourceIds: Set<string>
): Promise<SourceIndexResult> {
  const sources = (await hydraService
    .getAvailableSources())
    .filter(
      (source) =>
        source.enabled &&
        hydraService.getSettings().allowedTrustLevels.includes(source.trustLevel) &&
        !disabledSourceIds.has(source.id)
    );

  const indexes: SourceIndex[] = [];
  const cache: Record<string, HydraLibraryData> = {};

  for (const source of sources) {
    const data = await hydraService.fetchSourceData(source.id);
    if (!data?.games) continue;
    cache[source.id] = data;

    const titles = Object.keys(data.games).map((title) => ({
      raw: title,
      normalized: normalizeTitle(title),
    }));

    indexes.push({ sourceId: source.id, titles });
  }

  return { indexes, cache };
}

function findBroadMatches(
  sourceIndexes: SourceIndex[],
  gameName: string,
  limit = 10
): Array<{ sourceId: string; title: string }> {
  const normalizedGame = normalizeTitle(gameName);
  if (!normalizedGame) return [];
  const gameTokens = tokenizeTitle(gameName);

  const matches: Array<{ sourceId: string; title: string; score: number }> = [];

  for (const index of sourceIndexes) {
    for (const title of index.titles) {
      if (
        title.normalized.includes(normalizedGame) ||
        normalizedGame.includes(title.normalized)
      ) {
        matches.push({ sourceId: index.sourceId, title: title.raw, score: 100 });
        if (matches.length >= limit) break;
        continue;
      }

      if (gameTokens.length > 0) {
        let tokenMatches = 0;
        for (const token of gameTokens) {
          if (title.normalized.includes(token)) {
            tokenMatches += 1;
          }
        }

        if (tokenMatches >= 2 || (tokenMatches === 1 && gameTokens.length === 1)) {
          matches.push({
            sourceId: index.sourceId,
            title: title.raw,
            score: tokenMatches,
          });
          if (matches.length >= limit) break;
        }
      }
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ sourceId, title }) => ({ sourceId, title }));
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
    'gameId',
    'gameName',
    'candidateTitle',
    'candidateSource',
    'matchScore',
    'matched',
    'reasons',
    'type',
    'reviewFlag',
    'label',
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

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
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

async function main(): Promise<void> {
  const apiBaseUrl = process.env.DASHARR_API_URL || 'http://localhost:3000';
  const apiKey = process.env.DASHARR_API_KEY;
  const limit = parseInt(process.env.IGDB_TRAIN_LIMIT || '5000', 10);
  const progressInterval = Math.max(
    1,
    parseInt(process.env.PROGRESS_INTERVAL || '100', 10)
  );
  const disabledSourceIds = new Set(
    (process.env.HYDRA_DISABLED_SOURCES || 'masquerade,armgddn')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const outputPath = resolveRepoPath(
    'apps',
    'api',
    'src',
    'scripts',
    'match-training-review.csv'
  );
  const noMatchOnly = process.env.AUDIT_NO_MATCH_ONLY === 'true';
  const igdbCachePath = resolveRepoPath('data', 'igdb-audit-cache.json');
  const hydraCachePath = resolveRepoPath('data', 'hydra-library-cache.json');
  const settingsPath = resolveRepoPath('data', 'settings.json');
  const settingsBackupPath = resolveRepoPath('data', 'settings.json.backup');
  const envFilePath = resolveRepoPath('.env');

  const appSettingsPath = resolveRepoPath('data', 'app-settings.json');
  const settings = fs.existsSync(appSettingsPath)
    ? JSON.parse(fs.readFileSync(appSettingsPath, 'utf-8'))
    : {};
  const hydraSettings: HydraSearchSettings = {
    ...DEFAULT_HYDRA_SEARCH_SETTINGS,
    ...(settings?.hydra || {}),
    enabled: true,
  };

  const igdbSettings = loadJson<{ services?: { igdb?: { clientId?: string; clientSecret?: string } } }>(settingsPath)
    || loadJson<{ services?: { igdb?: { clientId?: string; clientSecret?: string } } }>(settingsBackupPath);
  const envFile = loadEnvFile(envFilePath);
  const igdbClientId = process.env.IGDB_CLIENT_ID || igdbSettings?.services?.igdb?.clientId || envFile.IGDB_CLIENT_ID || '';
  const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || igdbSettings?.services?.igdb?.clientSecret || envFile.IGDB_CLIENT_SECRET || '';

  const cacheService = new CacheService();
  const hydraService = new HydraLibraryService(cacheService, hydraSettings);
  if (hydraSettings.enabledSources.length === 0) {
    const allSources = (await hydraService
      .getAvailableSources())
      .map((source) => source.id)
      .filter((id) => !disabledSourceIds.has(id));
    hydraService.updateSettings({
      ...hydraSettings,
      enabledSources: allSources,
    });
  } else if (disabledSourceIds.size > 0) {
    hydraService.updateSettings({
      ...hydraSettings,
      enabledSources: hydraSettings.enabledSources.filter(
        (id) => !disabledSourceIds.has(id)
      ),
    });
  }

  const cachedHydraSources = loadJson<Record<string, HydraLibraryData>>(
    hydraCachePath
  );
  if (cachedHydraSources) {
    const cacheTtlSeconds = Math.max(
      60,
      (hydraService.getSettings().cacheDurationMinutes || 60) * 60
    );
    await Promise.all(
      Object.entries(cachedHydraSources).map(([sourceId, data]) =>
        cacheService.set(`hydra-library:source:${sourceId}`, data, cacheTtlSeconds)
      )
    );
  }

  const hydraAgent = new HydraLibraryAgent(hydraService);
  const { indexes: sourceIndexes, cache: hydraCache } = await buildSourceIndex(
    hydraService,
    disabledSourceIds
  );
  if (Object.keys(hydraCache).length > 0) {
    fs.writeFileSync(
      hydraCachePath,
      JSON.stringify(hydraCache, null, 2),
      'utf-8'
    );
  }
  const igdbClient = new IGDBClient({
    clientId: igdbClientId,
    clientSecret: igdbClientSecret,
  });
  const sequelDetector = new SequelDetector(igdbClient);

  let games: IGDBGame[] = [];
  const cachedGames = loadJson<IGDBGame[]>(igdbCachePath);
  if (cachedGames && cachedGames.length > 0) {
    games = cachedGames;
    console.log(`Loaded ${games.length} games from cache at ${igdbCachePath}`);
  } else {
    try {
      console.log(
        `Fetching popular games from API: ${apiBaseUrl} (limit=${limit})`
      );
      const pageSize = 200;
      for (let offset = 0; offset < limit; offset += pageSize) {
        const apiGames = await fetchJson<ApiGame[]>(
          `${apiBaseUrl}/api/v1/games/popular?limit=${Math.min(pageSize, limit - offset)}&offset=${offset}`,
          apiKey
        );
        if (!apiGames.length) break;
        games.push(...normalizePopularGames(apiGames));
        console.log(
          `Fetched ${games.length} games from API (offset=${offset})`
        );
      }
    } catch (error) {
      console.error('Failed to fetch from API:', error);
      if (!igdbClientId || !igdbClientSecret) {
        throw error;
      }
    }

    if (games.length === 0 && igdbClientId && igdbClientSecret) {
      console.log('Falling back to IGDB for popular games.');
      const pageSize = 500;
      for (let offset = 0; offset < limit; offset += pageSize) {
        const page = await igdbClient.getPopularGamesPage(
          Math.min(pageSize, limit - offset),
          offset
        );
        if (page.length === 0) break;
        games.push(...page);
        console.log(`Fetched ${games.length} games from IGDB (offset=${offset})`);
      }
    }

    if (games.length > 0) {
      fs.writeFileSync(igdbCachePath, JSON.stringify(games, null, 2), 'utf-8');
      console.log(`Saved ${games.length} games to cache at ${igdbCachePath}`);
    }
  }

  if (games.length === 0) {
    throw new Error('No games available for training data.');
  }

  const rows: CsvRow[] = [];
  const existingIds = new Set<number>();
  const noMatchIds = new Set<number>();
  if (fs.existsSync(outputPath)) {
    try {
      const raw = fs.readFileSync(outputPath, 'utf-8');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      // First column is gameId and is not quoted; safe to take prefix before first comma.
      const header = lines.shift();
      const headerCols = header ? parseCsvLine(header) : [];
      const idIndex = headerCols.indexOf('gameId');
      const matchedIndex = headerCols.indexOf('matched');
      for (const line of lines) {
        const cols = parseCsvLine(line);
        const id = parseInt(cols[idIndex] || '', 10);
        if (isNaN(id)) continue;
        existingIds.add(id);

        const matchedValue = (cols[matchedIndex] || '').toLowerCase();
        const matched = matchedValue === 'true';
        if (!matched) {
          if (!noMatchIds.has(id)) noMatchIds.add(id);
        } else {
          if (noMatchIds.has(id)) noMatchIds.delete(id);
        }
      }
    } catch {
      // ignore
    }
  }

  if (noMatchOnly && noMatchIds.size > 0) {
    const before = games.length;
    games = games.filter((g) => noMatchIds.has(g.id));
    const skipped = before - games.length;
    if (skipped > 0) {
      console.log(
        `Skipping ${skipped} games; only auditing games with no matches.`
      );
    }
  } else if (existingIds.size > 0) {
    const before = games.length;
    games = games.filter((g) => !existingIds.has(g.id));
    const skipped = before - games.length;
    if (skipped > 0) {
      console.log(`Skipping ${skipped} games already in training CSV.`);
    }
  }

  for (let i = 0; i < games.length; i += 1) {
    const game = games[i];
    let sequelPatterns: SequelPatterns | undefined;

    try {
      const resp = await fetchJson<{
        patterns: { exactNames: string[]; namePatterns: string[]; confidence: 'high' | 'medium' | 'low' };
        editionTitles?: string[];
      }>(`${apiBaseUrl}/api/v1/games/${game.id}/sequel-patterns`, apiKey);
      sequelPatterns = {
        exactNames: resp.patterns.exactNames,
        namePatterns: resp.patterns.namePatterns.map((p) => new RegExp(p, 'i')),
        confidence: resp.patterns.confidence,
      };
    } catch {
      sequelPatterns = undefined;
    }

    const response = await hydraAgent.searchEnhanced(game.name, {
      igdbGame: game,
      sequelPatterns,
    });

    const top = response.candidates[0];
    if (top) {
      const reasons = top.matchReasons || [];
      const reviewFlag = reasons.some((r) => REVIEW_NEGATIVE_REASONS.has(r))
        ? 'likely_fp'
        : '';
      rows.push({
        gameId: game.id,
        gameName: game.name,
        candidateTitle: top.title,
        candidateSource: top.source,
        matchScore: top.matchScore ?? 0,
        matched: true,
        reasons: reasons.join('|'),
        type: 'top_candidate',
        reviewFlag,
        label: '',
      });
    }

    const broadMatches = findBroadMatches(sourceIndexes, game.name, 5);
    for (const broad of broadMatches) {
      const sanitized = (hydraAgent as any).sanitizeHydraTitle(broad.title);
      const base = hydraAgent.matchWithIGDB(sanitized, {
        igdbGame: game,
        sequelPatterns,
      });
      const result = (hydraAgent as any).applyHydraPenalties(
        broad.title,
        sanitized,
        base,
        { igdbGame: game, sequelPatterns }
      );
      const reviewFlag = result.matches ? 'likely_fn' : '';
      rows.push({
        gameId: game.id,
        gameName: game.name,
        candidateTitle: broad.title,
        candidateSource: `Hydra Library (${broad.sourceId})`,
        matchScore: result.score,
        matched: result.matches,
        reasons: result.reasons.join('|'),
        type: 'broad_candidate',
        reviewFlag,
        label: '',
      });
    }

    if ((i + 1) % progressInterval === 0 || i + 1 === games.length) {
      const pct = ((i + 1) / games.length) * 100;
      console.log(
        `Processed ${i + 1}/${games.length} (${pct.toFixed(1)}%)`
      );
    }
  }

  writeCsv(outputPath, rows);
  console.log(`Wrote training review CSV to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
