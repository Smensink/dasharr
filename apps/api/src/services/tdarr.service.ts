import fs from 'fs';
import path from 'path';
import { TdarrClient, TdarrCrudRequest } from '../clients/TdarrClient';
import { CacheService } from './cache.service';
import { ServiceConfig } from '../config/services.config';
import { logger } from '../utils/logger';

export interface TdarrWorkerLimits {
  transcodecpu?: number;
  transcodegpu?: number;
  healthcheckcpu?: number;
  healthcheckgpu?: number;
}

export interface TdarrNodeSummary {
  id: string;
  name: string;
  workerLimits: TdarrWorkerLimits;
  scheduleEnabled?: boolean;
  nodePaused?: boolean;
  priority?: number;
}

export interface TdarrQueueItem {
  id: string;
  title: string;
  file: string;
  status: string;
  workerType?: string;
  nodeId?: string;
  nodeName?: string;
  start?: number;
  currentPlugin?: string;
}

export interface TdarrJobSummary {
  id: string;
  title: string;
  file: string;
  status: string;
  start?: number;
  end?: number;
  duration?: number;
  nodeId?: string;
  nodeName?: string;
  workerGenus?: string;
  type?: string;
  currentPlugin?: string;
  failureStep?: string;
  jobId?: string;
  jobFileId?: string;
  footprintId?: string;
  logText?: string;
}

export interface TdarrOverview {
  queue: TdarrQueueItem[];
  activeJobs: TdarrQueueItem[];
  successJobs: TdarrJobSummary[];
  failedJobs: TdarrJobSummary[];
  stats: {
    transcodesPerHour: number;
    transcodesLastHour: number;
    windowHours: number;
    totalTranscodes?: number;
    totalHealthChecks?: number;
    queueSize: number;
    activeCount: number;
    successCount: number;
    failureCount: number;
  };
  nodes: TdarrNodeSummary[];
  updatedAt: number;
}

const DEFAULT_WINDOW_HOURS = 6;
const FILE_AGE_KEYWORDS = [
  'file age',
  'age check',
  'minimum age',
  'not old enough',
  'too new',
  'age limit',
  'file is too young',
  'too young',
];
const FILE_AGE_RETRY_MINUTES = (() => {
  const raw = Number(process.env.TDARR_FILE_AGE_RETRY_MINUTES);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 60;
})();

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function extractArrayResponse<T>(response: any): T[] {
  if (!response) return [];
  if (Array.isArray(response)) return response as T[];
  if (Array.isArray(response.data)) return response.data as T[];
  if (Array.isArray(response.nodes)) return response.nodes as T[];
  if (response.data && Array.isArray(response.data.nodes)) return response.data.nodes as T[];
  if (Array.isArray(response.docs)) return response.docs as T[];
  if (Array.isArray(response.results)) return response.results as T[];
  if (Array.isArray(response.items)) return response.items as T[];
  if (response.data && Array.isArray(response.data.data)) return response.data.data as T[];
  if (response.data && Array.isArray(response.data.items)) return response.data.items as T[];
  if (response.data && typeof response.data === 'object') return [response.data as T];
  if (typeof response === 'object') return [response as T];
  return [];
}

function extractObjectResponse<T>(response: any): T | null {
  if (!response) return null;
  if (response.data && !Array.isArray(response.data)) return response.data as T;
  if (response.result && !Array.isArray(response.result)) return response.result as T;
  return response as T;
}

function getFileTitle(filePath: string, fallback?: string): string {
  if (fallback) return fallback;
  if (!filePath) return 'Unknown';
  return path.basename(filePath).replace(/\.[^/.]+$/, '');
}

function getCurrentPlugin(flowPluginHandler: any): string | undefined {
  const states = safeArray<any>(flowPluginHandler?.flowPluginStates as any);
  let active: any | null = null;
  for (const state of states) {
    const runs = safeArray<any>(state?.runs as any);
    if (runs.length === 0) continue;
    const last = runs[runs.length - 1] as any;
    if (last?.startTime && !last?.successTime && !last?.error) {
      active = state;
      break;
    }
  }

  const extractName = (state: any) =>
    state?.name || state?.pluginName || state?.id;

  if (active) return extractName(active);

  let latestTime = 0;
  let latestState: any | null = null;
  for (const state of states) {
    const runs = safeArray<any>(state?.runs as any);
    if (runs.length === 0) continue;
    const last = runs[runs.length - 1] as any;
    const t = last?.successTime || last?.errorTime || last?.startTime || 0;
    if (t > latestTime) {
      latestTime = t;
      latestState = state;
    }
  }
  return latestState ? extractName(latestState) : undefined;
}

