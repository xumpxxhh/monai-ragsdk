import type { RAGEvent } from '@/shared/types';
import { POST_RETRIEVAL_CONTROLS } from '@/features/strategy/strategy-assembly';
import { isFailureEvent } from '@/features/observe/trace-labels';

/** 单条 observer 事件在 UI 上展示的结构化字段。 */
export type PresentedField = {
  label: string;
  value: string;
  /** 长文本（问题、预览）允许换行占满宽度 */
  multiline?: boolean;
  /** 强调：改写后 query、错误信息等 */
  emphasis?: boolean;
};

export type PresentedObserverEvent = {
  id: string;
  /** 中文标题，含策略名时不暴露 runtime 事件名 */
  title: string;
  stageGroup: StageGroup;
  failed: boolean;
  /** applied / passthrough / skipped 等，供徽标展示 */
  outcome?: string;
  durationMs?: number;
  fields: PresentedField[];
};

export type StageGroup = 'pre-retrieval' | 'retrieval' | 'post-retrieval' | 'generation' | 'run';

const STAGE_GROUP_LABELS: Record<StageGroup, string> = {
  'pre-retrieval': '预处理',
  retrieval: '检索',
  'post-retrieval': '后处理',
  generation: '生成',
  run: '收尾',
};

export function stageGroupLabel(group: StageGroup): string {
  return STAGE_GROUP_LABELS[group];
}

const PRE_STRATEGY_LABELS: Record<string, string> = {
  rewrite: '问题改写',
  expansion: '查询扩展',
  decomposition: '问题分解',
  'multi-query': '多路查询',
  routing: '查询路由',
};

const POST_STRATEGY_LABELS = Object.fromEntries(
  POST_RETRIEVAL_CONTROLS.map((item) => [item.id, item.label]),
) as Record<string, string>;

const OUTCOME_LABELS: Record<string, string> = {
  applied: '已生效',
  passthrough: '未改动',
  failed: '失败',
  skipped: '已跳过',
};

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readNested(obj: unknown, key: string): unknown {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return undefined;
  }
  return (obj as Record<string, unknown>)[key];
}

function strategyLabel(name: string | undefined): string | undefined {
  if (!name) {
    return undefined;
  }
  return PRE_STRATEGY_LABELS[name] ?? POST_STRATEGY_LABELS[name] ?? name;
}

function outcomeLabel(outcome: string | undefined): string | undefined {
  if (!outcome) {
    return undefined;
  }
  return OUTCOME_LABELS[outcome] ?? outcome;
}

function formatRouteDecision(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const decision = value as Record<string, unknown>;
  const parts: string[] = [];
  if (decision.retrievalMode === 'skip') {
    parts.push('跳过检索');
  }
  const targets = decision.targets;
  if (Array.isArray(targets) && targets.length > 0) {
    parts.push(`限定目标 ${targets.join('、')}`);
  }
  const searchType = readString(decision.searchType);
  if (searchType) {
    parts.push(`检索类型 ${searchType}`);
  }
  return parts.length > 0 ? parts.join('；') : undefined;
}

function formatStringList(value: unknown, joiner = '、'): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return items.length > 0 ? items.map(strategyLabel).join(joiner) : undefined;
}

function formatQueryIntent(obj: unknown, prefix: string): PresentedField[] {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return [];
  }
  const record = obj as Record<string, unknown>;
  const fields: PresentedField[] = [];
  const query = readString(record.query);
  if (query) {
    fields.push({ label: prefix, value: query, multiline: true });
  }
  const subQueries = formatStringList(record.subQueries, '；');
  if (subQueries) {
    fields.push({ label: '子查询', value: subQueries, multiline: true });
  }
  const route = readString(record.route);
  if (route) {
    fields.push({ label: '路由', value: route });
  }
  const routeDecision = formatRouteDecision(record.routeDecision);
  if (routeDecision) {
    fields.push({ label: '路由决策', value: routeDecision });
  }
  const strategies = formatStringList(record.appliedStrategies, ' → ');
  if (strategies) {
    fields.push({ label: '已生效策略', value: strategies });
  }
  return fields;
}

