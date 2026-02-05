import type { LogEntry } from '@dasharr/shared-types';

const DEFAULT_MAX = 1000;
const maxEntries = Number.isFinite(Number(process.env.DASHARR_LOG_STORE_MAX))
  ? Number(process.env.DASHARR_LOG_STORE_MAX)
  : DEFAULT_MAX;

const entries: LogEntry[] = [];

export interface DasharrLogQuery {
  level?: LogEntry['level'];
  page?: number;
  pageSize?: number;
}

export function addLogEntry(entry: LogEntry): void {
  entries.push(entry);
  if (entries.length > maxEntries) {
    entries.splice(0, entries.length - maxEntries);
  }
}

export function getLogEntries(query: DasharrLogQuery = {}): LogEntry[] {
  const level = query.level;
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 50;

  const filtered = level ? entries.filter((entry) => entry.level === level) : entries;
  const ordered = [...filtered].reverse();
  const start = (page - 1) * pageSize;
  return ordered.slice(start, start + pageSize);
}
