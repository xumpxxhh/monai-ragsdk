import { describe, expect, it } from 'vitest';
import { applyPreset, presetLabels } from '@/shared/api/strategy';
import type { StrategyConfig } from '@/shared/types';

const baseConfig: StrategyConfig = {
  collectionId: 'test',
  preset: 'balanced',
  preRetrieval: {
    rewrite: false,
    expansion: false,
    decomposition: false,
    multiQuery: false,
    routing: false,
  },
  retrieval: { topK: 8 },
  postRetrieval: {
    scoreThreshold: false,
    scoreThresholdValue: 0.2,
    dedupe: false,
    contextBudget: false,
    contextBudgetMax: 5,
    sourceCoverage: false,
    rerank: false,
    compression: false,
    lostInMiddle: false,
  },
  generation: {
    citations: true,
    activeRag: false,
    noGroundingPolicy: 'explicit',
  },
};

describe('applyPreset', () => {
  it('高召回预设应开启扩展与多路查询', () => {
    const next = applyPreset(baseConfig, 'high_recall');
    expect(next.preRetrieval.expansion).toBe(true);
    expect(next.preRetrieval.multiQuery).toBe(true);
    expect(next.preset).toBe('high_recall');
  });

  it('预设标签应覆盖四种策略', () => {
    expect(Object.keys(presetLabels)).toHaveLength(4);
  });
});