function formatCounts(counts: unknown, mapping: Record<string, string>): PresentedField[] {
  if (typeof counts !== 'object' || counts === null || Array.isArray(counts)) {
    return [];
  }
  const record = counts as Record<string, unknown>;
  return Object.entries(mapping)
    .map(([key, label]) => {
      const num = readNumber(record[key]);
      return num !== undefined ? { label, value: String(num) } : null;
    })
    .filter((item): item is PresentedField => item !== null);
}

function formatCandidates(value: unknown, max = 3): PresentedField | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const lines = value.slice(0, max).map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      return `#${index + 1}`;
    }
    const ref = item as Record<string, unknown>;
    const chunkId = readString(ref.chunkId) ?? '未知片段';
    const score = readNumber(ref.score);
    const kind = readString(ref.scoreKind);
    const shortId = chunkId.length > 12 ? `${chunkId.slice(0, 12)}…` : chunkId;
    const scoreText = score !== undefined ? ` · ${score.toFixed(2)}` : '';
    const kindText = kind ? ` (${kind})` : '';
    return `#${index + 1} ${shortId}${scoreText}${kindText}`;
  });
  const suffix = value.length > max ? ` 等共 ${value.length} 条` : ` 共 ${value.length} 条`;
  return { label: '候选片段', value: lines.join('\n') + suffix, multiline: true };
}

function formatDecisions(value: unknown): PresentedField[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }
  let kept = 0;
  let dropped = 0;
  const reasonCounts = new Map<string, number>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const decision = item as Record<string, unknown>;
    if (decision.selected === true) {
      kept += 1;
    } else {
      dropped += 1;
      const reason = readString(decision.reason) ?? readString(decision.stage) ?? '其他';
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  const fields: PresentedField[] = [
    { label: '保留', value: String(kept) },
    { label: '丢弃', value: String(dropped) },
  ];
  if (reasonCounts.size > 0) {
    const detail = [...reasonCounts.entries()]
      .map(([reason, count]) => `${strategyLabel(reason) ?? reason} ${count}`)
      .join('；');
    fields.push({ label: '丢弃原因', value: detail, multiline: true });
  }
  return fields;
}

function resolveStageGroup(name: string): StageGroup {
  if (name.startsWith('runtime.query.') || name.startsWith('runtime.query_strategy.')) {
    return 'pre-retrieval';
  }
  if (
    name.startsWith('runtime.retrieval.') ||
    name.startsWith('runtime.retrieval_fanout.') ||
    name.startsWith('runtime.retrieval_fuse.')
  ) {
    return 'retrieval';
  }
  if (
    name.startsWith('runtime.post_retrieval.') ||
    name.startsWith('runtime.post_retrieval_strategy.')
  ) {
    return 'post-retrieval';
  }
  if (name.startsWith('runtime.generation.')) {
    return 'generation';
  }
  return 'run';
}

function eventTitle(name: string, strategyName?: string): string {
  const friendlyStrategy = strategyLabel(strategyName);
  const map: Record<string, string> = {
    'runtime.query.receive': '收到用户问题',
    'runtime.query.preprocess': '预处理完成',
    'runtime.query_strategy.complete': friendlyStrategy
      ? `查询策略 · ${friendlyStrategy}`
      : '查询策略',
    'runtime.query_strategy.fail': friendlyStrategy
      ? `查询策略失败 · ${friendlyStrategy}`
      : '查询策略失败',
    'runtime.retrieval.start': '开始检索',
    'runtime.retrieval.complete': '检索完成',
    'runtime.retrieval_fanout.complete': 'FanOut 单路召回',
    'runtime.retrieval_fanout.fail': 'FanOut 单路失败',
    'runtime.retrieval_fuse.complete': '多路结果融合',
    'runtime.post_retrieval.start': '开始后处理',
    'runtime.post_retrieval.select': '后处理完成',
    'runtime.post_retrieval_strategy.complete': friendlyStrategy
      ? `后处理策略 · ${friendlyStrategy}`
      : '后处理策略',
    'runtime.post_retrieval_strategy.fail': friendlyStrategy
      ? `后处理策略失败 · ${friendlyStrategy}`
      : '后处理策略失败',
    'runtime.generation.start': '开始生成答案',
    'runtime.generation.complete': '生成完成',
    'runtime.run.complete': '问答运行完成',
    'runtime.run.fail': '问答运行失败',
    'runtime.search.complete': '仅检索完成',
    'runtime.search.fail': '仅检索失败',
  };
  return (
    map[name] ??
    name
      .replace(/^runtime\./, '')
      .replace(/_/g, ' ')
      .replace(/\./g, ' · ')
  );
}

