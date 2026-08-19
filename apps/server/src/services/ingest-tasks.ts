import { randomUUID } from 'node:crypto';

import { emptyIngestStats } from '../mappers/dto.js';
import { notFound } from '../http/errors.js';
import type { IngestProgressEvent, IngestStats } from '../types/api.js';

type IngestTask = IngestProgressEvent & {
  collectionId: string;
};

const tasks = new Map<string, IngestTask>();
const ingesting = new Set<string>();

export function isIngesting(collectionId: string): boolean {
  return ingesting.has(collectionId);
}

export function beginIngest(collectionId: string): void {
  ingesting.add(collectionId);
}

export function endIngest(collectionId: string): void {
  ingesting.delete(collectionId);
}

/** 创建可轮询的入库任务；SDK ingest 不是逐文件流，因此进度只有进行中 / 完成两态。 */
export function createIngestTask(
  collectionId: string,
  total: number,
  fileName: string,
): { taskId: string; event: IngestProgressEvent } {
  const taskId = randomUUID();
  const event: IngestTask = {
    collectionId,
    current: 0,
    total,
    fileName,
    stats: emptyIngestStats(),
    done: false,
  };
  tasks.set(taskId, event);
  return { taskId, event };
}

export function updateIngestTask(
  taskId: string,
  patch: Partial<Pick<IngestProgressEvent, 'current' | 'fileName' | 'stats' | 'log' | 'done'>>,
): void {
  const task = tasks.get(taskId);
  if (!task) {
    return;
  }
  Object.assign(task, patch);
}

export function getIngestTask(collectionId: string, taskId: string): IngestProgressEvent {
  const task = tasks.get(taskId);
  if (!task || task.collectionId !== collectionId) {
    throw notFound('入库任务不存在');
  }
  const { collectionId: _ignored, ...event } = task;
  return event;
}

export function completeIngestTask(taskId: string, stats: IngestStats, log?: string): void {
  updateIngestTask(taskId, {
    current: tasks.get(taskId)?.total ?? 0,
    stats,
    log,
    done: true,
  });
}
