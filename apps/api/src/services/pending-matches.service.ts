import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PendingMatch, PendingMatchGroup, GameDownloadCandidate } from '@dasharr/shared-types';
import { logger } from '../utils/logger';

const CLEANUP_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

class PendingMatchesService {
  private matches: PendingMatch[] = [];
  private filePath: string;
  private rejectedFilePath: string;
  private rejectedFingerprints: Set<string> = new Set();

  constructor() {
    const dataDir = process.env.DASHARR_DATA_DIR || '/app/data';
    this.filePath = path.join(dataDir, 'pending-matches.json');
    this.rejectedFilePath = path.join(dataDir, 'pending-matches-rejected.json');
    this.load();
    this.loadRejectedFingerprints();
    this.seedRejectedFingerprintsFromMatches();
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

  private normalizeFingerprintPart(value: string): string {
    return value
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getFingerprint(igdbId: number, candidate: GameDownloadCandidate): string {
    const title = this.normalizeFingerprintPart(candidate.title || '');
    const source = this.normalizeFingerprintPart(candidate.source || '');
    return `${igdbId}|${source}|${title}`;
  }

  private loadRejectedFingerprints(): void {
    try {
      if (!fs.existsSync(this.rejectedFilePath)) return;
      const raw = fs.readFileSync(this.rejectedFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as string[];
      if (!Array.isArray(parsed)) return;
      this.rejectedFingerprints = new Set(parsed);
      logger.info(
        `[PendingMatches] Loaded ${this.rejectedFingerprints.size} rejected fingerprints`
      );
    } catch (error) {
      logger.warn(`[PendingMatches] Failed to load rejected fingerprints: ${error}`);
      this.rejectedFingerprints = new Set();
    }
  }

  private saveRejectedFingerprints(): void {
    try {
      const dir = path.dirname(this.rejectedFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.rejectedFilePath,
        JSON.stringify(Array.from(this.rejectedFingerprints), null, 2),
        'utf-8'
      );
    } catch (error) {
      logger.error(`[PendingMatches] Failed to save rejected fingerprints: ${error}`);
    }
  }

  private recordRejectedFingerprint(igdbId: number, candidate: GameDownloadCandidate): void {
    const fp = this.getFingerprint(igdbId, candidate);
    this.rejectedFingerprints.add(fp);
  }

  private seedRejectedFingerprintsFromMatches(): void {
    let added = 0;
    for (const match of this.matches) {
      if (match.status !== 'rejected') continue;
      const fp = this.getFingerprint(match.igdbId, match.candidate);
      if (!this.rejectedFingerprints.has(fp)) {
        this.rejectedFingerprints.add(fp);
        added++;
      }
    }
    if (added > 0) {
      this.saveRejectedFingerprints();
      logger.info(
        `[PendingMatches] Seeded ${added} rejected fingerprints from historical matches`
      );
    }
  }

  isPreviouslyRejected(igdbId: number, candidate: GameDownloadCandidate): boolean {
    return this.rejectedFingerprints.has(this.getFingerprint(igdbId, candidate));
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
    let skippedRejected = 0;
    for (const candidate of candidates) {
      if (this.isPreviouslyRejected(igdbId, candidate)) {
        skippedRejected++;
        continue;
      }

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
    if (skippedRejected > 0) {
      logger.info(
        `[PendingMatches] Skipped ${skippedRejected} previously rejected matches for ${gameName}`
      );
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
    this.recordRejectedFingerprint(match.igdbId, match.candidate);
    this.save();
    this.saveRejectedFingerprints();
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
        this.recordRejectedFingerprint(match.igdbId, match.candidate);
        count++;
      }
    }
    if (count > 0) {
      this.save();
      this.saveRejectedFingerprints();
      logger.info(`[PendingMatches] Rejected ${count} matches for game ${igdbId}`);
    }
    return count;
  }
}

export const pendingMatchesService = new PendingMatchesService();