function readStrategyName(attrs: Record<string, unknown> | undefined): string | undefined {
  const strategy = readNested(attrs?.strategy, 'name');
  return readString(strategy);
}

/**
 * 按 observability README 的 attributes 约定，把单条 observer 事件拆成 UI 字段。
 * 不输出原始 JSON；缺字段则跳过，不凑空行。
 */
export function presentObserverEvent(event: RAGEvent, index: number): PresentedObserverEvent {
  const attrs = event.attributes as Record<string, unknown> | undefined;
  const strategyName = readStrategyName(attrs);
  const failed = isFailureEvent(event.name) || readString(attrs?.outcome) === 'failed';
  const outcome = outcomeLabel(readString(attrs?.outcome));
  const fields: PresentedField[] = [];
  const output = attrs?.output;
  const input = attrs?.input;
  const counts = attrs?.counts;

  switch (event.name) {
    case 'runtime.query.receive': {
      const query = readString(readNested(output, 'query'));
      if (query) {
        fields.push({ label: '用户问题', value: query, multiline: true });
      }
      break;
    }
    case 'runtime.query.preprocess':
      fields.push(...formatQueryIntent(output, '有效问题'));
      break;

    case 'runtime.query_strategy.complete': {
      if (outcome) {
        fields.push({ label: '策略结果', value: outcome, emphasis: outcome === '已生效' });
      }
      const beforeQuery = readString(readNested(input, 'query'));
      const afterQuery = readString(readNested(output, 'query'));
      if (beforeQuery && afterQuery && beforeQuery !== afterQuery) {
        fields.push({ label: '改写前', value: beforeQuery, multiline: true });
        fields.push({ label: '改写后', value: afterQuery, multiline: true, emphasis: true });
      } else {
        fields.push(...formatQueryIntent(output, '检索意图'));
      }
      break;
    }

    case 'runtime.retrieval.start': {
      const query = readString(readNested(output, 'query'));
      if (query) {
        fields.push({ label: '检索 query', value: query, multiline: true });
      }
      break;
    }

    case 'runtime.retrieval.complete': {
      fields.push(
        ...formatCounts(counts, {
          candidates: '召回候选',
        }),
      );
      if (readNested(output, 'skipped') === true) {
        fields.push({ label: '检索', value: '已跳过', emphasis: true });
      }
      const provider = readString(readNested(output, 'provider'));
      if (provider) {
        fields.push({
          label: '检索方式',
          value: provider === 'fan-out' ? '多库 FanOut + 融合' : provider,
        });
      }
      const candidates = formatCandidates(attrs?.candidates);
      if (candidates) {
        fields.push(candidates);
      }
      break;
    }

    case 'runtime.retrieval_fanout.complete': {
      const indexNum = readNumber(readNested(input, 'index'));
      const subQuery = readString(readNested(input, 'query'));
      if (indexNum !== undefined) {
        fields.push({ label: '子查询序号', value: String(indexNum + 1) });
      }
      if (subQuery) {
        fields.push({ label: '子 query', value: subQuery, multiline: true });
      }
      fields.push(...formatCounts(counts, { candidates: '本路召回' }));
      const candidates = formatCandidates(attrs?.candidates, 2);
      if (candidates) {
        fields.push(candidates);
      }
      break;
    }

    case 'runtime.retrieval_fuse.complete': {
      fields.push(
        ...formatCounts(counts, {
          subQueries: '子查询路数',
          fused: '融合后候选',
        }),
      );
      const candidates = formatCandidates(attrs?.candidates, 3);
      if (candidates) {
        fields.push(candidates);
      }
      break;
    }

    case 'runtime.post_retrieval.start':
      fields.push(...formatCounts(counts, { candidates: '待处理候选' }));
      break;

    case 'runtime.post_retrieval_strategy.complete': {
      if (outcome) {
        fields.push({ label: '策略结果', value: outcome, emphasis: outcome === '已生效' });
      }
      fields.push(
        ...formatCounts(counts, {
          input: '输入候选',
          selected: '策略后保留',
          dropped: '本步丢弃',
          compressed: '压缩条数',
        }),
      );
      fields.push(...formatDecisions(attrs?.decisions));
      break;
    }

    case 'runtime.post_retrieval.select': {
      fields.push(
        ...formatCounts(counts, {
          input: '输入候选',
          selected: '选中',
          dropped: '丢弃',
          chunks: '进入生成',
        }),
      );
      const strategies = formatStringList(readNested(output, 'appliedStrategies'), ' → ');
      if (strategies) {
        fields.push({ label: '生效的后处理', value: strategies, multiline: true });
      }
      const chunkIds = readNested(output, 'chunkIds');
      if (Array.isArray(chunkIds)) {
        fields.push({ label: '片段 ID 数', value: String(chunkIds.length) });
      }
      break;
    }

    case 'runtime.generation.start':
      fields.push(...formatCounts(counts, { chunks: '依据片段' }));
      {
        const emptyReason = readString(readNested(output, 'chunksEmptyReason'));
        if (emptyReason) {
          fields.push({
            label: '空依据原因',
            value: emptyReason === 'skipped' ? '路由跳过检索' : emptyReason,
            emphasis: true,
          });
        }
      }
      break;

    case 'runtime.generation.complete': {
      fields.push(
        ...formatCounts(counts, {
          chunks: '依据片段',
          citations: '引用数',
        }),
      );
      const model = readString(readNested(output, 'model'));
      if (model) {
        fields.push({ label: '模型', value: model });
      }
      const preview = readString(readNested(output, 'answerPreview'));
      if (preview) {
        fields.push({ label: '答案预览', value: preview, multiline: true });
      }
      break;
    }

    case 'runtime.run.complete':
    case 'runtime.search.complete':
      fields.push(...formatCounts(counts, { chunks: '最终片段' }));
      break;

    default:
      break;
  }

  // 失败类事件：统一补错误信息
  if (failed) {
    const err = attrs?.error;
    const message = readString(readNested(err, 'message'));
    if (message) {
      fields.unshift({ label: '错误', value: message, multiline: true, emphasis: true });
    }
    const stage = readString(readNested(output, 'stage'));
    if (stage) {
      fields.push({ label: '失败阶段', value: stage });
    }
  }

  // 兜底：未专门映射的事件，尝试从通用键提取
  if (fields.length === 0) {
    fields.push(...formatQueryIntent(output, '输出'));
    fields.push(...formatQueryIntent(input, '输入'));
    fields.push(
      ...formatCounts(counts, {
        candidates: '候选',
        selected: '选中',
        dropped: '丢弃',
        chunks: '片段',
        fused: '融合',
        subQueries: '子查询',
        citations: '引用',
      }),
    );
  }

  return {
    id: `${event.name}-${event.timestamp}-${index}`,
    title: eventTitle(event.name, strategyName),
    stageGroup: resolveStageGroup(event.name),
    failed,
    outcome,
    durationMs: event.durationMs,
    fields,
  };
}

/** 按四段分组并保持时间顺序，供右侧栏分段渲染。 */
export function groupPresentedEvents(
  events: RAGEvent[],
): Array<{ group: StageGroup; label: string; items: PresentedObserverEvent[] }> {
  const order: StageGroup[] = ['pre-retrieval', 'retrieval', 'post-retrieval', 'generation', 'run'];
  const buckets = new Map<StageGroup, PresentedObserverEvent[]>();

  events.forEach((event, index) => {
    const presented = presentObserverEvent(event, index);
    const list = buckets.get(presented.stageGroup) ?? [];
    list.push(presented);
    buckets.set(presented.stageGroup, list);
  });

  return order
    .filter((group) => (buckets.get(group)?.length ?? 0) > 0)
    .map((group) => ({
      group,
      label: stageGroupLabel(group),
      items: buckets.get(group)!,
    }));
}