function extractFailureStepFromLog(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return undefined;

  const pluginPattern = /(flow plugin|plugin|running plugin|starting plugin|plugin name)\s*[:-]\s*(.+)$/i;
  let lastPlugin: string | undefined;
  for (const line of lines) {
    const match = line.match(pluginPattern);
    if (match) {
      lastPlugin = match[2].trim();
    }
  }

  let lastError: string | undefined;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (/(error|failed|failure|exception)/i.test(line)) {
      lastError = line;
      break;
    }
  }

  const cleaned = (value?: string) =>
    value ? value.replace(/^[-:]+/, '').trim().slice(0, 120) : undefined;

  return cleaned(lastPlugin) || cleaned(lastError);
}

export class TdarrService {
  private client: TdarrClient;
  private cacheService: CacheService;
  private serviceName = 'tdarr';
  private localDbPath?: string;
  private sqlModule?: any;
  private localDbCache?: { db: any; mtimeMs: number; loadedAt: number };
  private fileAgeRetryMinutes = FILE_AGE_RETRY_MINUTES;

  constructor(config: ServiceConfig, cacheService: CacheService) {
    this.client = new TdarrClient(config);
    this.cacheService = cacheService;
    this.localDbPath = process.env.TDARR_LOCAL_DB_PATH || undefined;
  }

  async getOverview(): Promise<TdarrOverview> {
    const cacheKey = `${this.serviceName}:overview`;
    const cached = await this.cacheService.get<TdarrOverview>(cacheKey);
    if (cached) {
      return cached;
    }

    const [nodes, staged, jobs, stats] = await Promise.all([
      this.getNodes(),
      this.getStagedItems(),
      this.getRecentJobs(),
      this.getStatistics(),
    ]);

    const nodeNameById = new Map<string, string>();
    for (const node of nodes) {
      nodeNameById.set(node.id, node.name);
    }

    const queueItems: TdarrQueueItem[] = staged.map((item: any) => {
      const filePath =
        item?.originalLibraryFile?.file || item?.file || item?._id || '';
      return {
        id: item?._id || item?.job?.jobId || filePath,
        title: getFileTitle(
          filePath,
          item?.originalLibraryFile?.fileNameWithoutExtension
        ),
        file: filePath,
        status: item?.status || 'queued',
        workerType: item?.workerType,
        nodeId: item?.nodeID,
        nodeName: nodeNameById.get(item?.nodeID || '') || item?.nodeID,
        start: item?.start,
        currentPlugin: getCurrentPlugin(item?.flowPluginHandler),
      };
    });

    const activeJobs = queueItems.filter((item) =>
      String(item.status || '').toLowerCase().includes('process')
    );
    const queuedJobs = queueItems.filter((item) => !activeJobs.includes(item));

    const successJobs: TdarrJobSummary[] = [];
    const failedJobs: TdarrJobSummary[] = [];

    for (const job of jobs) {
      const status = String(job?.status || '').toLowerCase();
      const isSuccess = status.includes('success');
      const isFailure = status.includes('error') || status.includes('fail');

      if (!isSuccess && !isFailure) continue;

      const filePath = job?.file || '';
      const jobId = job?.job?.jobId || job?._id;
      const summary: TdarrJobSummary = {
        id: jobId || filePath,
        title: getFileTitle(filePath),
        file: filePath,
        status: job?.status || 'Unknown',
        start: job?.start,
        end: job?.end,
        duration: job?.duration,
        nodeId: job?.nodeID,
        nodeName:
          job?.nodeNames?.[0] ||
          nodeNameById.get(job?.nodeID || '') ||
          job?.nodeID,
        workerGenus: job?.workerGenus,
        type: job?.job?.type,
        jobId,
        jobFileId: job?.job?.fileId,
        footprintId: job?.job?.footprintId,
      };

      if (isSuccess) {
        successJobs.push(summary);
      } else {
        failedJobs.push(summary);
      }
    }

    await this.enrichFailureSteps(failedJobs.slice(0, 10));
    await this.handleFileAgeFailures(failedJobs);

    const transcodesLastHour = this.countRecentTranscodes(jobs, 1);
    const transcodesPerHour = this.countRecentTranscodes(
      jobs,
      DEFAULT_WINDOW_HOURS
    );

    const overview: TdarrOverview = {
      queue: queuedJobs,
      activeJobs,
      successJobs,
      failedJobs,
      stats: {
        transcodesPerHour:
          DEFAULT_WINDOW_HOURS > 0
            ? transcodesPerHour / DEFAULT_WINDOW_HOURS
            : transcodesPerHour,
        transcodesLastHour,
        windowHours: DEFAULT_WINDOW_HOURS,
        totalTranscodes: stats?.totalTranscodeCount,
        totalHealthChecks: stats?.totalHealthCheckCount,
        queueSize: queueItems.length,
        activeCount: activeJobs.length,
        successCount: successJobs.length,
        failureCount: failedJobs.length,
      },
      nodes,
      updatedAt: Date.now(),
    };

    await this.cacheService.set(cacheKey, overview, 10);
    return overview;
  }

