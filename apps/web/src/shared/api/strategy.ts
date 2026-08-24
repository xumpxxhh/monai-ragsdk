import { apiGet, apiPut } from '@/shared/api/http';
import type { StrategyConfig, StrategyPreset } from '@/shared/types';

/** 策略预设中文标签（仅 UI，不经服务端）。 */
export const presetLabels: Record<StrategyPreset, string> = {
  balanced: '均衡',
  high_recall: '高召回',
  low_cost: '低成本',
  strict_cite: '严谨引用',
};

/** 策略预设说明文案（仅 UI）。 */
export const presetDescriptions: Record<StrategyPreset, string> = {
  balanced: '改写开 + 多路查询关 + 轻量重排 + 压缩开（适合日常）',
  high_recall: '扩展开 + 多路查询开 + 高 topK（适合召回优先）',
  low_cost: '改写关 + 重排关 + 压缩关（适合低成本场景）',
  strict_cite: '高阈值 + 引用常开 + 无依据明确告知',
};

const presetTemplates: Record<StrategyPreset, Partial<StrategyConfig>> = {
  balanced: {
    preRetrieval: {
      rewrite: true,
      expansion: false,
      decomposition: false,
      multiQuery: false,
      routing: false,
    },
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
    preRetrieval: {
      rewrite: true,
      expansion: true,
      decomposition: false,
      multiQuery: true,
      routing: false,
    },
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
    preRetrieval: {
      rewrite: false,
      expansion: false,
      decomposition: false,
      multiQuery: false,
      routing: false,
    },
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
    preRetrieval: {
      rewrite: true,
      expansion: false,
      decomposition: false,
      multiQuery: false,
      routing: false,
    },
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

/** 读取全局检索策略（collectionId 固定为 global）。 */
export async function getStrategy(): Promise<StrategyConfig> {
  return apiGet<StrategyConfig>('/strategy');
}

export async function saveStrategy(config: StrategyConfig): Promise<StrategyConfig> {
  return apiPut<StrategyConfig>('/strategy', { ...config, collectionId: 'global' });
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

export function resetStrategyDefaults(): StrategyConfig {
  const base = applyPreset(
    {
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
    },
    'balanced',
  );
  return base;
}
