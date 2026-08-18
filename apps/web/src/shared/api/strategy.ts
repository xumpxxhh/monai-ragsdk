import { useMockApi } from '@/config/env';
import { apiGet, apiPut } from '@/shared/api/http';
import {
  mockStrategies,
  presetDescriptions,
  presetLabels,
} from '@/shared/api/mock/data';
import type { StrategyConfig, StrategyPreset } from '@/shared/types';
import { delay } from '@/shared/utils';

export { presetDescriptions, presetLabels };

const presetTemplates: Record<StrategyPreset, Partial<StrategyConfig>> = {
  balanced: {
    preRetrieval: { rewrite: true, expansion: false, decomposition: false, multiQuery: false, routing: false },
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
  },
  high_recall: {
    preRetrieval: { rewrite: true, expansion: true, decomposition: false, multiQuery: true, routing: false },
    retrieval: { topK: 12 },
    postRetrieval: {
      scoreThreshold: false,
      scoreThresholdValue: 0.15,
      dedupe: true,
      contextBudget: true,
      contextBudgetMax: 8,
      sourceCoverage: true,
      rerank: true,
      compression: false,
      lostInMiddle: false,
    },
  },
  low_cost: {
    preRetrieval: { rewrite: false, expansion: false, decomposition: false, multiQuery: false, routing: false },
    retrieval: { topK: 5 },
    postRetrieval: {
      scoreThreshold: true,
      scoreThresholdValue: 0.25,
      dedupe: true,
      contextBudget: true,
      contextBudgetMax: 3,
      sourceCoverage: false,
      rerank: false,
      compression: false,
      lostInMiddle: false,
    },
  },
  strict_cite: {
    preRetrieval: { rewrite: true, expansion: false, decomposition: false, multiQuery: false, routing: false },
    postRetrieval: {
      scoreThreshold: true,
      scoreThresholdValue: 0.35,
      dedupe: true,
      contextBudget: true,
      contextBudgetMax: 5,
      sourceCoverage: false,
      rerank: true,
      compression: true,
      lostInMiddle: false,
    },
    generation: { citations: true, activeRag: false, noGroundingPolicy: 'explicit' },
  },
};

export async function getStrategy(collectionId: string): Promise<StrategyConfig> {
  if (useMockApi) {
    await delay(120);
    if (!mockStrategies[collectionId]) {
      mockStrategies[collectionId] = {
        collectionId,
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
    return structuredClone(mockStrategies[collectionId]);
  }
  return apiGet<StrategyConfig>(`/collections/${collectionId}/strategy`);
}

export async function saveStrategy(config: StrategyConfig): Promise<StrategyConfig> {
  if (useMockApi) {
    await delay(250);
    mockStrategies[config.collectionId] = structuredClone(config);
    return config;
  }
  return apiPut<StrategyConfig>(`/collections/${config.collectionId}/strategy`, config);
}

export function applyPreset(config: StrategyConfig, preset: StrategyPreset): StrategyConfig {
  const template = presetTemplates[preset];
  return {
    ...config,
    preset,
    preRetrieval: { ...config.preRetrieval, ...template.preRetrieval },
    retrieval: { ...config.retrieval, ...template.retrieval },
    postRetrieval: { ...config.postRetrieval, ...template.postRetrieval },
    generation: { ...config.generation, ...template.generation },
  };
}

export function resetStrategyDefaults(collectionId: string): StrategyConfig {
  const base = applyPreset(
    {
      collectionId,
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
    },
    'balanced',
  );
  return base;
}
