import { cn } from '@/shared/utils';
import type {
  EvalAggregateReport,
  EvalCompareReport,
  EvalFromTracesReport,
  EvalJudgeAggregateReport,
  EvalJudgeReport,
  EvalRunReport,
  EvalSampleDiffVerdict,
} from '@/shared/types';
import { formatScore, metricAtK, VERDICT_CLASS, VERDICT_LABEL } from './eval-format';

function IdChips({ ids, empty }: { ids: string[]; empty?: string }) {
  if (ids.length === 0) {
    return empty ? <span className="text-xs text-muted">{empty}</span> : null;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <span key={id} className="rounded-ctrl bg-canvas px-1.5 py-0.5 font-mono text-xs text-muted">
          {id}
        </span>
      ))}
    </div>
  );
}

function RetrievalAggregate({ report }: { report: EvalAggregateReport }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          可评分 <strong>{report.scoredSampleCount}</strong>
        </span>
        <span>
          不可评分 <strong>{report.unscorableSampleCount}</strong>
        </span>
        <span>
          平均 MRR <strong>{formatScore(report.meanMrr)}</strong>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">@k</th>
              <th className="py-1 pr-3 font-medium">recall</th>
              <th className="py-1 pr-3 font-medium">precision</th>
              <th className="py-1 pr-3 font-medium">hitRate</th>
              <th className="py-1 font-medium">nDCG</th>
            </tr>
          </thead>
          <tbody>
            {report.meanAtK.map((row) => (
              <tr key={row.k} className="border-t border-line">
                <td className="py-1 pr-3 font-mono">{row.k}</td>
                <td className="py-1 pr-3 font-mono">{formatScore(row.recall)}</td>
                <td className="py-1 pr-3 font-mono">{formatScore(row.precision)}</td>
                <td className="py-1 pr-3 font-mono">{formatScore(row.hitRate)}</td>
                <td className="py-1 font-mono">{formatScore(row.ndcg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.unscorableSampleIds.length > 0 ? (
        <div>
          <p className="mb-1 text-xs text-muted">不可评分样本（缺 sourceId / coverage=0）</p>
          <IdChips ids={report.unscorableSampleIds} />
        </div>
      ) : null}
    </div>
  );
}

function JudgeAggregate({ report }: { report: EvalJudgeAggregateReport }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          忠实度 <strong>{formatScore(report.meanFaithfulness)}</strong>
          <span className="text-muted">（{report.faithfulnessSampleCount}）</span>
        </span>
        <span>
          相关性 <strong>{formatScore(report.meanRelevance)}</strong>
          <span className="text-muted">（{report.relevanceSampleCount}）</span>
        </span>
        <span>
          拒答 <strong>{formatScore(report.meanRefusalCorrectness)}</strong>
          <span className="text-muted">（{report.refusalSampleCount}）</span>
        </span>
      </div>
      {report.unscorableSampleIds.length > 0 ? (
        <div>
          <p className="mb-1 text-xs text-muted">三维皆空、未计入聚合</p>
          <IdChips ids={report.unscorableSampleIds} />
        </div>
      ) : null}
    </div>
  );
}

function RetrievalSamples({
  samples,
}: {
  samples: EvalRunReport['samples'];
}) {
  const primaryK = samples[0]?.atK.at(-1)?.k;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted">
          <tr>
            <th className="py-1 pr-3 font-medium">样本</th>
            <th className="py-1 pr-3 font-medium">提问</th>
            <th className="py-1 pr-3 font-medium">coverage</th>
            <th className="py-1 pr-3 font-medium">MRR</th>
            {primaryK ? <th className="py-1 font-medium">recall@{primaryK}</th> : null}
          </tr>
        </thead>
        <tbody>
          {samples.map((sample) => (
            <tr key={sample.sampleId} className="border-t border-line align-top">
              <td className="py-1.5 pr-3 font-mono">{sample.sampleId}</td>
              <td className="max-w-xs truncate py-1.5 pr-3">{sample.query}</td>
              <td className="py-1.5 pr-3 font-mono">
                {sample.unscorable ? '不可评' : formatScore(sample.coverage, 2)}
              </td>
              <td className="py-1.5 pr-3 font-mono">{sample.unscorable ? '—' : formatScore(sample.mrr)}</td>
              {primaryK ? (
                <td className="py-1.5 font-mono">
                  {sample.unscorable ? '—' : formatScore(metricAtK(sample.atK, primaryK)?.recall)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JudgeSamples({ samples }: { samples: EvalJudgeReport['samples'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted">
          <tr>
            <th className="py-1 pr-3 font-medium">样本</th>
            <th className="py-1 pr-3 font-medium">忠实度</th>
            <th className="py-1 pr-3 font-medium">相关性</th>
            <th className="py-1 pr-3 font-medium">拒答</th>
            <th className="py-1 font-medium">答案</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((sample) => (
            <tr key={sample.sampleId} className="border-t border-line align-top">
              <td className="py-1.5 pr-3 font-mono">{sample.sampleId}</td>
              <td className="py-1.5 pr-3 font-mono">{formatScore(sample.faithfulness)}</td>
              <td className="py-1.5 pr-3 font-mono">{formatScore(sample.relevance)}</td>
              <td className="py-1.5 pr-3 font-mono">{formatScore(sample.refusalCorrectness)}</td>
              <td className="max-w-sm truncate py-1.5" title={sample.parseError ?? sample.answer}>
                {sample.parseError ?? sample.answer}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VerdictCounts({
  improved,
  regressed,
  unchanged,
  incomparable,
}: Record<EvalSampleDiffVerdict, string[]>) {
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <span className={VERDICT_CLASS.improved}>提升 {improved.length}</span>
      <span className={VERDICT_CLASS.regressed}>回退 {regressed.length}</span>
      <span className={VERDICT_CLASS.unchanged}>持平 {unchanged.length}</span>
      <span className={VERDICT_CLASS.incomparable}>不可比 {incomparable.length}</span>
    </div>
  );
}

/** 检索跑分报告：聚合 + 样本表。 */
export function EvalRunResult({ report }: { report: EvalRunReport }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {report.dataset.name}@{report.dataset.version} · {report.layer} · topK {report.topK}
      </p>
      <RetrievalAggregate report={report.aggregate} />
      <RetrievalSamples samples={report.samples} />
    </div>
  );
}

/** 回归对比：verdict 汇总 + 样本 diff。 */
export function EvalCompareResult({ report }: { report: EvalCompareReport }) {
  const { diff } = report;
  const primaryRecall = metricAtK(diff.aggregateDelta.meanAtKDelta, diff.primaryK);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {diff.baselineLabel} → {diff.candidateLabel} · primaryK {diff.primaryK}
      </p>
      <VerdictCounts
        improved={diff.improvedSampleIds}
        regressed={diff.regressedSampleIds}
        unchanged={diff.unchangedSampleIds}
        incomparable={diff.incomparableSampleIds}
      />
      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          ΔMRR <strong>{formatScore(diff.aggregateDelta.meanMrrDelta)}</strong>
        </span>
        <span>
          Δrecall@{diff.primaryK}{' '}
          <strong>{formatScore(primaryRecall?.recallDelta ?? null)}</strong>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">样本</th>
              <th className="py-1 pr-3 font-medium">判定</th>
              <th className="py-1 pr-3 font-medium">ΔMRR</th>
              <th className="py-1 font-medium">Δrecall@{diff.primaryK}</th>
            </tr>
          </thead>
          <tbody>
            {diff.sampleDiffs.map((item) => (
              <tr key={item.sampleId} className="border-t border-line">
                <td className="py-1.5 pr-3 font-mono">{item.sampleId}</td>
                <td className={cn('py-1.5 pr-3', VERDICT_CLASS[item.verdict])}>
                  {VERDICT_LABEL[item.verdict]}
                </td>
                <td className="py-1.5 pr-3 font-mono">{formatScore(item.mrrDelta)}</td>
                <td className="py-1.5 font-mono">
                  {formatScore(
                    item.atKDelta.find((row) => row.k === diff.primaryK)?.recallDelta ?? null,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 生成 judge：三维均分 + 样本。 */
export function EvalJudgeResult({ report }: { report: EvalJudgeReport }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {report.dataset.name}@{report.dataset.version}
      </p>
      <JudgeAggregate report={report.aggregate} />
      <JudgeSamples samples={report.samples} />
    </div>
  );
}

/** 在线抽样：未匹配 / 跳过 judge + 检索（及可选生成）。 */
export function EvalFromTracesResult({ report }: { report: EvalFromTracesReport }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {report.dataset.name}@{report.dataset.version} · 对齐 {report.matchedSampleCount} 条 ·{' '}
        {report.layer}
      </p>
      <div>
        <p className="mb-1 text-xs text-muted">未匹配轨迹</p>
        <IdChips ids={report.unmatchedSampleIds} empty="全部对上了" />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">跳过生成 judge（无完整 answer）</p>
        <IdChips ids={report.skippedJudgeSampleIds} empty="无" />
      </div>
      <RetrievalAggregate report={report.retrieval.aggregate} />
      <RetrievalSamples samples={report.retrieval.samples} />
      {report.judge ? (
        <>
          <JudgeAggregate report={report.judge.aggregate} />
          <JudgeSamples samples={report.judge.samples} />
        </>
      ) : null}
    </div>
  );
}
