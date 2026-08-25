import {
  aggregateGenerationJudgeScores,
  aggregateRetrievalMetrics,
  safeParseEvalDataset,
  scoreRetrievalSample,
  type EvalSample,
} from '@monai-ragsdk/eval';

import { badRequest, notFound } from '../http/errors.js';
import {
  toRetrievalObservationFromAskTrace,
  tryGenerationJudgeInputFromAskTrace,
} from '../mappers/ask-eval-snapshot.js';
import type {
  AskTrace,
  EvalFromTracesJudgeSampleReport,
  EvalFromTracesReport,
  EvalFromTracesRequest,
} from '../types/api.js';
import { getAskTrace, listAskTraces } from './activity-store.js';
import {
  completeAndScoreJudge,
  resolveJudgeCompleter,
  type GenerationJudgeCompleter,
} from './eval-judge.js';
import { getObserverTrace } from './shared-stack.js';

export type RunEvalFromTracesDeps = {
  listTraces?: (collectionId?: string) => AskTrace[];
  getTrace?: (id: string) => AskTrace | undefined;
  getObserver?: (id: string) => AskTrace['executionTrace'];
  completeJudge?: GenerationJudgeCompleter;
};

function normalizeQuery(value: string): string {
  return value.trim();
}

function hydrateTrace(trace: AskTrace, getObserver: (id: string) => AskTrace['executionTrace']): AskTrace {
  if (trace.executionTrace || trace.evalSnapshot) {
    return trace;
  }

  const executionTrace = getObserver(trace.id);
  return executionTrace ? { ...trace, executionTrace } : trace;
}

function collectTraces(
  request: EvalFromTracesRequest,
  deps: {
    listTraces: (collectionId?: string) => AskTrace[];
    getTrace: (id: string) => AskTrace | undefined;
    getObserver: (id: string) => AskTrace['executionTrace'];
  },
): AskTrace[] {
  if (request.traceIds && request.traceIds.length > 0) {
    const traces: AskTrace[] = [];
    for (const id of request.traceIds) {
      const trace = deps.getTrace(id);
      if (!trace) {
        throw notFound(`轨迹不存在: ${id}`);
      }
      traces.push(hydrateTrace(trace, deps.getObserver));
    }
    return traces;
  }

  return deps
    .listTraces(request.collectionId)
    .filter((trace) => trace.success)
    .map((trace) => hydrateTrace(trace, deps.getObserver));
}

/**
 * 按提问对齐 golden 与 ask 轨迹：精确匹配 question，其次 effectiveQuestion。
 * 每条轨迹最多用一次，优先较新的（listAskTraces 最新在前）。
 */
export function matchSamplesToTraces(
  samples: EvalSample[],
  traces: AskTrace[],
): {
  matched: Array<{ sample: EvalSample; trace: AskTrace }>;
  unmatchedSampleIds: string[];
} {
  const remaining = [...traces];
  const matched: Array<{ sample: EvalSample; trace: AskTrace }> = [];
  const unmatchedSampleIds: string[] = [];

  for (const sample of samples) {
    const query = normalizeQuery(sample.query);
    const index = remaining.findIndex((trace) => {
      if (normalizeQuery(trace.question) === query) {
        return true;
      }
      return Boolean(trace.effectiveQuestion && normalizeQuery(trace.effectiveQuestion) === query);
    });

    if (index < 0) {
      unmatchedSampleIds.push(sample.id);
      continue;
    }

    matched.push({ sample, trace: remaining[index]! });
    remaining.splice(index, 1);
  }

  return { matched, unmatchedSampleIds };
}

/**
 * 用已记录的 ask 轨迹对照 golden 打检索分；有 evalSnapshot 时才跑生成 judge。
 * 不重跑 pipeline，也不把 answerPreview 当完整答案。
 */
export async function runEvalFromTraces(
  request: EvalFromTracesRequest,
  deps: RunEvalFromTracesDeps = {},
): Promise<EvalFromTracesReport> {
  const parsed = safeParseEvalDataset(request.dataset);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues.map((issue) => issue.message).join('; '));
  }

  const dataset = parsed.data;
  const layer = request.layer ?? 'retrieved';
  const includeJudge = request.includeJudge !== false;
  const traces = collectTraces(request, {
    listTraces: deps.listTraces ?? ((collectionId) => listAskTraces({ collectionId })),
    getTrace: deps.getTrace ?? getAskTrace,
    getObserver: deps.getObserver ?? ((id) => getObserverTrace(id)),
  });

  const { matched, unmatchedSampleIds } = matchSamplesToTraces(dataset.samples, traces);
  const retrievalSamples = matched.map(({ sample, trace }) => {
    const observation = toRetrievalObservationFromAskTrace(trace);
    const score = scoreRetrievalSample(sample, observation, {
      layer,
      k: request.k,
    });
    return {
      ...score,
      query: sample.query,
      traceId: trace.id,
    };
  });

  const skippedJudgeSampleIds: string[] = [];
  const judgeSamples: EvalFromTracesJudgeSampleReport[] = [];

  if (includeJudge) {
    const completeJudge = resolveJudgeCompleter(deps.completeJudge);
    for (const { sample, trace } of matched) {
      const judged = tryGenerationJudgeInputFromAskTrace(sample, trace);
      if ('skip' in judged) {
        skippedJudgeSampleIds.push(sample.id);
        continue;
      }

      const score = await completeAndScoreJudge(judged.input, completeJudge);
      judgeSamples.push({
        ...score,
        query: sample.query,
        answer: judged.input.answer,
        refused: judged.input.refused,
        traceId: trace.id,
      });
    }
  }

  return {
    dataset: {
      name: dataset.name,
      version: dataset.version,
    },
    layer,
    ...(request.collectionId ? { collectionId: request.collectionId } : {}),
    matchedSampleCount: matched.length,
    unmatchedSampleIds,
    skippedJudgeSampleIds,
    retrieval: {
      samples: retrievalSamples,
      aggregate: aggregateRetrievalMetrics(retrievalSamples, { k: request.k }),
    },
    ...(includeJudge && judgeSamples.length > 0
      ? {
          judge: {
            samples: judgeSamples,
            aggregate: aggregateGenerationJudgeScores(judgeSamples),
          },
        }
      : {}),
  };
}
