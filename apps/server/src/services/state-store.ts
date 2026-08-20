import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { PACKAGE_ROOT } from '../config/env.js';
import type {
  DocumentSource,
  IngestMode,
  LastIngestSummary,
  StrategyConfig,
} from '../types/api.js';

export type StoredDocument = DocumentSource & {
  /** 原文保留下来才能 retry，而不把完整文档生命周期做进 SDK。 */
  content: string;
  fingerprint?: string;
};

export type CollectionRecord = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  ingestMode: IngestMode;
  lastIngest: LastIngestSummary | null;
  strategy: StrategyConfig;
  documents: StoredDocument[];
};

type PersistedState = {
  collections: CollectionRecord[];
  /** 全局 ask / search 策略；缺省时由 registry 用 defaultStrategy('global') 填充。 */
  globalStrategy?: StrategyConfig;
};

const STATE_PATH = resolve(PACKAGE_ROOT, 'data/state.json');

function emptyState(): PersistedState {
  return { collections: [] };
}

/** 知识库元数据落盘；向量仍在 pgvector。进程重启后只恢复登记表，不重建连接池。 */
export function loadState(): PersistedState {
  try {
    const raw = readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.collections)) {
      return emptyState();
    }
    return parsed;
  } catch {
    return emptyState();
  }
}

export function saveState(state: PersistedState): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
