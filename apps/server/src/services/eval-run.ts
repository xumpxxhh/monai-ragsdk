import {
  aggregateRetrievalMetrics,
  diffRetrievalEvalReports,
  safeParseEvalDataset,
  scoreRetrievalSample,
  type AggregatedRetrievalMetrics,
  type EvalDataset,
  type RetrievalEvalDiffReport,
  type RetrievalSampleScore,
} from '@monai-ragsdk/eval';

import { badRequest } from '../http/errors.js';
import { toRetrievalObservation } from '../mappers/retrieval-observation.js';
import type {
  EvalCompareArm,
  EvalCompareReport,
  EvalCompareRequest,
  EvalRunReport,
  EvalRunRequest,
  StrategyConfig,
} from '../types/api.js';
import { getGlobalStrategy, searchGlobal } from './collection-registry.js';

type ScoreDatasetOptions = {
  dataset: EvalDataset;
  collectionIds?: string[];
  topK: number;
  layer: 'retrieved' | 'selected';
  k?: number[];
  strategy?: StrategyConfig;
};

type ScoredDataset = {
  samples: Array<RetrievalSampleScore & { query: string }>;
  aggregate: AggregatedRetrievalMetrics;
};

async function scoreDataset(options: ScoreDatasetOptions): Promise<ScoredDataset> {
  const samples: Array<RetrievalSampleScore & { query: string }> = [];

  for (const sample of options.dataset.samples) {
    const searchResult = await searchGlobal(
      sample.query,
      options.topK,
      options.collectionIds,
      options.strategy,
    );
    const observation = toRetrievalObservation(searchResult);
    const score = scoreRetrievalSample(sample, observation, {
      layer: options.layer,
      k: options.k,
    });
    samples.push({
      ...score,
      query: sample.query,
    });
  }

  return {
    samples,
    aggregate: aggregateRetrievalMetrics(samples, { k: options.k }),
  };
}

function resolveTopK(requestTopK: number | undefined, strategy: StrategyConfig): number {
  return typeof requestTopK === 'number' && Number.isInteger(requestTopK) && requestTopK > 0
    ? requestTopK
    : strategy.retrieval.topK;
}

function resolveArmStrategy(arm: EvalCompareArm, fallback: StrategyConfig): StrategyConfig {
  return arm.strategy ?? fallback;
}

function toEvalRunReport(
  dataset: EvalDataset,
  scored: ScoredDataset,
  options: {
    layer: 'retrieved' | 'selected';
    topK: number;
    collectionIds?: string[];
    label?: string;
  },
): EvalRunReport {
  return {
    ...(options.label ? { label: options.label } : {}),
    dataset: {
      name: dataset.name,
      version: dataset.version,
    },
    layer: options.layer,
    topK: options.topK,
    ...(options.collectionIds && options.collectionIds.length > 0
      ? { collectionIds: options.collectionIds }
      : {}),
    samples: scored.samples,
    aggregate: scored.aggregate,
  };
}

/** 对 golden 数据集逐条跑 retrieve-only search 并聚合 source 级指标。 */
export async function runRetrievalEval(request: EvalRunRequest): Promise<EvalRunReport> {
  const parsed = safeParseEvalDataset(request.dataset);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues.map((issue) => issue.message).join('; '));
  }

  const dataset = parsed.data;
  const layer = request.layer ?? 'retrieved';
  const strategy = getGlobalStrategy();
  const topK = resolveTopK(request.topK, strategy);
  const scored = await scoreDataset({
    dataset,
    collectionIds: request.collectionIds,
    topK,
    layer,
    k: request.k,
  });

  return toEvalRunReport(dataset, scored, {
    layer,
    topK,
    collectionIds: request.collectionIds,
  });
}

/** 同一 dataset 在 baseline / candidate 两套策略下各跑一遍，并产出 diff 报告。 */
export async function runRetrievalEvalCompare(
  request: EvalCompareRequest,
): Promise<EvalCompareReport> {
  const parsed = safeParseEvalDataset(request.dataset);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues.map((issue) => issue.message).join('; '));
  }

  if (!request.baseline?.label?.trim()) {
    throw badRequest('baseline.label 不能为空');
  }
  if (!request.candidate?.label?.trim()) {
    throw badRequest('candidate.label 不能为空');
  }

  const dataset = parsed.data;
  const layer = request.layer ?? 'retrieved';
  const globalStrategy = getGlobalStrategy();
  const baselineStrategy = resolveArmStrategy(request.baseline, globalStrategy);
  const candidateStrategy = resolveArmStrategy(request.candidate, globalStrategy);
  const topK = resolveTopK(request.topK, baselineStrategy);

  const baselineScored = await scoreDataset({
    dataset,
    collectionIds: request.collectionIds,
    topK,
    layer,
    k: request.k,
    strategy: baselineStrategy,
  });
  const candidateScored = await scoreDataset({
    dataset,
    collectionIds: request.collectionIds,
    topK,
    layer,
    k: request.k,
    strategy: candidateStrategy,
  });

  const diff: RetrievalEvalDiffReport = diffRetrievalEvalReports({
    baselineLabel: request.baseline.label.trim(),
    candidateLabel: request.candidate.label.trim(),
    baseline: baselineScored,
    candidate: candidateScored,
    k: request.k,
    primaryK: request.primaryK,
  });

  const baselineReport = toEvalRunReport(dataset, baselineScored, {
    label: request.baseline.label.trim(),
    layer,
    topK,
    collectionIds: request.collectionIds,
  });
  const candidateReport = toEvalRunReport(dataset, candidateScored, {
    label: request.candidate.label.trim(),
    layer,
    topK,
    collectionIds: request.collectionIds,
  });

  const baselineById = new Map(baselineReport.samples.map((sample) => [sample.sampleId, sample]));
  const candidateById = new Map(candidateReport.samples.map((sample) => [sample.sampleId, sample]));

  return {
    dataset: {
      name: dataset.name,
      version: dataset.version,
    },
    layer,
    topK,
    primaryK: diff.primaryK,
    ...(request.collectionIds && request.collectionIds.length > 0
      ? { collectionIds: request.collectionIds }
      : {}),
    baseline: baselineReport,
    candidate: candidateReport,
    diff: {
      ...diff,
      sampleDiffs: diff.sampleDiffs.map((entry) => ({
        ...entry,
        baseline: baselineById.get(entry.sampleId) ?? {
          ...entry.baseline,
          query: '',
        },
        candidate: candidateById.get(entry.sampleId) ?? {
          ...entry.candidate,
          query: '',
        },
      })),
    },
  };
}
