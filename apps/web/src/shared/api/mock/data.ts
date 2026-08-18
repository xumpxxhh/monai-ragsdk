import type {
  ActivityItem,
  AskTrace,
  CollectionDetail,
  CollectionSummary,
  ConnectionInfo,
  DashboardStats,
  DocumentSource,
  IngestProgressEvent,
  IngestTaskTrace,
  LastIngestSummary,
  Paginated,
  SearchResult,
  StrategyConfig,
  StrategyPreset,
} from '@/shared/types';

const now = new Date();

function minutesAgo(m: number): string {
  return new Date(now.getTime() - m * 60_000).toISOString();
}

function hoursAgo(h: number): string {
  return new Date(now.getTime() - h * 3_600_000).toISOString();
}

function daysAgo(d: number): string {
  return new Date(now.getTime() - d * 86_400_000).toISOString();
}

export const mockCollections: CollectionDetail[] = [
  {
    id: 'kb-product',
    name: '产品手册库',
    description: '面向客服与运营的产品退换、运费与发票政策。',
    documentCount: 128,
    health: 'healthy',
    presetLabel: '均衡',
    failedIngestCount: 0,
    lastIngestAt: minutesAgo(15),
    createdAt: daysAgo(30),
  },
  {
    id: 'kb-policy',
    name: '内部制度库',
    description: '人事、财务与合规相关内部制度文档。',
    documentCount: 56,
    health: 'warning',
    presetLabel: '严谨引用',
    failedIngestCount: 2,
    lastIngestAt: hoursAgo(5),
    createdAt: daysAgo(60),
  },
  {
    id: 'kb-support',
    name: '售后话术库',
    description: '售后客服标准话术与常见问题应答。',
    documentCount: 42,
    health: 'healthy',
    presetLabel: '高召回',
    failedIngestCount: 0,
    lastIngestAt: daysAgo(1),
    createdAt: daysAgo(14),
  },
];

export const mockDocuments: DocumentSource[] = [
  {
    id: 'doc-1',
    collectionId: 'kb-product',
    sourceId: 'd-12',
    title: '退货政策.md',
    status: 'indexed',
    updatedAt: minutesAgo(15),
  },
  {
    id: 'doc-2',
    collectionId: 'kb-product',
    sourceId: 'd-09',
    title: 'FAQ.md',
    status: 'failed',
    updatedAt: minutesAgo(16),
    failReason: '内容为空，已跳过并继续',
  },
  {
    id: 'doc-3',
    collectionId: 'kb-product',
    sourceId: 'd-01',
    title: '手册.pdf',
    status: 'unchanged',
    updatedAt: daysAgo(1),
  },
  {
    id: 'doc-4',
    collectionId: 'kb-product',
    sourceId: 'd-05',
    title: '运费说明.md',
    status: 'indexed',
    updatedAt: minutesAgo(15),
  },
  {
    id: 'doc-5',
    collectionId: 'kb-product',
    sourceId: 'd-08',
    title: '发票开具指引.md',
    status: 'indexed',
    updatedAt: minutesAgo(15),
  },
  {
    id: 'doc-6',
    collectionId: 'kb-policy',
    sourceId: 'p-01',
    title: '考勤制度.pdf',
    status: 'indexed',
    updatedAt: hoursAgo(5),
  },
  {
    id: 'doc-7',
    collectionId: 'kb-policy',
    sourceId: 'p-02',
    title: '报销流程.md',
    status: 'failed',
    updatedAt: hoursAgo(5),
    failReason: '解析失败：文件损坏',
  },
];

export const mockLastIngest: Record<string, LastIngestSummary> = {
  'kb-product': {
    finishedAt: minutesAgo(15),
    mode: 'incremental',
    stats: { added: 3, skipped: 40, replaced: 1, failed: 0, cleaned: 0 },
  },
  'kb-policy': {
    finishedAt: hoursAgo(5),
    mode: 'incremental',
    stats: { added: 1, skipped: 12, replaced: 0, failed: 2, cleaned: 0 },
  },
  'kb-support': {
    finishedAt: daysAgo(1),
    mode: 'incremental',
    stats: { added: 5, skipped: 8, replaced: 2, failed: 0, cleaned: 1 },
  },
};

