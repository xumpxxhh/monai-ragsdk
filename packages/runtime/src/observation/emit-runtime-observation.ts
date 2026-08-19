import type {
  PostRetrievalSelectionTraceEntry,
  RetrievalCandidate,
  RetrievalRequest,
  RuntimeContext,
  RuntimeObservationErrorRecord,
  RuntimeObservationRecord,
} from '../types/index.js';

import {
  subQueryTexts,
  type ObservationCandidateRef,
  type ObservationDecisionRef,
  type ObservationScoreKind,
} from './build-observation-attributes.js';

/**
 * 安全打点：observe 缺失或回调失败都不应由调用方再包一层。
 * 失败隔离发生在 run-runtime 注入的 sink 内。
 */
export async function emitRuntimeObservation(
  context: RuntimeContext,
  record: RuntimeObservationRecord,
): Promise<void> {
  await context.observe?.emit(record);
}

export async function emitRuntimeObservationError(
  context: RuntimeContext,
  record: RuntimeObservationErrorRecord,
): Promise<void> {
  await context.observe?.emitError?.(record);
}

export function toObservationError(error: unknown): RuntimeObservationErrorRecord['error'] {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: 'Error',
    message: String(error),
  };
}

/** 观测 candidates 只用 id / score / 分数口径，避免把 chunk 正文带进 trace。 */
export function summarizeCandidates(
  candidates: RetrievalCandidate[],
  scoreKind?: ObservationScoreKind,
): ObservationCandidateRef[] {
  return candidates.map((candidate) => {
    const item: ObservationCandidateRef = {
      chunkId: candidate.chunk.id,
    };

    if (candidate.score !== undefined) {
      item.score = candidate.score;
    }

    if (scoreKind) {
      item.scoreKind = scoreKind;
    }

    return item;
  });
}

/**
 * 把 selectionTrace 压成对账用 decisions；不含 candidate 整对象和 originalContent。
 * stageOverride 用于策略步进：用策略名覆盖误导性的 selectionTrace.stage。
 */
export function compactSelectionDecisions(
  selectionTrace: PostRetrievalSelectionTraceEntry[] | undefined,
  stageOverride?: string,
): ObservationDecisionRef[] | undefined {
  if (!selectionTrace || selectionTrace.length === 0) {
    return undefined;
  }

  return selectionTrace.map((entry) => {
    const decision: ObservationDecisionRef = {
      chunkId: entry.candidate.chunk.id,
      selected: entry.selected,
      reason: entry.reason,
    };

    const stage = stageOverride ?? entry.stage;
    if (stage) {
      decision.stage = stage;
    }

    if (entry.score !== undefined) {
      decision.score = entry.score;
    }

    if (entry.order !== undefined) {
      decision.order = entry.order;
    }

    return decision;
  });
}

/**
 * 引用相同视为透传；否则只比检索意图字段，忽略 appliedStrategies 等编排器后写字段。
 */
export function isQueryStrategyPassthrough(
  before: RetrievalRequest,
  after: RetrievalRequest,
): boolean {
  if (before === after) {
    return true;
  }

  return (
    before.effectiveQuery.query === after.effectiveQuery.query &&
    sameStringList(subQueryTexts(before.subQueries), subQueryTexts(after.subQueries)) &&
    before.route === after.route &&
    before.rewriteReason === after.rewriteReason &&
    stableJson(before.filters) === stableJson(after.filters) &&
    stableJson(before.budget) === stableJson(after.budget) &&
    before.topK === after.topK
  );
}

function sameStringList(left: string[] | undefined, right: string[] | undefined): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return !left && !right;
  }

  return left.every((value, index) => value === right[index]);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}
