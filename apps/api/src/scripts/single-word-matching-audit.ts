import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { IGDBClient } from '../clients/IGDBClient';
import { getSteamDescriptionFromIGDB, getSteamSizeFromIGDB } from '../utils/steam';
import { BaseGameSearchAgent } from '../services/games/search-agents/BaseGameSearchAgent';
import { FitGirlAgent } from '../services/games/search-agents/FitGirlAgent';
import { SteamRipAgent } from '../services/games/search-agents/SteamRipAgent';
import { ProwlarrGameAgent } from '../services/games/search-agents/ProwlarrGameAgent';
import { DODIAgent } from '../services/games/search-agents/DODIAgent';


const COMMON_EXTRA_WORDS = new Set([
  'edition', 'repack', 'goty', 'complete', 'deluxe', 'ultimate', 'enhanced',
  'remastered', 'definitive', 'anniversary', 'gold', 'platinum', 'collection',
  'dlc', 'dlcs', 'all', 'bonus', 'content', 'pack', 'bundle',
  'v', 'version', 'update', 'patch', 'build', 'release',
  'ost', 'soundtrack', 'artbook', 'manual', 'guide',
  'fix', 'crack', 'bypass', 'windows', 'steam', 'gog', 'epic',
]);

class MatchHelper extends BaseGameSearchAgent {
  readonly name = 'Helper';
  readonly baseUrl = '';
  readonly requiresAuth = false;
  readonly priority = 0;
  readonly releaseTypes: ('repack' | 'rip' | 'scene' | 'p2p')[] = [];

  isAvailable(): boolean {
    return false;
  }

  async search(): Promise<any> {
    throw new Error('Not implemented');
  }

  async getDownloadLinks(): Promise<Partial<any>[]> {
    throw new Error('Not implemented');
  }

  public clean(name: string): string {
    return this.cleanGameName(name);
  }

  public normalize(name: string): string {
    return this.normalizeGameName(name);
  }

  public extractSizeInfo(text: string): { size: string; bytes?: number } | undefined {
    return this.extractSize(text);
  }
}

const helper = new MatchHelper();

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

function isSingleWordTitle(name: string): boolean {
  return name.trim().split(/\s+/).length === 1;
}

function isPCGame(platforms: Array<{ name?: string; abbreviation?: string }> | undefined): boolean {
  if (!platforms || platforms.length === 0) return false;
  return platforms.some((platform) => {
    const name = platform.name || '';
    const abbr = platform.abbreviation || '';
    return name.includes('PC') || abbr === 'PC';
  });
}

function getExtraWords(title: string, gameName: string): string[] {
  const cleanTitle = helper.clean(title);
  const cleanGame = helper.clean(gameName);
  const titleWords = cleanTitle.split(/\s+/).filter((w) => w.length > 2);
  const gameWords = cleanGame.split(/\s+/).filter((w) => w.length > 2);
  const extraWords = titleWords
    .filter((tw) => !gameWords.some((gw) => tw.includes(gw) || gw.includes(tw)))
    .filter((w) => w.length > 3)
    .filter((w) => !/^v?\d+(?:\.\d+)*$/i.test(w))
    .filter((w) => !COMMON_EXTRA_WORDS.has(w.toLowerCase()));
  return extraWords;
}

function likelyFalsePositive(title: string, gameName: string, score: number, threshold: number): boolean {
  const cleanGame = helper.clean(gameName);
  const gameWordCount = cleanGame.split(/\s+/).filter(Boolean).length;
  const extraWords = getExtraWords(title, gameName);
  // Single-word titles: any extra word is suspicious
  // Multi-word titles: 2+ extra words is suspicious
  const extraThreshold = gameWordCount === 1 ? 1 : 2;
  return score >= threshold && extraWords.length >= extraThreshold;
}

function likelyFalseNegative(title: string, gameName: string, score: number, threshold: number): boolean {
  if (score >= threshold) return false;
  const cleanTitle = helper.clean(title);
  const cleanGame = helper.clean(gameName);
  if (!cleanTitle.startsWith(cleanGame) && !cleanTitle.includes(cleanGame)) return false;
  const extraWords = getExtraWords(title, gameName);
  return extraWords.length === 0;
}