export const mockActivities: ActivityItem[] = [
  {
    id: 'act-1',
    time: minutesAgo(15),
    kind: 'ingest',
    title: '入库完成',
    stats: { added: 3, skipped: 40, replaced: 0, failed: 0, cleaned: 0 },
    collectionId: 'kb-product',
    collectionName: '产品手册库',
  },
  {
    id: 'act-2',
    time: minutesAgo(31),
    kind: 'ask',
    title: '用户提问「退货时效？」→ 已引用 4 段',
    collectionId: 'kb-product',
    collectionName: '产品手册库',
  },
  {
    id: 'act-3',
    time: daysAgo(1),
    kind: 'strategy',
    title: '策略：开启「查询改写」',
    collectionId: 'kb-product',
    collectionName: '产品手册库',
  },
  {
    id: 'act-4',
    time: daysAgo(1),
    kind: 'alert',
    title: '内部制度库出现 2 条失败入库，待重试',
    collectionId: 'kb-policy',
    collectionName: '内部制度库',
  },
];

export const mockAskTraces: AskTrace[] = [
  {
    id: 'trace-a3f2',
    collectionId: 'kb-product',
    collectionName: '产品手册库',
    question: '退货时效是多久？',
    effectiveQuestion: '商品退货申请时限',
    finishedAt: minutesAgo(31),
    durationMs: 2400,
    success: true,
    citationCount: 4,
    stages: [
      { id: 's1', label: '接收提问' },
      { id: 's2', label: '预处理 · 改写完成', durationMs: 120 },
      { id: 's3', label: '检索 · 召回 20 → 融合后 12' },
      { id: 's4', label: '后处理 · 阈值过滤掉 4 · 重排 · 压缩 → 剩 5' },
      { id: 's5', label: '生成 · 流式完成 · 引用 4' },
    ],
    warnings: [],
  },
  {
    id: 'trace-b1c8',
    collectionId: 'kb-product',
    collectionName: '产品手册库',
    question: '发票抬头怎么改？',
    effectiveQuestion: '发票抬头修改流程',
    finishedAt: minutesAgo(55),
    durationMs: 1800,
    success: true,
    citationCount: 3,
    stages: [
      { id: 's1', label: '接收提问' },
      { id: 's2', label: '预处理 · 改写完成', durationMs: 95 },
      { id: 's3', label: '检索 · 召回 15 → 融合后 8' },
      { id: 's4', label: '后处理 · 压缩 → 剩 4' },
      { id: 's5', label: '生成 · 流式完成 · 引用 3' },
    ],
    warnings: ['扩展策略失败已跳过（未影响回答）'],
  },
  {
    id: 'trace-c7d1',
    collectionId: 'kb-product',
    collectionName: '产品手册库',
    question: '运费谁承担？',
    finishedAt: hoursAgo(2),
    durationMs: 1500,
    success: true,
    citationCount: 2,
    stages: [
      { id: 's1', label: '接收提问' },
      { id: 's2', label: '检索 · 召回 12' },
      { id: 's3', label: '后处理 · 阈值过滤掉 3' },
      { id: 's4', label: '生成 · 引用 2' },
    ],
    warnings: [],
  },
];

export const mockIngestTraces: IngestTaskTrace[] = [
  {
    id: 'ingest-1',
    collectionId: 'kb-product',
    collectionName: '产品手册库',
    finishedAt: minutesAgo(15),
    mode: 'incremental',
    stats: { added: 3, skipped: 40, replaced: 1, failed: 0, cleaned: 0 },
    success: true,
  },
  {
    id: 'ingest-2',
    collectionId: 'kb-policy',
    collectionName: '内部制度库',
    finishedAt: hoursAgo(5),
    mode: 'incremental',
    stats: { added: 1, skipped: 12, replaced: 0, failed: 2, cleaned: 0 },
    success: false,
  },
];

const defaultStrategy = (collectionId: string): StrategyConfig => ({
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
});

export const mockStrategies: Record<string, StrategyConfig> = {
  'kb-product': defaultStrategy('kb-product'),
  'kb-policy': { ...defaultStrategy('kb-policy'), preset: 'strict_cite' },
  'kb-support': { ...defaultStrategy('kb-support'), preset: 'high_recall' },
};

export const mockConnectionInfo: ConnectionInfo = {
  embedding: 'connected',
  chat: 'connected',
  vectorStore: 'connected',
};

export const presetLabels: Record<StrategyPreset, string> = {
  balanced: '均衡',
  high_recall: '高召回',
  low_cost: '低成本',
  strict_cite: '严谨引用',
};

