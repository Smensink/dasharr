import fs from 'fs';
import path from 'path';
import { IGDBClient } from '../clients/IGDBClient';
import { CacheService } from '../services/cache.service';
import { HydraLibraryService } from '../services/games/HydraLibraryService';
import { HydraLibraryAgent } from '../services/games/search-agents/HydraLibraryAgent';
import { DEFAULT_HYDRA_SEARCH_SETTINGS, HydraSearchSettings } from '@dasharr/shared-types';
import { SequelDetector, SequelPatterns } from '../utils/SequelDetector';
import { HydraSource } from '@dasharr/shared-types';
import { IGDBGame } from '@dasharr/shared-types';

type IgdbSettings = {
  services?: {
    igdb?: {
      enabled?: boolean;
      clientId?: string;
      clientSecret?: string;
    };
  };
};

type SequelCacheEntry = {
  exactNames: string[];
  namePatterns: string[];
  confidence: 'high' | 'medium' | 'low';
};

type ApiSequelPatterns = {
  exactNames: string[];
  namePatterns: string[];
  confidence: 'high' | 'medium' | 'low';
};

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

function saveJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function reviveSequelPatterns(entry: SequelCacheEntry): SequelPatterns {
  return {
    exactNames: entry.exactNames,
    namePatterns: entry.namePatterns.map((pattern) => new RegExp(pattern, 'i')),
    confidence: entry.confidence,
  };
}

function serializeSequelPatterns(patterns: SequelPatterns): SequelCacheEntry {
  return {
    exactNames: patterns.exactNames,
    namePatterns: patterns.namePatterns.map((pattern) => pattern.source),
    confidence: patterns.confidence,
  };
}

async function fetchJson<T>(
  url: string,
  apiKey?: string
): Promise<T> {
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function resolveRepoPath(...segments: string[]): string {
  return path.resolve(__dirname, '..', '..', '..', '..', ...segments);
}

function normalizePopularGames(games: any[]): IGDBGame[] {
  if (!Array.isArray(games)) return [];
  return games.map((game) => {
    if (typeof game.id === 'number') {
      return game as IGDBGame;
    }

    if (typeof game.igdbId === 'number') {
      return {
        id: game.igdbId,
        name: game.name,
        slug: game.slug,
        first_release_date: game.releaseDate
          ? Math.floor(new Date(game.releaseDate).getTime() / 1000)
          : undefined,
        platforms: Array.isArray(game.platforms)
          ? game.platforms.map((name: string, idx: number) => ({
              id: idx + 1,
              name,
              abbreviation: undefined,
            }))
          : undefined,
      } as IGDBGame;
    }

    return game as IGDBGame;
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
  source: HydraSource;
  titles: Array<{ raw: string; normalized: string }>;
};

async function buildSourceIndex(
  hydraService: HydraLibraryService
): Promise<SourceIndex[]> {
  const sources = (await hydraService
    .getAvailableSources())
    .filter(
      (source) =>
        source.enabled &&
        hydraService.getSettings().allowedTrustLevels.includes(source.trustLevel)
    );

  const indexes: SourceIndex[] = [];

  for (const source of sources) {
    const data = await hydraService.fetchSourceData(source.id);
    if (!data?.games) continue;

    const titles = Object.keys(data.games).map((title) => ({
      raw: title,
      normalized: normalizeTitle(title),
    }));

    indexes.push({ source, titles });
  }

  return indexes;
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
        matches.push({ sourceId: index.source.id, title: title.raw, score: 100 });
        if (matches.length >= limit) {
          return matches
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(({ sourceId, title: raw }) => ({ sourceId, title: raw }));
        }
        break;
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
            sourceId: index.source.id,
            title: title.raw,
            score: tokenMatches,
          });
          if (matches.length >= limit) {
            return matches
              .sort((a, b) => b.score - a.score)
              .slice(0, limit)
              .map(({ sourceId, title: raw }) => ({ sourceId, title: raw }));
          }
          break;
        }
      }
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ sourceId, title }) => ({ sourceId, title }));
}

