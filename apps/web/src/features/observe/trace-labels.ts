import type { RAGAttributes, RAGEvent, RAGEventName } from '@/shared/types';

const EVENT_LABELS: Partial<Record<RAGEventName, string>> = {
  'runtime.query.receive': '接收用户问题',
  'runtime.query.preprocess': '查询预处理',
  'runtime.retrieval.start': '开始检索',
  'runtime.retrieval.complete': '检索完成',
  'runtime.post_retrieval.start': '开始后处理',
  'runtime.post_retrieval.select': '片段筛选',
  'runtime.generation.start': '开始生成',
  'runtime.generation.complete': '生成完成',
  'runtime.run.complete': '运行完成',
  'runtime.run.fail': '运行失败',
  'runtime.search.complete': '检索-only 完成',
  'runtime.search.fail': '检索失败',
};

const STAGE_LABELS: Record<string, string> = {
  'pre-retrieval': '查询预处理',
  pre_retrieval: '查询预处理',
  query: '查询',
  retrieval: '检索',
  'post-retrieval': '后处理',
  post_retrieval: '后处理',
  generation: '生成',
  run: '运行',
  total: '总计',
};

export function eventLabel(name: RAGEvent['name']): string {
  return EVENT_LABELS[name] ?? name.replace(/^runtime\./, '').replace(/\./g, ' · ');
}

export function stageLabel(id: string): string {
  return STAGE_LABELS[id] ?? id;
}

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

function formatJsonPreview(value: unknown, maxLen = 120): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text.length <= maxLen) {
      return text;
    }
    return `${text.slice(0, maxLen)}…`;
  } catch {
    return undefined;
  }
}

/** 从 observer attributes 提取一行可读摘要，供时间线列表展示。 */
export function summarizeEventAttributes(event: RAGEvent): string | undefined {
  const attrs = event.attributes;
  if (!attrs) {
    return undefined;
  }

  const parts: string[] = [];
  const output = attrs.output;
  const counts = attrs.counts;
  const outcome = readString(attrs.outcome);

  if (outcome) {
    parts.push(`结果: ${outcome}`);
  }

  const effectiveQuery =
    readString(readNested(output, 'effectiveQuery')) ??
    readString(readNested(readNested(attrs.input, 'query'), 'query')) ??
    readString(readNested(output, 'query'));
  if (effectiveQuery) {
    parts.push(`有效问题: ${effectiveQuery}`);
  }

  const routeDecision = readNested(output, 'routeDecision');
  if (routeDecision !== undefined) {
    parts.push(`路由: ${formatJsonPreview(routeDecision, 80)}`);
  }

  const appliedStrategies = readNested(output, 'appliedStrategies');
  if (Array.isArray(appliedStrategies) && appliedStrategies.length > 0) {
    parts.push(`策略: ${appliedStrategies.join(', ')}`);
  }

  const candidateCount =
    readNumber(readNested(counts, 'candidates')) ??
    readNumber(readNested(output, 'candidateCount'));
  if (candidateCount !== undefined) {
    parts.push(`候选: ${candidateCount}`);
  }

  if (readNested(output, 'emptyRetrieval') === true) {
    parts.push('空检索');
  }

  const selected = readNumber(readNested(output, 'selected'));
  const dropped = readNumber(readNested(output, 'dropped'));
  if (selected !== undefined || dropped !== undefined) {
    parts.push(`选中 ${selected ?? 0} / 丢弃 ${dropped ?? 0}`);
  }

  const selectedChunkIds = readNested(output, 'selectedChunkIds');
  if (Array.isArray(selectedChunkIds) && selectedChunkIds.length > 0) {
    parts.push(
      `片段: ${selectedChunkIds.slice(0, 3).join(', ')}${selectedChunkIds.length > 3 ? '…' : ''}`,
    );
  }

  const contextChunkIds = readNested(output, 'contextChunkIds');
  if (Array.isArray(contextChunkIds) && contextChunkIds.length > 0) {
    parts.push(`上下文: ${contextChunkIds.length} 条`);
  }

  const answerPreview = readString(readNested(output, 'answerPreview'));
  if (answerPreview) {
    parts.push(`答案预览: ${answerPreview.slice(0, 80)}${answerPreview.length > 80 ? '…' : ''}`);
  }

  const error = attrs.error;
  if (typeof error === 'object' && error !== null && !Array.isArray(error)) {
    const message = readString((error as RAGAttributes).message);
    if (message) {
      parts.push(`错误: ${message}`);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function isFailureEvent(name: RAGEvent['name']): boolean {
  return name.endsWith('.fail');
}

export function formatAttributesJson(attributes: RAGAttributes | undefined): string {
  if (!attributes) {
    return '{}';
  }
  return JSON.stringify(attributes, null, 2);
}
