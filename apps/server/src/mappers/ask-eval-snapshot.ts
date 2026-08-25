import type { EvalSample, GenerationJudgeInput, RetrievalObservation } from '@monai-ragsdk/eval';
import type { RAGEvent, RAGTrace } from '@monai-ragsdk/observability';
import type { RuntimeResult } from '@monai-ragsdk/runtime';

import { toRetrievalObservation } from './retrieval-observation.js';
import type { AskEvalSnapshot, AskTrace } from '../types/api.js';

function readString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
}

function lastEvent(trace: RAGTrace | undefined, name: string): RAGEvent | undefined {
  if (!trace) {
    return undefined;
  }

  for (let index = trace.events.length - 1; index >= 0; index -= 1) {
    const event = trace.events[index];
    if (event?.name === name) {
      return event;
    }
  }

  return undefined;
}

function readRetrievedFromObserver(value: unknown): RetrievalObservation['retrieved'] {
  if (!Array.isArray(value)) {
    return [];
  }

  const retrieved: RetrievalObservation['retrieved'] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const chunkId = readString(record.chunkId);
    if (!chunkId) {
      continue;
    }
    const score =
      typeof record.score === 'number' && Number.isFinite(record.score) ? record.score : undefined;
    retrieved.push({
      chunkId,
      rank: retrieved.length + 1,
      ...(score !== undefined ? { score } : {}),
    });
  }

  return retrieved;
}

function readSelectedChunkIds(output: unknown): string[] {
  if (!output || typeof output !== 'object') {
    return [];
  }

  const chunkIds = (output as Record<string, unknown>).chunkIds;
  if (!Array.isArray(chunkIds)) {
    return [];
  }

  return chunkIds.map((id) => readString(id)).filter((id): id is string => Boolean(id));
}

/**
 * 从 RuntimeResult 抽出在线抽样快照。
 * 必须在 ask 完成时写入 AskTrace：observer 没有 sourceId，也没有完整 answer。
 */
export function toAskEvalSnapshot(result: RuntimeResult): AskEvalSnapshot {
  const observation = toRetrievalObservation(result);

  return {
    answer: result.answer,
    refused: result.generationMetadata?.groundingRefusal === true,
    retrieved: observation.retrieved,
    selected: result.chunks.map((chunk, index) => {
      const sourceId = observation.selected[index]?.sourceId;
      return {
        chunkId: chunk.id,
        text: chunk.content,
        ...(sourceId ? { sourceId } : {}),
      };
    }),
  };
}

/**
 * 纯 observer 轨迹只能还原 chunkId 排序，没有 sourceId。
 * 用于没有 evalSnapshot 的旧 AskTrace；检索打分多半会 unscorable。
 */
export function toRetrievalObservationFromExecutionTrace(
  trace: RAGTrace | undefined,
): RetrievalObservation {
  const retrievalComplete = lastEvent(trace, 'runtime.retrieval.complete');
  const postSelect = lastEvent(trace, 'runtime.post_retrieval.select');
  const retrieved = readRetrievedFromObserver(retrievalComplete?.attributes?.candidates);
  const selectedIds = readSelectedChunkIds(postSelect?.attributes?.output);

  return {
    retrieved,
    selected: selectedIds.map((chunkId) => ({ chunkId })),
  };
}

/**
 * 优先用 AskTrace.evalSnapshot（含 sourceId）；否则回退 observer 事件。
 */
export function toRetrievalObservationFromAskTrace(trace: AskTrace): RetrievalObservation {
  if (trace.evalSnapshot) {
    return {
      retrieved: trace.evalSnapshot.retrieved,
      selected: trace.evalSnapshot.selected.map((chunk) => ({
        chunkId: chunk.chunkId,
        ...(chunk.sourceId ? { sourceId: chunk.sourceId } : {}),
      })),
    };
  }

  return toRetrievalObservationFromExecutionTrace(trace.executionTrace);
}

export type AskTraceJudgeSkipReason = 'missing_answer';

/**
 * 生成 judge 必须有完整 answer。answerPreview 一律不用。
 */
export function tryGenerationJudgeInputFromAskTrace(
  sample: EvalSample,
  trace: AskTrace,
): { input: GenerationJudgeInput } | { skip: AskTraceJudgeSkipReason } {
  const snapshot = trace.evalSnapshot;
  if (!snapshot) {
    return { skip: 'missing_answer' };
  }

  return {
    input: {
      sampleId: sample.id,
      query: sample.query,
      answer: snapshot.answer,
      contexts: snapshot.selected.map((chunk) => ({
        text: chunk.text,
        ...(chunk.sourceId ? { sourceId: chunk.sourceId } : {}),
      })),
      refused: snapshot.refused,
      ...(typeof sample.expectedRefusal === 'boolean'
        ? { expectedRefusal: sample.expectedRefusal }
        : {}),
      ...(sample.referenceAnswer ? { referenceAnswer: sample.referenceAnswer } : {}),
    },
  };
}