async function getPopularPCGames(igdb: IGDBClient, limit: number, singleWordOnly: boolean): Promise<any[]> {
  const popular = await igdb.getPopularGames(Math.max(200, limit * 3));
  const seen = new Set<number>();
  let filtered = popular
    .filter((game) => {
      if (seen.has(game.id)) return false;
      seen.add(game.id);
      return isPCGame(game.platforms) && (!singleWordOnly || isSingleWordTitle(game.name));
    });

  if (filtered.length < limit) {
    const topRated = await igdb.getTopRatedGames(Math.max(150, limit * 2));
    const combined = [...popular, ...topRated];
    filtered = combined
      .filter((game) => {
        if (seen.has(game.id)) return false;
        seen.add(game.id);
        return isPCGame(game.platforms) && (!singleWordOnly || isSingleWordTitle(game.name));
      });
  }

  return filtered.slice(0, limit);
}

async function fetchFitGirlResults(agent: FitGirlAgent, gameName: string): Promise<Array<{ title: string; link?: string; excerpt: string }>> {
  const searchUrl = `${agent.baseUrl}/?s=${encodeURIComponent(gameName)}&x=0&y=0`;
  const response = await axios.get(searchUrl, {
    timeout: 45000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
    },
  });
  const $ = cheerio.load(response.data);
  const articles = $('article').toArray().slice(0, 8);
  const isGamePost = (agent as any).isGamePost?.bind(agent) as (title: string) => boolean;

  return articles
    .map((element) => {
      const $article = $(element);
      const title = $article.find('.entry-title a').text().trim();
      const link = $article.find('.entry-title a').attr('href');
      const excerpt = $article.find('.entry-content').text().trim();
      return { title, link, excerpt };
    })
    .filter((item) => item.title && item.link)
    .filter((item) => (isGamePost ? isGamePost(item.title) : true));
}

async function fetchFitGirlDescription(agent: FitGirlAgent, link: string, excerpt: string): Promise<string> {
  const fetchFullDescription = (agent as any).fetchFullDescription?.bind(agent) as (url: string) => Promise<string>;
  if (!fetchFullDescription) return excerpt;
  try {
    return await fetchFullDescription(link);
  } catch {
    return excerpt;
  }
}

