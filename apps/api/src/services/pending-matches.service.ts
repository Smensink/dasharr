import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PendingMatch, PendingMatchGroup, GameDownloadCandidate } from '@dasharr/shared-types';
import { logger } from '../utils/logger';

const CLEANUP_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

class PendingMatchesService {
  private matches: PendingMatch[] = [];
  private filePath: string;

  constructor() {
    const dataDir = process.env.DASHARR_DATA_DIR || '/app/data';
    this.filePath = path.join(dataDir, 'pending-matches.json');
    this.load();
    this.cleanup();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        this.matches = JSON.parse(data);
        logger.info(`[PendingMatches] Loaded ${this.matches.length} pending matches`);
      }
    } catch (error) {
      logger.warn(`[PendingMatches] Failed to load: ${error}`);
      this.matches = [];
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.matches, null, 2), 'utf-8');
    } catch (error) {
      logger.error(`[PendingMatches] Failed to save: ${error}`);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const before = this.matches.length;
    this.matches = this.matches.filter(m => {
      if (m.status !== 'pending' && m.resolvedAt) {
        return now - new Date(m.resolvedAt).getTime() < CLEANUP_AGE_MS;
      }
      return true;
    });
    if (this.matches.length < before) {
      logger.info(`[PendingMatches] Cleaned up ${before - this.matches.length} old resolved matches`);
      this.save();
    }
  }

  addMatches(
    igdbId: number,
    gameName: string,
    coverUrl: string | undefined,
    candidates: GameDownloadCandidate[],
    source: string
  ): number {
    let added = 0;
    for (const candidate of candidates) {
      // Dedupe by igdbId + title + source
      const exists = this.matches.some(
        m => m.igdbId === igdbId &&
          m.candidate.title === candidate.title &&
          m.candidate.source === candidate.source &&
          m.status === 'pending'
      );
      if (exists) continue;

      this.matches.push({
        id: crypto.randomUUID(),
        igdbId,
        gameName,
        coverUrl,
        candidate,
        status: 'pending',
        foundAt: new Date().toISOString(),
        source,
      });
      added++;
    }

    if (added > 0) {
      logger.info(`[PendingMatches] Added ${added} matches for ${gameName} (${source})`);
      this.save();
    }
    return added;
  }

  getPendingMatches(): PendingMatch[] {
    return this.matches.filter(m => m.status === 'pending');
  }

  getPendingMatchesGrouped(): PendingMatchGroup[] {
    const pending = this.getPendingMatches();
    const groups = new Map<number, PendingMatchGroup>();

    for (const match of pending) {
      let group = groups.get(match.igdbId);
      if (!group) {
        group = {
          igdbId: match.igdbId,
          gameName: match.gameName,
          coverUrl: match.coverUrl,
          matches: [],
        };
        groups.set(match.igdbId, group);
      }
      group.matches.push(match);
    }

    return Array.from(groups.values());
  }

  getPendingCount(): number {
    return this.matches.filter(m => m.status === 'pending').length;
  }

  getPendingCountForGame(igdbId: number): number {
    return this.matches.filter(
      (m) => m.igdbId === igdbId && m.status === 'pending'
    ).length;
  }

  approveMatch(matchId: string): PendingMatch | null {
    const match = this.matches.find(m => m.id === matchId && m.status === 'pending');
    if (!match) return null;

    match.status = 'approved';
    match.resolvedAt = new Date().toISOString();
    this.save();
    logger.info(`[PendingMatches] Approved: ${match.candidate.title} for ${match.gameName}`);
    return match;
  }

  rejectMatch(matchId: string): PendingMatch | null {
    const match = this.matches.find(m => m.id === matchId && m.status === 'pending');
    if (!match) return null;

    match.status = 'rejected';
    match.resolvedAt = new Date().toISOString();
    this.save();
    logger.info(`[PendingMatches] Rejected: ${match.candidate.title} for ${match.gameName}`);
    return match;
  }

  rejectAllForGame(igdbId: number): number {
    let count = 0;
    const now = new Date().toISOString();
    for (const match of this.matches) {
      if (match.igdbId === igdbId && match.status === 'pending') {
        match.status = 'rejected';
        match.resolvedAt = now;
        count++;
      }
    }
    if (count > 0) {
      this.save();
      logger.info(`[PendingMatches] Rejected ${count} matches for game ${igdbId}`);
    }
    return count;
  }
}

export const pendingMatchesService = new PendingMatchesService();
