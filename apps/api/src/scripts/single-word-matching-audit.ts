import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { IGDBClient } from '../clients/IGDBClient';
import { getSteamDescriptionFromIGDB, getSteamSizeFromIGDB } from '../utils/steam';
import { BaseGameSearchAgent, SearchAgentResult, EnhancedMatchOptions } from '../services/games/search-agents/BaseGameSearchAgent';
import { FitGirlAgent } from '../services/games/search-agents/FitGirlAgent';
import { SteamRipAgent } from '../services/games/search-agents/SteamRipAgent';
import { ProwlarrGameAgent } from '../services/games/search-agents/ProwlarrGameAgent';

// ── Helpers ──────────────────────────────────────────────────────────

class MatchHelper extends BaseGameSearchAgent {
  readonly name = 'Helper';
  readonly baseUrl = '';
  readonly requiresAuth = false;
  readonly priority = 0;
  readonly releaseTypes: ('repack' | 'rip' | 'scene' | 'p2p')[] = [];

  isAvailable(): boolean { return false; }
  async search(): Promise<any> { throw new Error('Not implemented'); }
  async getDownloadLinks(): Promise<Partial<any>[]> { throw new Error('Not implemented'); }

  public clean(name: string): string { return this.cleanGameName(name); }
  public normalize(name: string): string { return this.normalizeGameName(name); }
  public extractSizeInfo(text: string) { return this.extractSize(text); }
}

const helper = new MatchHelper();

// ── Config helpers ───────────────────────────────────────────────────

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

function isPCGame(platforms: Array<{ name?: string; abbreviation?: string }> | undefined): boolean {
  if (!platforms || platforms.length === 0) return false;
  return platforms.some((p) => {
    const name = p.name || '';
    const abbr = p.abbreviation || '';
    return name.includes('PC') || abbr === 'PC';
  });
}

// ── Progress tracking ────────────────────────────────────────────────

interface AuditProgress {
  startedAt: string;
  totalGames: number;
  completedGames: number;
  currentGame: string;
  percentComplete: number;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number;
  estimatedFinishAt: string;
  gamesPerMinute: number;
  totalCandidatesFound: number;
  errors: number;
  status: 'running' | 'completed' | 'failed';
}

function writeProgress(progressPath: string, progress: AuditProgress) {
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
}

// ── CSV helpers ──────────────────────────────────────────────────────