async function fetchSteamRipResults(agent: SteamRipAgent, gameName: string): Promise<Array<{ title: string; link?: string }>> {
  const searchUrl = `${agent.baseUrl}/?s=${encodeURIComponent(gameName)}`;
  try {
    const response = await axios.get(searchUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
      },
    });
    const $ = cheerio.load(response.data);
    return $('article')
      .toArray()
      .slice(0, 8)
      .map((element) => {
        const $article = $(element);
        const title = $article.find('h2 a, h1 a, .entry-title a').first().text().trim();
        const link = $article.find('h2 a, h1 a, .entry-title a').first().attr('href');
        return { title, link };
      })
      .filter((item) => item.title && item.link);
  } catch (error) {
    console.warn(`[SteamRIP] Search failed for "${gameName}": ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}


async function fetchDodiResults(agent: DODIAgent, gameName: string): Promise<Array<{ title: string; link?: string; size?: string; sizeBytes?: number }>> {
  const result = await agent.search(gameName);
  if (!result.success) return [];
  return (result.candidates || []).map((candidate: any) => ({
    title: candidate.title,
    link: candidate.infoUrl,
    size: candidate.size,
    sizeBytes: candidate.sizeBytes,
  }));
}

async function fetchProwlarrResults(agent: ProwlarrGameAgent, query: string): Promise<any[]> {
  const fetchSearchResults = (agent as any).fetchSearchResults?.bind(agent) as (q: string, platform?: string) => Promise<any[]>;
  if (!fetchSearchResults) return [];
  try {
    return await fetchSearchResults(query, 'PC');
  } catch (error) {
    console.warn(`[Prowlarr] Search failed for "${query}": ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function extractProwlarrTitle(result: any): string | null {
  if (result.releaseTitle && result.releaseTitle.trim()) return result.releaseTitle.trim();
  if (result.title && result.title.trim()) return result.title.trim();
  return null;
}

async function run() {
  const skipDodi = process.argv.includes('--skip-dodi');
  const singleWordOnly = process.argv.includes('--single-word-only');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : (singleWordOnly ? 25 : 50);
  const settingsPath = findSettingsFile();
  if (!settingsPath) {
    throw new Error('Settings file not found (searched for data/settings.json)');
  }

  const outputDir = path.dirname(settingsPath);
  const filePrefix = singleWordOnly ? 'single-word-matching-audit' : 'matching-audit';
  const outputPath = path.join(outputDir, `${filePrefix}.json`);
  const outputMdPath = path.join(outputDir, `${filePrefix}.md`);

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  const igdbConfig = settings?.services?.igdb;
  if (!igdbConfig?.clientId || !igdbConfig?.clientSecret) {
    throw new Error('Missing IGDB clientId/clientSecret in settings.json');
  }

  const igdb = new IGDBClient({
    clientId: igdbConfig.clientId,
    clientSecret: igdbConfig.clientSecret,
  });

  console.log(`Fetching ${limit} popular PC games${singleWordOnly ? ' (single-word only)' : ''}...`);
  const seedGames = await getPopularPCGames(igdb, limit, singleWordOnly);
  const detailedGames = await igdb.getGamesByIds(seedGames.map((game) => game.id));
  const gameMap = new Map(detailedGames.map((game) => [game.id, game]));
  const games = seedGames.map((game) => gameMap.get(game.id) || game).filter(Boolean);

  const fitGirlAgent = new FitGirlAgent();
  const steamRipAgent = new SteamRipAgent();
  const flaresolverrConfig = settings?.services?.flaresolverr;
  const dodiAgent = flaresolverrConfig?.enabled
    ? new DODIAgent({ flaresolverrUrl: flaresolverrConfig.baseUrl, searchOnly: true })
    : new DODIAgent({ searchOnly: true });
  const prowlarrConfig = settings?.services?.prowlarr;
  const prowlarrAgent = prowlarrConfig?.enabled
    ? new ProwlarrGameAgent({ baseUrl: prowlarrConfig.baseUrl, apiKey: prowlarrConfig.apiKey })
    : null;

  const results: any[] = [];
  const falsePositives: any[] = [];
  const falseNegatives: any[] = [];

  for (const game of games) {
    const entry: any = {
      igdbId: game.id,
      name: game.name,
      platforms: game.platforms?.map((p: any) => p.name) || [],
      agents: {},
    };

    const steamDescription = await getSteamDescriptionFromIGDB(game);
    const steamSizeBytes = await getSteamSizeFromIGDB(game);

    // FitGirl
    const fitGirlArticles = await fetchFitGirlResults(fitGirlAgent, game.name);
    const fitGirlMatches: any[] = [];
    for (const article of fitGirlArticles) {
      const description = await fetchFitGirlDescription(fitGirlAgent, article.link!, article.excerpt);
      const sizeInfo = helper.extractSizeInfo(article.title || article.excerpt || '');
      const matchResult = helper.matchWithIGDB(
        article.title,
        {
          igdbGame: game,
          steamDescription: steamDescription || undefined,
          steamSizeBytes: steamSizeBytes || undefined,
          candidateSizeBytes: sizeInfo?.bytes,
        },
        description
      );

      fitGirlMatches.push({
        title: article.title,
        score: matchResult.score,
        matched: matchResult.matches,
        reasons: matchResult.reasons,
      });

      if (likelyFalsePositive(article.title, game.name, matchResult.score, 70)) {
        falsePositives.push({
          agent: 'FitGirl',
          game: game.name,
          title: article.title,
          score: matchResult.score,
          reasons: matchResult.reasons,
        });
      }

      if (likelyFalseNegative(article.title, game.name, matchResult.score, 70)) {
        falseNegatives.push({
          agent: 'FitGirl',
          game: game.name,
          title: article.title,
          score: matchResult.score,
          reasons: matchResult.reasons,
        });
      }
    }

    fitGirlMatches.sort((a, b) => b.score - a.score);
    entry.agents.fitgirl = {
      best: fitGirlMatches[0] || null,
      matches: fitGirlMatches,
    };

    // SteamRIP
    const steamRipArticles = await fetchSteamRipResults(steamRipAgent, game.name);
    const steamRipMatches: any[] = [];
    for (const article of steamRipArticles) {
      const matchResult = helper.matchWithIGDB(article.title, {
        igdbGame: game,
      });

      steamRipMatches.push({
        title: article.title,
        score: matchResult.score,
        matched: matchResult.matches,
        reasons: matchResult.reasons,
      });

      if (likelyFalsePositive(article.title, game.name, matchResult.score, 70)) {
        falsePositives.push({
          agent: 'SteamRIP',
          game: game.name,
          title: article.title,
          score: matchResult.score,
          reasons: matchResult.reasons,
        });
      }

      if (likelyFalseNegative(article.title, game.name, matchResult.score, 70)) {
        falseNegatives.push({
          agent: 'SteamRIP',
          game: game.name,
          title: article.title,
          score: matchResult.score,
          reasons: matchResult.reasons,
        });
      }
    }

    steamRipMatches.sort((a, b) => b.score - a.score);
    entry.agents.steamrip = {
      best: steamRipMatches[0] || null,
      matches: steamRipMatches,
    };

    // DODI
    const dodiMatches: any[] = [];
    if (!skipDodi) {
      const dodiArticles = await fetchDodiResults(dodiAgent, game.name);
      for (const article of dodiArticles) {
      const matchResult = helper.matchWithIGDB(article.title, {
        igdbGame: game,
        steamDescription: steamDescription || undefined,
        steamSizeBytes: steamSizeBytes || undefined,
        candidateSizeBytes: article.sizeBytes,
      });

      dodiMatches.push({
        title: article.title,
        score: matchResult.score,
        matched: matchResult.matches,
        reasons: matchResult.reasons,
      });

      if (likelyFalsePositive(article.title, game.name, matchResult.score, 70)) {
        falsePositives.push({
          agent: 'DODI',
          game: game.name,
          title: article.title,
          score: matchResult.score,
          reasons: matchResult.reasons,
        });
      }

      if (likelyFalseNegative(article.title, game.name, matchResult.score, 70)) {
        falseNegatives.push({
          agent: 'DODI',
          game: game.name,
          title: article.title,
          score: matchResult.score,
          reasons: matchResult.reasons,
        });
      }
    }

    }

    dodiMatches.sort((a, b) => b.score - a.score);
    entry.agents.dodi = {
      best: dodiMatches[0] || null,
      matches: dodiMatches,
      skipped: skipDodi || undefined,
    };

    // Prowlarr
    if (prowlarrAgent) {
      const prowlarrResults = await fetchProwlarrResults(prowlarrAgent, helper.clean(game.name));
      const prowlarrMatches: any[] = [];
      for (const result of prowlarrResults) {
        const title = extractProwlarrTitle(result);
        if (!title) continue;
        const matchResult = helper.matchWithIGDB(title, {
          igdbGame: game,
          minMatchScore: 30,
          candidateSizeBytes: result.size,
        });
        prowlarrMatches.push({
          title,
          score: matchResult.score,
          matched: matchResult.matches,
          reasons: matchResult.reasons,
        });

        if (likelyFalsePositive(title, game.name, matchResult.score, 30)) {
          falsePositives.push({
            agent: 'Prowlarr',
            game: game.name,
            title,
            score: matchResult.score,
            reasons: matchResult.reasons,
          });
        }

        if (likelyFalseNegative(title, game.name, matchResult.score, 30)) {
          falseNegatives.push({
            agent: 'Prowlarr',
            game: game.name,
            title,
            score: matchResult.score,
            reasons: matchResult.reasons,
          });
        }
      }

      prowlarrMatches.sort((a, b) => b.score - a.score);
      entry.agents.prowlarr = {
        best: prowlarrMatches[0] || null,
        matches: prowlarrMatches.slice(0, 30),
        totalResults: prowlarrMatches.length,
      };
    } else {
      entry.agents.prowlarr = { skipped: true };
    }

    results.push(entry);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    criteria: `IGDB popular${singleWordOnly ? ' single-word' : ''} titles, PC only, limit ${limit}`,
    games: results,
    falsePositives,
    falseNegatives,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  const lines: string[] = [];
  lines.push(`# ${singleWordOnly ? 'Single-Word ' : ''}Matching Audit`);
  lines.push('');
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push('');
  lines.push('## False Positives (best guess)');
  if (falsePositives.length === 0) {
    lines.push('- None flagged');
  } else {
    for (const fp of falsePositives.slice(0, 50)) {
      lines.push(`- [${fp.agent}] ${fp.game} -> "${fp.title}" (score ${fp.score})`);
    }
  }
  lines.push('');
  lines.push('## False Negatives (best guess)');
  if (falseNegatives.length === 0) {
    lines.push('- None flagged');
  } else {
    for (const fn of falseNegatives.slice(0, 50)) {
      lines.push(`- [${fn.agent}] ${fn.game} -> "${fn.title}" (score ${fn.score})`);
    }
  }

  fs.writeFileSync(outputMdPath, lines.join('\n'), 'utf-8');

  console.log(`Wrote ${outputPath}`);
  console.log(`Wrote ${outputMdPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
