import { runBasicStreamExample } from './basic-stream-example.js';
import { runObservabilityExample } from './observability-example.js';
import { runFullPipelineExample } from './full-pipeline-example.js';
import { runPostRetrievalExample } from './post-retrieval-example.js';
import { runPreRetrievalExample } from './pre-retrieval-example.js';

export type ExampleEntry = {
  id: string;
  description: string;
  run: () => Promise<void>;
};

/** 可运行的完整流程示例注册表；id 与 CLI / EXAMPLE 环境变量对齐。 */
export const EXAMPLE_REGISTRY: Record<string, ExampleEntry> = {
  observability: {
    id: 'observability',
    description: 'Observability 对照：前后策略 + FanOut，重点查看 trace 事件链路',
    run: runObservabilityExample,
  },
  'basic-stream': {
    id: 'basic-stream',
    description: '默认栈闭环：索引 → pgvector → 流式生成（无策略，含 observer）',
    run: runBasicStreamExample,
  },
  'pre-retrieval': {
    id: 'pre-retrieval',
    description: 'Pre-retrieval：Rewrite + Multi-Query + FanOut（含 observer）',
    run: runPreRetrievalExample,
  },
  'post-retrieval': {
    id: 'post-retrieval',
    description: 'Post-retrieval：Rerank + Compression + Lost-in-the-Middle（含 observer）',
    run: runPostRetrievalExample,
  },
  'full-pipeline': {
    id: 'full-pipeline',
    description:
      '完整 pipeline：Routing + Rewrite + Multi-Query + FanOut + Rerank + Compression（含 observer）',
    run: runFullPipelineExample,
  },
};

export const ALL_EXAMPLE_IDS = Object.keys(EXAMPLE_REGISTRY);

export function listExampleIds(): string[] {
  return ALL_EXAMPLE_IDS;
}

export function printExampleCatalog(): void {
  console.log('可用示例（pnpm start <id> 或 EXAMPLE=<id>）：');
  for (const id of ALL_EXAMPLE_IDS) {
    const entry = EXAMPLE_REGISTRY[id]!;
    console.log(`  ${id} — ${entry.description}`);
  }
  console.log('  all — 依次运行全部示例');
}

export async function runExampleById(id: string): Promise<void> {
  const entry = EXAMPLE_REGISTRY[id];
  if (!entry) {
    throw new Error(`未知示例 "${id}"；可用：${ALL_EXAMPLE_IDS.join(', ')}, all, list`);
  }

  console.log(`\n=== ${entry.id} ===`);
  console.log(entry.description);
  await entry.run();
}

export async function runAllExamples(): Promise<void> {
  for (const id of ALL_EXAMPLE_IDS) {
    await runExampleById(id);
  }
}