function csvEscape(val: string | number | boolean | undefined | null): string {
  if (val === undefined || val === null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const CSV_HEADERS = [
  'gameId', 'gameName', 'gameReleaseDate', 'gameReleaseStatus',
  'candidateTitle', 'candidateSource', 'indexerName',
  'matchScore', 'matched', 'reasons',
  'size', 'sizeBytes', 'seeders', 'leechers', 'grabs',
  'uploader', 'publishDate', 'releaseType',
  'type', 'reviewFlag', 'label',
];

interface CsvRow {
  gameId: number;
  gameName: string;
  gameReleaseDate: string;
  gameReleaseStatus: string;
  candidateTitle: string;
  candidateSource: string;
  indexerName: string;
  matchScore: number;
  matched: boolean;
  reasons: string;
  size: string;
  sizeBytes: number | string;
  seeders: number | string;
  leechers: number | string;
  grabs: number | string;
  uploader: string;
  publishDate: string;
  releaseType: string;
  type: string;
  reviewFlag: string;
  label: string;
}

function rowToCsv(row: CsvRow): string {
  return CSV_HEADERS.map((h) => csvEscape((row as any)[h])).join(',');
}

// ── Fetch diverse PC games ───────────────────────────────────────────

async function getDiversePCGames(igdb: IGDBClient, targetCount: number): Promise<any[]> {
  const seen = new Set<number>();
  const games: any[] = [];

  function addGames(list: any[], label: string) {
    let added = 0;
    for (const g of list) {
      if (seen.has(g.id)) continue;
      if (!isPCGame(g.platforms)) continue;
      seen.add(g.id);
      (g as any)._source = label;
      games.push(g);
      added++;
    }
    console.log(`  [${label}] fetched ${list.length}, added ${added} PC games (total ${games.length})`);
  }

  // 1) Popular games (released, high ratings)
  console.log('Fetching popular games...');
  const popular = await igdb.getPopularGames(500);
  addGames(popular, 'popular');

  if (games.length >= targetCount) return games.slice(0, targetCount);

  // 2) Top rated
  console.log('Fetching top-rated games...');
  const topRated = await igdb.getTopRatedGames(500);
  addGames(topRated, 'top-rated');

  if (games.length >= targetCount) return games.slice(0, targetCount);

  // 3) Trending (recent releases)
  console.log('Fetching trending games...');
  const trending = await igdb.getTrendingGames(200);
  addGames(trending, 'trending');

  if (games.length >= targetCount) return games.slice(0, targetCount);

  // 4) Upcoming games (within 90 days) – likely unreleased
  console.log('Fetching upcoming games...');
  const upcoming = await igdb.getUpcomingGames(200);
  addGames(upcoming, 'upcoming');

  if (games.length >= targetCount) return games.slice(0, targetCount);

  // 5) Anticipated games (next 2 years, sorted by hypes) – unreleased
  console.log('Fetching anticipated games...');
  const anticipated = await igdb.getAnticipatedGames(200);
  addGames(anticipated, 'anticipated');

  if (games.length >= targetCount) return games.slice(0, targetCount);

  // 6) More popular with pagination
  if (games.length < targetCount) {
    console.log('Fetching more popular games (page 2)...');
    const morePop = await igdb.getPopularGamesPage(500, 500);
    addGames(morePop, 'popular-p2');
  }

  return games.slice(0, targetCount);
}

// ── Search functions ─────────────────────────────────────────────────

async function fetchFitGirlResults(agent: FitGirlAgent, gameName: string): Promise<Array<{ title: string; link?: string; excerpt: string }>> {
  try {
    const searchUrl = `${agent.baseUrl}/?s=${encodeURIComponent(gameName)}&x=0&y=0`;
    const response = await axios.get(searchUrl, {
      timeout: 45000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    const $ = cheerio.load(response.data);
    const isGamePost = (agent as any).isGamePost?.bind(agent) as (title: string) => boolean;
    return $('article').toArray().slice(0, 8)
      .map((el) => {
        const $a = $(el);
        return {
          title: $a.find('.entry-title a').text().trim(),
          link: $a.find('.entry-title a').attr('href'),
          excerpt: $a.find('.entry-content').text().trim(),
        };
      })
      .filter((i) => i.title && i.link)
      .filter((i) => (isGamePost ? isGamePost(i.title) : true));
  } catch (err) {
    console.warn(`[FitGirl] Search failed for "${gameName}": ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

async function fetchSteamRipResults(agent: SteamRipAgent, gameName: string): Promise<Array<{ title: string; link?: string }>> {
  try {
    const searchUrl = `${agent.baseUrl}/?s=${encodeURIComponent(gameName)}`;
    const response = await axios.get(searchUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    const $ = cheerio.load(response.data);
    return $('article').toArray().slice(0, 8)
      .map((el) => {
        const $a = $(el);
        return {
          title: $a.find('h2 a, h1 a, .entry-title a').first().text().trim(),
          link: $a.find('h2 a, h1 a, .entry-title a').first().attr('href'),
        };
      })
      .filter((i) => i.title && i.link);
  } catch (err) {
    console.warn(`[SteamRIP] Search failed for "${gameName}": ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

async function fetchProwlarrResultsRaw(agent: ProwlarrGameAgent, query: string): Promise<any[]> {
  try {
    return await agent.fetchSearchResults(query, 'PC');
  } catch (err) {
    console.warn(`[Prowlarr] Search failed for "${query}": ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function run() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 500;

  const settingsPath = findSettingsFile();
  if (!settingsPath) throw new Error('Settings file not found');

  const outputDir = path.dirname(settingsPath);
  const csvPath = path.join(outputDir, 'audit-500.csv');
  const progressPath = path.join(outputDir, 'audit-progress.json');

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  const igdbConfig = settings?.services?.igdb;
  if (!igdbConfig?.clientId || !igdbConfig?.clientSecret) {
    throw new Error('Missing IGDB clientId/clientSecret in settings.json');
  }

  const igdb = new IGDBClient({
    clientId: igdbConfig.clientId,
    clientSecret: igdbConfig.clientSecret,
  });

  // Agents
  const fitGirlAgent = new FitGirlAgent();
  const steamRipAgent = new SteamRipAgent();

  const prowlarrConfig = settings?.services?.prowlarr?.enabled
    ? settings.services.prowlarr
    : {
        enabled: process.env.PROWLARR_ENABLED === 'true',
        baseUrl: process.env.PROWLARR_URL || '',
        apiKey: process.env.PROWLARR_API_KEY || '',
      };
  const prowlarrAgent = prowlarrConfig?.enabled && prowlarrConfig.baseUrl && prowlarrConfig.apiKey
    ? new ProwlarrGameAgent({ baseUrl: prowlarrConfig.baseUrl, apiKey: prowlarrConfig.apiKey })
    : null;
  console.log(`Prowlarr: ${prowlarrAgent ? `enabled (${prowlarrConfig.baseUrl})` : 'disabled'}`);

  // Fetch games
  console.log(`\nFetching ${limit} diverse PC games (popular + top-rated + trending + upcoming + anticipated)...\n`);
  const seedGames = await getDiversePCGames(igdb, limit);
  console.log(`\nGot ${seedGames.length} unique PC games. Fetching detailed info...\n`);

  const detailedGames = await igdb.getGamesByIds(seedGames.map((g) => g.id));
  const gameMap = new Map(detailedGames.map((g) => [g.id, g]));
  const games = seedGames.map((g) => {
    const detailed = gameMap.get(g.id) || g;
    (detailed as any)._source = (g as any)._source;
    return detailed;
  }).filter(Boolean);

  console.log(`\nStarting audit of ${games.length} games across FitGirl, SteamRIP${prowlarrAgent ? ', Prowlarr' : ''}...\n`);

  // Init CSV
  fs.writeFileSync(csvPath, CSV_HEADERS.join(',') + '\n', 'utf-8');

  // Progress
  const startTime = Date.now();
  let totalCandidates = 0;
  let errorCount = 0;

  const progress: AuditProgress = {
    startedAt: new Date().toISOString(),
    totalGames: games.length,
    completedGames: 0,
    currentGame: '',
    percentComplete: 0,
    elapsedSeconds: 0,
    estimatedRemainingSeconds: 0,
    estimatedFinishAt: '',
    gamesPerMinute: 0,
    totalCandidatesFound: 0,
    errors: 0,
    status: 'running',
  };
  writeProgress(progressPath, progress);

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const now = Date.now();
    const elapsed = (now - startTime) / 1000;
    const gamesPerMin = i > 0 ? (i / elapsed) * 60 : 0;
    const remaining = gamesPerMin > 0 ? ((games.length - i) / gamesPerMin) * 60 : 0;
    const eta = new Date(now + remaining * 1000).toISOString();

    const releaseDate = game.first_release_date
      ? new Date(game.first_release_date * 1000).toISOString().split('T')[0]
      : 'unknown';
    const isReleased = game.first_release_date
      ? new Date(game.first_release_date * 1000) <= new Date()
      : false;
    const releaseStatus = !game.first_release_date ? 'no-date'
      : isReleased ? 'released'
      : 'unreleased';

    progress.completedGames = i;
    progress.currentGame = `[${i + 1}/${games.length}] ${game.name} (${releaseStatus})`;
    progress.percentComplete = Math.round((i / games.length) * 100);
    progress.elapsedSeconds = Math.round(elapsed);
    progress.estimatedRemainingSeconds = Math.round(remaining);
    progress.estimatedFinishAt = eta;
    progress.gamesPerMinute = Math.round(gamesPerMin * 10) / 10;
    progress.totalCandidatesFound = totalCandidates;
    progress.errors = errorCount;
    writeProgress(progressPath, progress);

    const etaStr = remaining > 60
      ? `${Math.round(remaining / 60)}m ${Math.round(remaining % 60)}s`
      : `${Math.round(remaining)}s`;

    console.log(`[${i + 1}/${games.length}] ${game.name} (${releaseStatus}) | ETA: ${etaStr} | ${Math.round(gamesPerMin * 10) / 10} games/min`);

    const steamDescription = await getSteamDescriptionFromIGDB(game).catch(() => null);
    const steamSizeBytes = await getSteamSizeFromIGDB(game).catch(() => null);

    const csvRows: string[] = [];

    // ── FitGirl ──
    try {
      const articles = await fetchFitGirlResults(fitGirlAgent, game.name);
      for (const article of articles) {
        const sizeInfo = helper.extractSizeInfo(article.title || article.excerpt || '');
        const matchResult = helper.matchWithIGDB(
          article.title,
          {
            igdbGame: game,
            steamDescription: steamDescription || undefined,
            steamSizeBytes: steamSizeBytes || undefined,
            candidateSizeBytes: sizeInfo?.bytes,
          },
          article.excerpt
        );

        const row: CsvRow = {
          gameId: game.id,
          gameName: game.name,
          gameReleaseDate: releaseDate,
          gameReleaseStatus: releaseStatus,
          candidateTitle: article.title,
          candidateSource: 'FitGirl',
          indexerName: 'FitGirl Repacks',
          matchScore: matchResult.score,
          matched: matchResult.matches,
          reasons: matchResult.reasons.join('|'),
          size: sizeInfo?.size || '',
          sizeBytes: sizeInfo?.bytes || '',
          seeders: '',
          leechers: '',
          grabs: '',
          uploader: 'FitGirl',
          publishDate: '',
          releaseType: 'repack',
          type: 'fitgirl',
          reviewFlag: '',
          label: '',
        };
        csvRows.push(rowToCsv(row));
        totalCandidates++;
      }
    } catch (err) {
      errorCount++;
      console.warn(`  [FitGirl] Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── SteamRIP ──
    try {
      const articles = await fetchSteamRipResults(steamRipAgent, game.name);
      for (const article of articles) {
        const matchResult = helper.matchWithIGDB(article.title, { igdbGame: game });

        const row: CsvRow = {
          gameId: game.id,
          gameName: game.name,
          gameReleaseDate: releaseDate,
          gameReleaseStatus: releaseStatus,
          candidateTitle: article.title,
          candidateSource: 'SteamRIP',
          indexerName: 'SteamRIP',
          matchScore: matchResult.score,
          matched: matchResult.matches,
          reasons: matchResult.reasons.join('|'),
          size: '',
          sizeBytes: '',
          seeders: '',
          leechers: '',
          grabs: '',
          uploader: '',
          publishDate: '',
          releaseType: 'rip',
          type: 'steamrip',
          reviewFlag: '',
          label: '',
        };
        csvRows.push(rowToCsv(row));
        totalCandidates++;
      }
    } catch (err) {
      errorCount++;
      console.warn(`  [SteamRIP] Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── Prowlarr ──
    if (prowlarrAgent) {
      try {
        const rawResults = await fetchProwlarrResultsRaw(prowlarrAgent, helper.clean(game.name));
        for (const result of rawResults) {
          const title = (result.releaseTitle || result.title || '').trim();
          if (!title) continue;

          const matchResult = helper.matchWithIGDB(title, {
            igdbGame: game,
            minMatchScore: 30,
            candidateSizeBytes: result.size,
          });

          const uploader = result.uploaderName || result.uploader || '';
          const indexer = result.indexer || 'Unknown';
          const publishDate = result.publishDate || '';

          // Detect release type from title
          const lowerTitle = title.toLowerCase();
          let releaseType = 'p2p';
          if (lowerTitle.includes('repack') || lowerTitle.includes('fitgirl') || lowerTitle.includes('dodi')) {
            releaseType = 'repack';
          } else if (lowerTitle.includes('rip') || lowerTitle.includes('gog')) {
            releaseType = 'rip';
          } else if (/\b(codex|cpy|skidrow|plaza|hoodlum|razor1911|flt|tenoke|runne)\b/i.test(title)) {
            releaseType = 'scene';
          }

          // Size formatting
          let sizeStr = '';
          if (result.size) {
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const idx = Math.floor(Math.log(result.size) / Math.log(1024));
            sizeStr = `${(result.size / Math.pow(1024, idx)).toFixed(2)} ${sizes[idx]}`;
          }

          const row: CsvRow = {
            gameId: game.id,
            gameName: game.name,
            gameReleaseDate: releaseDate,
            gameReleaseStatus: releaseStatus,
            candidateTitle: title,
            candidateSource: `Prowlarr (${indexer})`,
            indexerName: indexer,
            matchScore: matchResult.score,
            matched: matchResult.matches,
            reasons: matchResult.reasons.join('|'),
            size: sizeStr,
            sizeBytes: result.size || '',
            seeders: result.seeders ?? '',
            leechers: result.leechers ?? '',
            grabs: result.grabs ?? '',
            uploader: uploader,
            publishDate: publishDate,
            releaseType: releaseType,
            type: 'prowlarr',
            reviewFlag: '',
            label: '',
          };
          csvRows.push(rowToCsv(row));
          totalCandidates++;
        }
      } catch (err) {
        errorCount++;
        console.warn(`  [Prowlarr] Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Append rows to CSV
    if (csvRows.length > 0) {
      fs.appendFileSync(csvPath, csvRows.join('\n') + '\n', 'utf-8');
      console.log(`  → ${csvRows.length} candidates written`);
    } else {
      console.log(`  → 0 candidates`);
    }

    // Rate limit: 1.5s between games to be polite to FitGirl/SteamRIP
    if (i < games.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // Final progress
  const finalElapsed = (Date.now() - startTime) / 1000;
  progress.completedGames = games.length;
  progress.currentGame = 'Done';
  progress.percentComplete = 100;
  progress.elapsedSeconds = Math.round(finalElapsed);
  progress.estimatedRemainingSeconds = 0;
  progress.estimatedFinishAt = new Date().toISOString();
  progress.gamesPerMinute = Math.round((games.length / finalElapsed) * 60 * 10) / 10;
  progress.totalCandidatesFound = totalCandidates;
  progress.errors = errorCount;
  progress.status = 'completed';
  writeProgress(progressPath, progress);

  const minutes = Math.floor(finalElapsed / 60);
  const seconds = Math.round(finalElapsed % 60);
  console.log(`\n✅ Audit complete!`);
  console.log(`   Games: ${games.length}`);
  console.log(`   Candidates: ${totalCandidates}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Duration: ${minutes}m ${seconds}s`);
  console.log(`   CSV: ${csvPath}`);
  console.log(`   Progress: ${progressPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