  async updateWorkerLimit(args: {
    nodeId: string;
    workerType: string;
    target: number;
  }): Promise<void> {
    const nodes = await this.getNodes();
    const node =
      nodes.find((item) => item.id === args.nodeId) ||
      nodes.find((item) => item.name === args.nodeId);
    const current = node?.workerLimits?.[args.workerType] ?? 0;
    const delta = args.target - current;

    if (delta === 0) return;

    const direction = delta > 0 ? 'increase' : 'decrease';
    const steps = Math.abs(delta);
    let nodeId = node?.id || args.nodeId;

    if (nodeId === args.nodeId && !nodes.find((item) => item.id === nodeId)) {
      const jobs = await this.getRecentJobs();
      const match = jobs.find((job) =>
        safeArray(job?.nodeNames).includes(args.nodeId)
      );
      if (match?.nodeID) {
        nodeId = match.nodeID;
      }
    }

    for (let i = 0; i < steps; i += 1) {
      await this.client.alterWorkerLimit({
        nodeID: nodeId,
        process: direction,
        workerType: args.workerType,
      });
    }

    await this.cacheService.delByPattern(this.serviceName);
  }

  async requeueFailedJob(job: TdarrJobSummary): Promise<void> {
    const filePath = job.file;
    if (!filePath) {
      throw new Error('Missing file path');
    }

    const fileRecord = await this.findFileByPath(filePath);
    if (!fileRecord) {
      throw new Error('File not found in Tdarr database');
    }

    await this.client.scanIndividualFile({
      file: {
        _id: fileRecord._id,
        file: fileRecord.file,
        DB: fileRecord.DB,
        footprintId: fileRecord.footprintId,
      },
      scanTypes: [],
    });

    await this.cacheService.delByPattern(this.serviceName);
  }

