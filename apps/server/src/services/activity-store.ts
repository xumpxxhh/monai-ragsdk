import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { ActivityItem, AskTrace, IngestStats, IngestTaskTrace } from '../types/api.js';

import { PACKAGE_ROOT } from '../config/env.js';

const MAX_ITEMS = 100;

const activities: ActivityItem[] = [];
const askTraces: AskTrace[] = [];
const ingestTraces: IngestTaskTrace[] = [];

const DATA_DIR = resolve(PACKAGE_ROOT, 'data');
const ASK_TRACES_PATH = resolve(DATA_DIR, 'ask-traces.jsonl');
const INGEST_TRACES_PATH = resolve(DATA_DIR, 'ingest-traces.jsonl');

function cap<T>(list: T[]): void {
  if (list.length > MAX_ITEMS) {
    list.splice(0, list.length - MAX_ITEMS);
  }
}

function loadJsonlLast<T>(filePath: string, maxLines: number): T[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const text = readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const sliced = lines.slice(Math.max(0, lines.length - maxLines));

  const result: T[] = [];
  for (const line of sliced) {
    try {
      result.push(JSON.parse(line) as T);
    } catch {
      // 单行损坏时忽略，避免服务整体无法启动。
    }
  }

  return result;
}

function appendJsonl(filePath: string, value: unknown): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
  } catch {
    // 追踪数据不应拖死主链路；写入失败只影响观测与回放。
  }
}

// 启动时只读一次历史 JSONL，避免运行期高频读磁盘。
// 内存结构仍保持「最新在前」（与 unshift/cap 行为一致）。
try {
  askTraces.push(...loadJsonlLast<AskTrace>(ASK_TRACES_PATH, MAX_ITEMS).reverse());
  ingestTraces.push(...loadJsonlLast<IngestTaskTrace>(INGEST_TRACES_PATH, MAX_ITEMS).reverse());
} catch {
  // 忽略加载失败（例如文件损坏/权限问题）。
}

export function recordActivity(item: Omit<ActivityItem, 'id' | 'time'> & { time?: string }): void {
  activities.unshift({
    id: `act-${randomUUID()}`,
    time: item.time ?? new Date().toISOString(),
    kind: item.kind,
    title: item.title,
    detail: item.detail,
    stats: item.stats,
    collectionId: item.collectionId,
    collectionName: item.collectionName,
  });
  cap(activities);
}

export function listActivities(collectionId?: string): ActivityItem[] {
  if (!collectionId) {
    return [...activities];
  }
  return activities.filter((item) => !item.collectionId || item.collectionId === collectionId);
}

/** 记录一次 ask 轨迹；只在「完成」时追加写 JSONL，避免频繁磁盘读写。 */
export async function recordAskTrace(trace: AskTrace): Promise<void> {
  askTraces.unshift(trace);
  cap(askTraces);

  appendJsonl(ASK_TRACES_PATH, trace);
}

export function listAskTraces(params?: { collectionId?: string; q?: string }): AskTrace[] {
  let items = [...askTraces];
  if (params?.collectionId) {
    items = items.filter((trace) => trace.collectionId === params.collectionId);
  }
  if (params?.q) {
    const q = params.q.toLowerCase();
    items = items.filter((trace) => trace.question.toLowerCase().includes(q));
  }
  return items;
}

export function getAskTrace(id: string): AskTrace | undefined {
  return askTraces.find((trace) => trace.id === id);
}

/** 记录一次入库轨迹；只在「完成」时追加写 JSONL。 */
export async function recordIngestTrace(trace: IngestTaskTrace): Promise<void> {
  ingestTraces.unshift(trace);
  cap(ingestTraces);

  appendJsonl(INGEST_TRACES_PATH, trace);
}

export function listIngestTraces(collectionId?: string): IngestTaskTrace[] {
  if (!collectionId) {
    return [...ingestTraces];
  }
  return ingestTraces.filter((trace) => trace.collectionId === collectionId);
}

export function countAskInDays(
  collectionId: string,
  days: number,
): { count: number; avgCitations: number } {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = askTraces.filter(
    (trace) => trace.collectionId === collectionId && Date.parse(trace.finishedAt) >= since,
  );
  if (recent.length === 0) {
    return { count: 0, avgCitations: 0 };
  }
  const citationSum = recent.reduce((sum, trace) => sum + trace.citationCount, 0);
  return {
    count: recent.length,
    avgCitations: Math.round((citationSum / recent.length) * 10) / 10,
  };
}

export function ingestActivityTitle(stats: IngestStats): string {
  return `入库完成：新增 ${stats.added} / 跳过 ${stats.skipped} / 失败 ${stats.failed}`;
}
