import { apiPost } from '@/shared/api/http';
import type {
  EvalCompareReport,
  EvalFromTracesReport,
  EvalJudgeReport,
  EvalMetricLayer,
  EvalRunReport,
  StrategyConfig,
} from '@/shared/types';

/** POST /eval/run：retrieve-only 批量打分。 */
export async function runEval(input: {
  dataset: unknown;
  collectionIds?: string[];
  topK?: number;
  layer?: EvalMetricLayer;
  k?: number[];
}): Promise<EvalRunReport> {
  return apiPost<EvalRunReport>('/eval/run', input);
}

/** POST /eval/compare：两套策略各跑一遍；省略 strategy 则用当前全局装配。 */
export async function compareEval(input: {
  dataset: unknown;
  baseline: { label: string; strategy?: StrategyConfig };
  candidate: { label: string; strategy?: StrategyConfig };
  collectionIds?: string[];
  topK?: number;
  layer?: EvalMetricLayer;
  k?: number[];
  primaryK?: number;
}): Promise<EvalCompareReport> {
  return apiPost<EvalCompareReport>('/eval/compare', input);
}

/** POST /eval/judge：runtime.run + LLM 忠实度 / 相关性。 */
export async function judgeEval(input: {
  dataset: unknown;
  collectionIds?: string[];
  strategy?: StrategyConfig;
}): Promise<EvalJudgeReport> {
  return apiPost<EvalJudgeReport>('/eval/judge', input);
}

/** POST /eval/from-traces：已落盘 ask 轨迹对照 golden，不重跑 pipeline。 */
export async function evalFromTraces(input: {
  dataset: unknown;
  traceIds?: string[];
  collectionId?: string;
  layer?: EvalMetricLayer;
  k?: number[];
  includeJudge?: boolean;
}): Promise<EvalFromTracesReport> {
  return apiPost<EvalFromTracesReport>('/eval/from-traces', input);
}
