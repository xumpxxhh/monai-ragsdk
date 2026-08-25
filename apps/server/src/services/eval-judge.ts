import { randomUUID } from 'node:crypto';

import {
  aggregateGenerationJudgeScores,
  buildGenerationJudgePrompt,
  safeParseEvalDataset,
  scoreGenerationJudgeSample,
  type AggregatedGenerationJudgeMetrics,
  type EvalDataset,
  type GenerationJudgeInput,
  type GenerationJudgeScore,
} from '@monai-ragsdk/eval';
import type { RuntimeResult } from '@monai-ragsdk/runtime';

import { badRequest } from '../http/errors.js';
import { toGenerationJudgeInput } from '../mappers/generation-judge.js';
import type { EvalJudgeReport, EvalJudgeRequest, StrategyConfig } from '../types/api.js';
import { getGlobalStrategy, runGlobal } from './collection-registry.js';
import { getSharedStack } from './shared-stack.js';

export type GenerationJudgeCompleter = (system: string, prompt: string) => Promise<string>;

export type RunGenerationJudgeDeps = {
  runQuery?: (query: string, strategy: StrategyConfig) => Promise<RuntimeResult>;
  completeJudge?: GenerationJudgeCompleter;
};

type JudgeSampleReport = GenerationJudgeScore & {
  query: string;
  answer: string;
  refused: boolean;
};

function defaultCompleter(): GenerationJudgeCompleter {
  const { strategyModel } = getSharedStack();

  return async (system, prompt) =>
    strategyModel.complete(
      { system, prompt },
      {
        requestId: randomUUID(),
        input: { query: 'eval-judge' },
        options: {},
        startedAt: Date.now(),
      },
    );
}

async function judgeSample(
  sample: EvalDataset['samples'][number],
  result: RuntimeResult,
  completeJudge: GenerationJudgeCompleter,
): Promise<JudgeSampleReport> {
  const input = toGenerationJudgeInput(sample, result);
  const score = await completeAndScoreJudge(input, completeJudge);

  return {
    ...score,
    query: sample.query,
    answer: result.answer,
    refused: input.refused,
  };
}

/**
 * 调用注入的 LLM 并合成 GenerationJudgeScore。
 * 单样本失败不抛错，便于批量抽样/离线跑分隔离。
 */
export async function completeAndScoreJudge(
  input: GenerationJudgeInput,
  completeJudge: GenerationJudgeCompleter,
): Promise<GenerationJudgeScore> {
  let llmText: string | undefined;
  let judgeError: string | undefined;

  try {
    const prompt = buildGenerationJudgePrompt(input);
    llmText = await completeJudge(prompt.system, prompt.prompt);
  } catch (error) {
    judgeError = error instanceof Error ? error.message : 'judge 调用失败';
  }

  const score = scoreGenerationJudgeSample(input, llmText);
  return judgeError ? { ...score, parseError: judgeError } : score;
}

export function resolveJudgeCompleter(
  override?: GenerationJudgeCompleter,
): GenerationJudgeCompleter {
  return override ?? defaultCompleter();
}

/**
 * 对 golden 数据集逐条 runtime.run，再注入 LLM judge 聚合忠实度 / 相关性 / 拒答。
 * 跑 pipeline 与调模型都在本函数；packages/eval 只提供协议与纯函数。
 */
export async function runGenerationJudge(
  request: EvalJudgeRequest,
  deps: RunGenerationJudgeDeps = {},
): Promise<EvalJudgeReport> {
  const parsed = safeParseEvalDataset(request.dataset);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues.map((issue) => issue.message).join('; '));
  }

  const dataset = parsed.data;
  const strategy = request.strategy ?? getGlobalStrategy();
  const runQuery =
    deps.runQuery ?? ((query: string, applied: StrategyConfig) => runGlobal(query, request.collectionIds, applied));
  const completeJudge = resolveJudgeCompleter(deps.completeJudge);

  const samples: JudgeSampleReport[] = [];

  for (const sample of dataset.samples) {
    const result = await runQuery(sample.query, strategy);
    samples.push(await judgeSample(sample, result, completeJudge));
  }

  const aggregate: AggregatedGenerationJudgeMetrics = aggregateGenerationJudgeScores(samples);

  return {
    dataset: {
      name: dataset.name,
      version: dataset.version,
    },
    ...(request.collectionIds && request.collectionIds.length > 0
      ? { collectionIds: request.collectionIds }
      : {}),
    samples,
    aggregate,
  };
}
