import type { JsonValue } from '@monai-ragsdk/core';

import type { RetrievalRequest, RetrievalScoreKind } from '../types/index.js';

export type ObservationScoreKind = RetrievalScoreKind;

export type ObservationOutcome = 'applied' | 'passthrough' | 'failed' | 'skipped';

export type ObservationCandidateRef = {
  chunkId: string;
  score?: number;
  scoreKind?: ObservationScoreKind;
};

export type ObservationDecisionRef = {
  chunkId: string;
  selected: boolean;
  reason: string;
  stage?: string;
  score?: number;
  order?: number;
};

export type ObservationErrorRef = {
  name: string;
  message: string;
  code?: string;
};

/**
 * 按语义组装 observer attributes；缺省键不写。
 * 不发明 role/title 等展示分类，分层仍靠 event.name。
 */
export function buildObservationAttributes(input: {
  strategy?: { name: string; index: number };
  outcome?: ObservationOutcome;
  input?: JsonValue;
  output?: JsonValue;
  counts?: Record<string, number>;
  candidates?: ObservationCandidateRef[];
  decisions?: ObservationDecisionRef[];
  error?: ObservationErrorRef;
}): Record<string, JsonValue> | undefined {
  const attributes: Record<string, JsonValue> = {};

  if (input.strategy) {
    attributes.strategy = {
      name: input.strategy.name,
      index: input.strategy.index,
    };
  }

  if (input.outcome) {
    attributes.outcome = input.outcome;
  }

  if (input.input !== undefined) {
    attributes.input = input.input;
  }

  if (input.output !== undefined) {
    attributes.output = input.output;
  }

  if (input.counts && Object.keys(input.counts).length > 0) {
    attributes.counts = input.counts;
  }

  if (input.candidates) {
    attributes.candidates = input.candidates.map(candidateRefToJson);
  }

  if (input.decisions && input.decisions.length > 0) {
    attributes.decisions = input.decisions.map(decisionRefToJson);
  }

  if (input.error) {
    const error: Record<string, JsonValue> = {
      name: input.error.name,
      message: input.error.message,
    };
    if (input.error.code) {
      error.code = input.error.code;
    }
    attributes.error = error;
  }

  return Object.keys(attributes).length > 0 ? attributes : undefined;
}

/** query 策略步进用的检索意图快照；不含 appliedStrategies（那是编排器后写字段）。 */
export function queryIntentSnapshot(request: RetrievalRequest): JsonValue {
  const snapshot: Record<string, JsonValue> = {
    query: request.effectiveQuery.query,
  };
  const subQueries = subQueryTexts(request.subQueries);
  if (subQueries) {
    snapshot.subQueries = subQueries;
  }
  if (request.route) {
    snapshot.route = request.route;
  }
  if (request.routeDecision) {
    snapshot.routeDecision = request.routeDecision as JsonValue;
  }
  if (request.filters) {
    snapshot.filters = request.filters as JsonValue;
  }

  return snapshot;
}

/** 阶段检查点 preprocess 的产物；可含 appliedStrategies，不含 request.strategy（那可能是 route 名）。 */
export function queryCheckpointOutput(request: RetrievalRequest): JsonValue {
  const snapshot = queryIntentSnapshot(request);
  if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) {
    return snapshot;
  }

  if (request.appliedStrategies && request.appliedStrategies.length > 0) {
    return {
      ...snapshot,
      appliedStrategies: request.appliedStrategies,
    };
  }

  return snapshot;
}

export function subQueryTexts(subQueries: RetrievalRequest['subQueries']): string[] | undefined {
  if (!subQueries || subQueries.length === 0) {
    return undefined;
  }

  return subQueries.map((query) => query.query);
}

function candidateRefToJson(candidate: ObservationCandidateRef): JsonValue {
  const item: Record<string, JsonValue> = {
    chunkId: candidate.chunkId,
  };
  if (candidate.score !== undefined) {
    item.score = candidate.score;
  }
  if (candidate.scoreKind) {
    item.scoreKind = candidate.scoreKind;
  }
  return item;
}

function decisionRefToJson(decision: ObservationDecisionRef): JsonValue {
  const item: Record<string, JsonValue> = {
    chunkId: decision.chunkId,
    selected: decision.selected,
    reason: decision.reason,
  };
  if (decision.stage) {
    item.stage = decision.stage;
  }
  if (decision.score !== undefined) {
    item.score = decision.score;
  }
  if (decision.order !== undefined) {
    item.order = decision.order;
  }
  return item;
}