  async getHealth(): Promise<{ healthy: boolean; message?: string }> {
    if (await this.isLocalDbAvailable()) {
      return { healthy: true, message: 'Using local Tdarr database' };
    }
    try {
      await this.client.getStatus();
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: 'Failed to connect to Tdarr',
      };
    }
  }

  private async getNodes(): Promise<TdarrNodeSummary[]> {
    const fallback = await this.getNodeSettings();
    if (fallback.length > 0) {
      return fallback.map((node) => ({
        id: node?._id || node?.id || node?.name || 'unknown',
        name: node?._id || node?.name || 'Unknown',
        workerLimits: node?.workerLimits || {},
        scheduleEnabled: node?.scheduleEnabled,
        nodePaused: node?.nodePaused,
        priority: node?.priority,
      }));
    }

    try {
      const response = await this.client.getNodes();
      const nodes = extractArrayResponse<any>(response);
      if (nodes.length > 0) {
        return nodes.map((node) => {
          if (typeof node === 'string') {
            return { id: node, name: node, workerLimits: {} };
          }
          return {
            id: node?.nodeID || node?.id || node?._id || node?.nodeName || 'unknown',
            name:
              node?.nodeName ||
              node?.name ||
              node?.id ||
              node?._id ||
              'Unknown',
            workerLimits: node?.workerLimits || node?.worker_limits || {},
            scheduleEnabled: node?.scheduleEnabled,
            nodePaused: node?.nodePaused,
            priority: node?.priority,
          };
        });
      }
    } catch (error) {
      logger.warn('[tdarr] get-nodes failed');
    }

    return [];
  }

  private async getNodeSettings(): Promise<any[]> {
    return this.readCollection({
      collection: 'NodeJSONDB',
      mode: 'getAll',
    });
  }

  private async getStagedItems(): Promise<any[]> {
    const items = await this.readCollection({
      collection: 'StagedJSONDB',
      mode: 'getAll',
    });
    return items
      .sort((a, b) => (b?.start || 0) - (a?.start || 0))
      .slice(0, 200);
  }

  private async getRecentJobs(): Promise<any[]> {
    const items = await this.readCollection({
      collection: 'JobsJSONDB',
      mode: 'getAll',
    });
    return items
      .sort((a, b) => {
        const aTime = a?.end || a?.start || 0;
        const bTime = b?.end || b?.start || 0;
        return bTime - aTime;
      })
      .slice(0, 400);
  }

  private async getStatistics(): Promise<any> {
    const local = await this.readLocalCollection({
      collection: 'StatisticsJSONDB',
      mode: 'getById',
      docID: 'statistics',
    });
    if (local && local.length > 0) {
      return local[0];
    }

    const response = await this.client.crudDb({
      collection: 'StatisticsJSONDB',
      mode: 'getById',
      docID: 'statistics',
    });
    return extractObjectResponse<any>(response);
  }

  private async readCollection(request: TdarrCrudRequest): Promise<any[]> {
    const local = await this.readLocalCollection(request);
    if (local) {
      return local;
    }

    try {
      const response = await this.client.crudDb(request);
      const items = extractArrayResponse<any>(response);
      if (items.length === 0 && request.mode === 'get') {
        const fallback = await this.client.crudDb({
          ...request,
          mode: 'getAll',
        });
        return extractArrayResponse<any>(fallback);
      }
      return items;
    } catch (error) {
      logger.warn(`[tdarr] cruddb ${request.collection} failed`, error);
      return [];
    }
  }

  private countRecentTranscodes(jobs: any[], hours: number): number {
    const windowMs = hours * 60 * 60 * 1000;
    const cutoff = Date.now() - windowMs;
    let count = 0;

    for (const job of jobs) {
      const status = String(job?.status || '').toLowerCase();
      if (!status.includes('success')) continue;
      const end = job?.end || job?.start || 0;
      if (end && end >= cutoff) count += 1;
    }
    return count;
  }

  private async enrichFailureSteps(jobs: TdarrJobSummary[]): Promise<void> {
    await Promise.all(
      jobs.map(async (job) => {
        try {
          const jobInfo = await this.fetchJobLog(job);
          if (jobInfo?.text) {
            job.failureStep = extractFailureStepFromLog(jobInfo.text);
            job.logText = jobInfo.text;
          }
        } catch (error) {
          logger.debug('[tdarr] Failed to read job log', error);
        }
      })
    );
  }

  private async fetchJobLog(job: TdarrJobSummary): Promise<{ text?: string } | null> {
    const cacheKey = `${this.serviceName}:joblog:${job.id}`;
    const cached = await this.cacheService.get<{ text?: string }>(cacheKey);
    if (cached) return cached;

    const footprintId = job.footprintId;
    let jobFileId = job.jobFileId;
    const jobId = job.jobId || job.id;

    if (!footprintId || !jobId) return null;

    if (!jobFileId) {
      try {
        const listResp = await this.client.listFootprintReports(footprintId);
        const files = extractArrayResponse<string>(listResp);
        jobFileId = files.find((name) => name.includes(jobId)) || files[0];
      } catch (error) {
        logger.debug('[tdarr] Failed to list job reports', error);
      }
    }

    if (!jobFileId) return null;

    const response = await this.client.readJobFile({
      footprintId,
      jobId,
      jobFileId,
    });

    const data = extractObjectResponse<any>(response);
    const result = { text: data?.text || data?.data?.text };
    await this.cacheService.set(cacheKey, result, 900);
    return result;
  }

  private async handleFileAgeFailures(failedJobs: TdarrJobSummary[]): Promise<void> {
    if (!failedJobs.length) return;

    const now = Date.now();
    const defaultDelayMs = Math.max(1, this.fileAgeRetryMinutes) * 60 * 1000;

    for (const job of failedJobs) {
      if (!job.file || !this.isFileAgeFailure(job)) continue;

      const cacheKey = this.fileAgeCacheKey(job.file);
      const record = await this.cacheService.get<{ nextAttempt: number }>(cacheKey);
      if (record && now < record.nextAttempt) {
        continue;
      }

      const customDelay = this.parseFileAgeDelay(job.logText);
      const jobDelay = customDelay ?? defaultDelayMs;
      const ttlSeconds = Math.max(Math.ceil(jobDelay / 1000) + 60, 60);

      if (!record) {
        await this.cacheService.set(cacheKey, { nextAttempt: now + jobDelay }, ttlSeconds);
        logger.info(
          `[tdarr] Scheduled retry for file-age failure: ${job.title} in ${(jobDelay / 1000 / 60).toFixed(1)}min`
        );
        continue;
      }

      try {
        await this.requeueFailedJob(job);
        logger.info(`[tdarr] Auto requeued file-age job: ${job.title}`);
      } catch (error) {
        logger.warn(`[tdarr] Auto requeue failed for ${job.title}: ${error}`);
        continue;
      } finally {
        await this.cacheService.del(cacheKey);
      }
    }
  }

  private isFileAgeFailure(job: TdarrJobSummary): boolean {
    const fields = [job.failureStep, job.logText, job.status]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return FILE_AGE_KEYWORDS.some((keyword) => fields.includes(keyword));
  }

  private fileAgeCacheKey(filePath: string): string {
    return `${this.serviceName}:file-age:${encodeURIComponent(filePath)}`;
  }

  private parseFileAgeDelay(text?: string): number | null {
    if (!text) return null;
    const regex =
      /Will be eligible in\s+([\d.]+)\s+(day|days|hour|hours|minute|minutes|second|seconds)/i;
    const match = text.match(regex);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) return null;
    const unit = match[2].toLowerCase();
    const multipliers: Record<string, number> = {
      day: 86400,
      days: 86400,
      hour: 3600,
      hours: 3600,
      minute: 60,
      minutes: 60,
      second: 1,
      seconds: 1,
    };
    const multiplier = multipliers[unit] ?? 60;
    return value * multiplier * 1000;
  }

  private async findFileByPath(filePath: string): Promise<any | null> {
    const local = await this.readLocalCollection({
      collection: 'FileJSONDB',
      mode: 'search',
      query: { file: filePath },
      limit: 1,
    });
    if (local && local.length > 0) {
      return local[0];
    }

    const response = await this.client.crudDb({
      collection: 'FileJSONDB',
      mode: 'search',
      query: { file: filePath },
      limit: 1,
    });
    const results = extractArrayResponse<any>(response);
    return results[0] || null;
  }

  private async isLocalDbAvailable(): Promise<boolean> {
    if (!this.localDbPath) return false;
    try {
      await fs.promises.access(this.localDbPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async getLocalDb(): Promise<any | null> {
    if (!this.localDbPath) return null;
    try {
      const stats = await fs.promises.stat(this.localDbPath);
      const cache = this.localDbCache;
      if (
        cache &&
        cache.mtimeMs === stats.mtimeMs &&
        Date.now() - cache.loadedAt < 5000
      ) {
        return cache.db;
      }

      const SQL = await this.getSqlModule();
      const buffer = await fs.promises.readFile(this.localDbPath);
      const db = new SQL.Database(new Uint8Array(buffer));

      if (this.localDbCache?.db?.close) {
        this.localDbCache.db.close();
      }

      this.localDbCache = { db, mtimeMs: stats.mtimeMs, loadedAt: Date.now() };
      return db;
    } catch (error) {
      logger.debug('[tdarr] Failed to read local Tdarr DB', error);
      return null;
    }
  }

  private async getSqlModule(): Promise<any> {
    if (this.sqlModule) return this.sqlModule;
    const mod = await import('sql.js');
    const initSqlJs = mod.default;
    const baseDir = path.dirname(require.resolve('sql.js'));
    this.sqlModule = await initSqlJs({
      locateFile: (file: string) => path.join(baseDir, file),
    });
    return this.sqlModule;
  }

  private async readLocalCollection(
    request: TdarrCrudRequest
  ): Promise<any[] | null> {
    const db = await this.getLocalDb();
    if (!db) return null;

    const table = request.collection.toLowerCase();
    const allowed = new Set([
      'nodejsondb',
      'stagedjsondb',
      'jobsjsondb',
      'statisticsjsondb',
      'filejsondb',
    ]);
    if (!allowed.has(table)) return null;

    if (request.mode === 'getById' && request.docID) {
      return this.queryLocalRows(db, table, 'WHERE id = ?', [request.docID]);
    }

    if (request.mode === 'search' && request.query?.file) {
      const items = this.queryLocalRows(db, table);
      return items.filter((item) => item?.file === request.query?.file);
    }

    if (request.mode === 'get' && request.docID) {
      return this.queryLocalRows(db, table, 'WHERE id = ?', [request.docID]);
    }

    return this.queryLocalRows(db, table);
  }

  private queryLocalRows(
    db: any,
    table: string,
    whereClause?: string,
    params: any[] = []
  ): any[] {
    const rows: any[] = [];
    const sql = `SELECT json_data FROM ${table} ${whereClause || ''}`.trim();
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.getAsObject() as { json_data?: string };
        if (!row?.json_data) continue;
        try {
          rows.push(JSON.parse(row.json_data));
        } catch {
          // ignore malformed rows
        }
      }
    } finally {
      stmt.free();
    }
    return rows;
  }
}