export const presetDescriptions: Record<StrategyPreset, string> = {
  balanced: '改写开 + 多路查询关 + 轻量重排 + 压缩开（适合日常）',
  high_recall: '扩展开 + 多路查询开 + 高 topK（适合召回优先）',
  low_cost: '改写关 + 重排关 + 压缩关（适合低成本场景）',
  strict_cite: '高阈值 + 引用常开 + 无依据明确告知',
};

/** 模拟 ask 流式答案模板 */
export const mockAnswerTemplates: Record<
  string,
  { answer: string; citations: { index: number; title: string; snippet: string; score: number }[] }
> = {
  default: {
    answer:
      '一般情况下，自签收之日起 7 日内可申请退货[1]。若商品属于特殊品类（如定制件、鲜活易腐），则不适用该时效[2]。建议在申请时准备订单号与签收凭证，以便客服核对。',
    citations: [
      {
        index: 1,
        title: '退货政策.md',
        snippet: '…自签收之日起 7 日内，消费者可申请无理由退货…',
        score: 0.92,
      },
      {
        index: 2,
        title: 'FAQ.md',
        snippet: '…特殊品类（定制、鲜活易腐等）不适用 7 日无理由…',
        score: 0.86,
      },
    ],
  },
};

export function getDashboardStats(collectionId: string): DashboardStats {
  const col = mockCollections.find((c) => c.id === collectionId);
  return {
    documentCount: col?.documentCount ?? 0,
    lastIngestSuccess: (col?.failedIngestCount ?? 0) === 0,
    lastIngestAt: col?.lastIngestAt ?? null,
    askCount7d: collectionId === 'kb-product' ? 312 : 48,
    avgCitations: collectionId === 'kb-product' ? 3.4 : 2.8,
    failedIngestCount: col?.failedIngestCount ?? 0,
  };
}

export function getSearchMock(query: string, topK: number): SearchResult {
  const hits = [
    {
      rank: 1,
      sourceId: 'd-12',
      title: '退货政策',
      score: 0.86,
      snippet: '自签收之日起 7 日内，消费者可申请无理由退货…',
    },
    {
      rank: 2,
      sourceId: 'd-09',
      title: 'FAQ',
      score: 0.81,
      snippet: '特殊品类除外，包括定制件、鲜活易腐商品…',
    },
    {
      rank: 3,
      sourceId: 'd-05',
      title: '运费说明',
      score: 0.72,
      snippet: '退货运费由买家承担，质量问题除外…',
    },
  ].slice(0, topK);

  return {
    query,
    effectiveQuery: query.includes('退货') ? '商品退货申请时限' : query,
    hits,
    appliedFilters: ['分数阈值', '去重', '预算裁剪'],
  };
}

/** 模拟入库进度生成器 */
export async function* mockIngestProgress(): AsyncGenerator<IngestProgressEvent> {
  const total = 48;
  const files = ['退货政策.md', 'FAQ.md', '运费说明.md', '发票开具指引.md', '会员积分规则.md'];
  const stats = { added: 0, skipped: 0, replaced: 0, failed: 0, cleaned: 0 };

  for (let current = 1; current <= total; current++) {
    await new Promise((r) => setTimeout(r, 120));
    if (current % 5 === 0) stats.failed += 1;
    else if (current % 3 === 0) stats.added += 1;
    else stats.skipped += 1;

    yield {
      current,
      total,
      fileName: files[current % files.length] ?? '文档',
      stats: { ...stats },
      log: current % 5 === 0 ? 'FAQ.md 失败：内容为空，已跳过并继续' : undefined,
      done: current === total,
    };
  }
}

/** 模拟流式问答 token 生成 */
export async function* mockAskStream(question: string): AsyncGenerator<string> {
  const template = mockAnswerTemplates.default;
  const isNoGround = question.includes('跨境') || question.includes('未覆盖');
  if (isNoGround) {
    yield '__NO_GROUNDING__';
    return;
  }

  const full = template.answer;
  for (let i = 3; i <= full.length; i += 3) {
    await new Promise((r) => setTimeout(r, 35));
    yield full.slice(0, i);
  }
}

export function toCollectionSummary(detail: CollectionDetail): CollectionSummary {
  const { createdAt: _createdAt, ...summary } = detail;
  return summary;
}

export function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  };
}