async function main(): Promise<void> {
  const settingsPath = resolveRepoPath('data', 'settings.json');
  const settingsBackupPath = resolveRepoPath('data', 'settings.json.backup');
  const appSettingsPath = resolveRepoPath('data', 'app-settings.json');
  const envFilePath = resolveRepoPath('.env');
  const igdbCachePath = resolveRepoPath('data', 'igdb-audit-cache.json');

  const settingsOverridePath = process.env.SETTINGS_PATH;
  const appSettingsOverridePath = process.env.APP_SETTINGS_PATH;

  const settings = loadJson<IgdbSettings>(settingsOverridePath || settingsPath);
  const settingsBackup = loadJson<IgdbSettings>(settingsBackupPath);
  const igdb =
    settings?.services?.igdb ||
    settingsBackup?.services?.igdb;

  const envClientId = process.env.IGDB_CLIENT_ID;
  const envClientSecret = process.env.IGDB_CLIENT_SECRET;
  const envFile = loadEnvFile(envFilePath);
  const fileClientId = envFile.IGDB_CLIENT_ID;
  const fileClientSecret = envFile.IGDB_CLIENT_SECRET;

  if (
    (!igdb?.clientId || !igdb?.clientSecret) &&
    (!envClientId || !envClientSecret) &&
    (!fileClientId || !fileClientSecret)
  ) {
    throw new Error(
      'Missing IGDB credentials in data/settings.json (services.igdb.clientId/clientSecret).'
    );
  }

  const appSettings = loadJson<{ hydra?: HydraSearchSettings }>(
    appSettingsOverridePath || appSettingsPath
  );
  const hydraSettings: HydraSearchSettings = {
    ...DEFAULT_HYDRA_SEARCH_SETTINGS,
    ...(appSettings?.hydra || {}),
    enabled: true,
  };

  const igdbClient = new IGDBClient({
    clientId: envClientId || igdb?.clientId || fileClientId || '',
    clientSecret: envClientSecret || igdb?.clientSecret || fileClientSecret || '',
  });
  const sequelDetector = new SequelDetector(igdbClient);

  const apiBaseUrl = process.env.DASHARR_API_URL || 'http://localhost:3000';
  const apiKey = process.env.DASHARR_API_KEY;
  const useApi = !!process.env.DASHARR_API_URL;
  const allowIgdbFallback = process.env.DASHARR_API_ALLOW_IGDB_FALLBACK === 'true';

  const igdbCache = loadJson<{
    popularGames?: IGDBGame[];
    sequelPatterns?: Record<number, SequelCacheEntry>;
    apiSequelPatterns?: Record<number, SequelCacheEntry>;
    editionTitles?: Record<number, string[]>;
    apiEditionTitles?: Record<number, string[]>;
  }>(igdbCachePath) || {};

  const cachedPatterns = igdbCache.sequelPatterns || {};
  const cachedApiPatterns = igdbCache.apiSequelPatterns || {};
  const cachedEditionTitles = igdbCache.editionTitles || {};
  const cachedApiEditionTitles = igdbCache.apiEditionTitles || {};

  const cacheService = new CacheService();
  const hydraService = new HydraLibraryService(cacheService, hydraSettings);
  if (hydraSettings.enabledSources.length === 0) {
    const allSources = (await hydraService
      .getAvailableSources())
      .map((source) => source.id);
    hydraService.updateSettings({
      ...hydraSettings,
      enabledSources: allSources,
    });
  }
  const hydraAgent = new HydraLibraryAgent(hydraService);
  const sourceIndexes = await buildSourceIndex(hydraService);

  let popularGames: IGDBGame[];
  try {
    popularGames = igdbCache.popularGames?.length
      ? igdbCache.popularGames
      : await fetchJson<IGDBGame[]>(
          `${apiBaseUrl}/api/v1/games/popular?limit=200`,
          apiKey
        );

    popularGames = normalizePopularGames(popularGames);

    if (!igdbCache.popularGames) {
      igdbCache.popularGames = popularGames;
      saveJson(igdbCachePath, igdbCache);
    } else if (igdbCache.popularGames.some((g) => (g as any).igdbId)) {
      igdbCache.popularGames = popularGames;
      saveJson(igdbCachePath, igdbCache);
    }
  } catch (error) {
    if (useApi && !allowIgdbFallback && igdbCache.popularGames?.length) {
      popularGames = normalizePopularGames(igdbCache.popularGames);
      if (igdbCache.popularGames.some((g) => (g as any).igdbId)) {
        igdbCache.popularGames = popularGames;
        saveJson(igdbCachePath, igdbCache);
      }
    } else if (useApi && !allowIgdbFallback) {
      throw error;
    } else {
      popularGames = igdbCache.popularGames?.length
        ? igdbCache.popularGames
        : await igdbClient.getPopularGames(200);

      popularGames = normalizePopularGames(popularGames);

      if (!igdbCache.popularGames) {
        igdbCache.popularGames = popularGames;
        saveJson(igdbCachePath, igdbCache);
      }
    }
  }

  const results: Array<{
    igdbId: number;
    name: string;
    topCandidate: {
      title: string;
      source: string;
      matchScore?: number;
      matchReasons?: string[];
    } | null;
    candidateCount: number;
    broadMatches: Array<{ sourceId: string; title: string }>;
  }> = [];

  for (let i = 0; i < popularGames.length; i += 1) {
    const game = popularGames[i];
    let sequelPatterns: SequelPatterns;
    let editionTitles: string[] | undefined;

    if (cachedApiPatterns[game.id]) {
      sequelPatterns = reviveSequelPatterns(cachedApiPatterns[game.id]);
    } else {
      try {
        const response = await fetchJson<{
          patterns: ApiSequelPatterns;
          editionTitles?: string[];
        }>(`${apiBaseUrl}/api/v1/games/${game.id}/sequel-patterns`, apiKey);

        sequelPatterns = reviveSequelPatterns({
          exactNames: response.patterns.exactNames,
          namePatterns: response.patterns.namePatterns,
          confidence: response.patterns.confidence,
        });

        cachedApiPatterns[game.id] = serializeSequelPatterns(sequelPatterns);
        igdbCache.apiSequelPatterns = cachedApiPatterns;
        if (response.editionTitles && response.editionTitles.length > 0) {
          cachedApiEditionTitles[game.id] = response.editionTitles;
          igdbCache.apiEditionTitles = cachedApiEditionTitles;
        }
        saveJson(igdbCachePath, igdbCache);
      } catch {
        if (cachedPatterns[game.id]) {
          sequelPatterns = reviveSequelPatterns(cachedPatterns[game.id]);
        } else if (!useApi || allowIgdbFallback) {
          sequelPatterns = await sequelDetector.getSequelPatterns(
            game.id,
            game.name
          );
          cachedPatterns[game.id] = serializeSequelPatterns(sequelPatterns);
          igdbCache.sequelPatterns = cachedPatterns;
          saveJson(igdbCachePath, igdbCache);
        } else {
          sequelPatterns = {
            exactNames: [],
            namePatterns: [],
            confidence: 'low',
          };
        }
      }
    }

    if (cachedApiEditionTitles[game.id]) {
      editionTitles = cachedApiEditionTitles[game.id];
    } else if (cachedEditionTitles[game.id]) {
      editionTitles = cachedEditionTitles[game.id];
    } else if (!useApi || allowIgdbFallback) {
      try {
        const baseId = game.version_parent ?? game.id;
        let baseGame = game;
        if (baseId !== game.id) {
          const fetched = await igdbClient.getGameById(baseId);
          if (fetched) baseGame = fetched;
        }
        const titles: string[] = [];
        if (game.version_title) titles.push(game.version_title);
        if (baseGame.version_title) titles.push(baseGame.version_title);
        const versions = await igdbClient.getGameVersionsByGameId(baseId);
        for (const version of versions) {
          if (version.version_title) titles.push(version.version_title);
        }
        const unique = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
        if (unique.length > 0) {
          cachedEditionTitles[game.id] = unique;
          igdbCache.editionTitles = cachedEditionTitles;
          saveJson(igdbCachePath, igdbCache);
          editionTitles = unique;
        }
      } catch {
        editionTitles = undefined;
      }
    }

    const response = await hydraAgent.searchEnhanced(game.name, {
      igdbGame: game,
      sequelPatterns,
      editionTitles,
    });

    const top = response.candidates[0] || null;
    const broadMatches =
      response.candidates.length === 0
        ? findBroadMatches(sourceIndexes, game.name)
        : [];

    results.push({
      igdbId: game.id,
      name: game.name,
      topCandidate: top
        ? {
            title: top.title,
            source: top.source,
            matchScore: top.matchScore,
            matchReasons: top.matchReasons,
          }
        : null,
      candidateCount: response.candidates.length,
      broadMatches,
    });

    if ((i + 1) % 20 === 0) {
      console.log(`Processed ${i + 1}/${popularGames.length} games...`);
    }
  }

  const outPath = resolveRepoPath(
    'apps',
    'api',
    'src',
    'scripts',
    'hydra-match-audit-output.json'
  );
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`Wrote ${results.length} results to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
