import type { StrategyConfig } from '@/shared/types';

/** 控制台可编辑的后处理项，顺序对齐 runtime POST_RETRIEVAL_ASSEMBLY_ORDER（不含未暴露项）。 */
export const POST_RETRIEVAL_CONTROLS = [
  {
    order: 1,
    id: 'llm-rerank',
    configKey: 'rerank' as const,
    label: 'LLM 重排序',
    description: '用模型对候选再排序；须在 score-threshold 之前生效',
  },
  {
    order: 2,
    id: 'score-threshold',
    configKey: 'scoreThreshold' as const,
    label: '分数阈值',
    description: '低于阈值的候选丢弃',
  },
  {
    order: 3,
    id: 'duplicate-removal',
    configKey: 'dedupe' as const,
    label: '近重复去除',
    description: '合并内容高度相似的片段',
  },
  {
    order: 4,
    id: 'budget-trim',
    configKey: 'contextBudget' as const,
    label: '上下文预算',
    description: '限制进入生成的片段数量（budget.maxChunks）',
  },
  {
    order: 5,
    id: 'source-coverage',
    configKey: 'sourceCoverage' as const,
    label: '来源覆盖',
    description: '尽量覆盖多个文档来源',
  },
  {
    order: 6,
    id: 'context-compression',
    configKey: 'compression' as const,
    label: '上下文压缩',
    description: '压缩片段正文后再生成',
  },
  {
    order: 7,
    id: 'lost-in-the-middle',
    configKey: 'lostInMiddle' as const,
    label: 'Lost-in-the-Middle',
    description: '调整片段顺序，缓解中间段被模型忽略',
  },
] as const;

/** 内核默认链有、本控制台未暴露的后处理策略。 */
export const KERNEL_ONLY_POST_STRATEGIES = ['predicate-filter', 'context-ordering'] as const;

export const RUNTIME_STAGES = [
  { id: 'pre-retrieval', label: '预处理' },
  { id: 'retrieval', label: '检索' },
  { id: 'post-retrieval', label: '后处理' },
  { id: 'generation', label: '生成' },
] as const;

export function countPreRetrievalEnabled(pre: StrategyConfig['preRetrieval']): number {
  return Object.values(pre).filter(Boolean).length;
}

export function countPostRetrievalEnabled(post: StrategyConfig['postRetrieval']): number {
  return POST_RETRIEVAL_CONTROLS.filter((item) => post[item.configKey]).length;
}

/** 生成段：grounding 包装器恒编译；引用开关可选。 */
export function countGenerationEnabled(gen: StrategyConfig['generation']): number {
  return (gen.citations ? 1 : 0) + 1;
}

/** 检索段：topK / FanOut 始终参与装配，计为 1。 */
export function countRetrievalEnabled(): number {
  return 1;
}

export function stageEnabledCounts(config: StrategyConfig): Record<(typeof RUNTIME_STAGES)[number]['id'], number> {
  return {
    'pre-retrieval': countPreRetrievalEnabled(config.preRetrieval),
    retrieval: countRetrievalEnabled(),
    'post-retrieval': countPostRetrievalEnabled(config.postRetrieval),
    generation: countGenerationEnabled(config.generation),
  };
}
