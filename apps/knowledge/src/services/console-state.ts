import { readFileSync } from 'node:fs';

import { loadKnowledgeConfig } from '../config/env.js';
import { badRequest, notFound } from '../http/errors.js';
import type { KnowledgeCollectionSummary, StrategyConfig } from '../types.js';

type StoredDocument = {
  id: string;
  status: string;
};

export type ConsoleCollectionRecord = {
  id: string;
  name: string;
  description: string;
  documents: StoredDocument[];
};

type ConsolePersistedState = {
  collections: ConsoleCollectionRecord[];
  globalStrategy?: StrategyConfig;
};

function emptyState(): ConsolePersistedState {
  return { collections: [] };
}

/** 每次 list / search 重新读盘，控制台新建库后不必重启本服务。 */
export function loadConsoleState(): ConsolePersistedState {
  const { consoleStatePath } = loadKnowledgeConfig();

  try {
    const raw = readFileSync(consoleStatePath, 'utf8');
    const parsed = JSON.parse(raw) as ConsolePersistedState;
    if (!Array.isArray(parsed.collections)) {
      return emptyState();
    }
    return parsed;
  } catch {
    return emptyState();
  }
}

export function defaultGlobalStrategy(): StrategyConfig {
  return {
    collectionId: 'global',
    preset: 'balanced',
    preRetrieval: {
      rewrite: true,
      expansion: false,
      decomposition: false,
      multiQuery: false,
      routing: false,
    },
    retrieval: { topK: 8 },
    postRetrieval: {
      scoreThreshold: true,
      scoreThresholdValue: 0.2,
      dedupe: true,
      contextBudget: true,
      contextBudgetMax: 5,
      sourceCoverage: false,
      rerank: true,
      compression: true,
      lostInMiddle: false,
    },
    generation: {
      citations: true,
      activeRag: false,
      noGroundingPolicy: 'explicit',
    },
  };
}

export function getGlobalStrategy(): StrategyConfig {
  const state = loadConsoleState();
  return state.globalStrategy ?? defaultGlobalStrategy();
}

export function listCollectionRecords(): ConsoleCollectionRecord[] {
  return loadConsoleState().collections;
}

export function toCollectionSummary(record: ConsoleCollectionRecord): KnowledgeCollectionSummary {
  const documentCount = record.documents.filter((doc) => doc.status !== 'failed').length;
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    documentCount,
  };
}

/** 解析检索目标库：显式 id 须存在；缺省为全部已登记库。 */
export function resolveTargetCollections(collectionIds?: string[]): ConsoleCollectionRecord[] {
  if (!collectionIds || collectionIds.length === 0) {
    const all = listCollectionRecords();
    if (all.length === 0) {
      throw badRequest('没有可用的知识库');
    }
    return all;
  }

  const unique = [...new Set(collectionIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    throw badRequest('collectionIds 不能为空');
  }

  return unique.map((id) => {
    const record = listCollectionRecords().find((item) => item.id === id);
    if (!record) {
      throw notFound('知识库不存在');
    }
    return record;
  });
}
