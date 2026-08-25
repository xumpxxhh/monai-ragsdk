import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { compareEval, evalFromTraces, judgeEval, runEval } from '@/shared/api/eval';
import { applyPreset, getStrategy, presetLabels } from '@/shared/api/strategy';
import { useAppContext } from '@/shared/hooks/useAppContext';
import { ApiError } from '@/shared/api/http';
import { Button } from '@/shared/ui/Button';
import { Card, PageHeader } from '@/shared/ui';
import { Field, SelectNative, Textarea } from '@/shared/ui/form';
import { toast } from '@/shared/ui/Toast';
import { cn } from '@/shared/utils';
import type {
  EvalCompareReport,
  EvalFromTracesReport,
  EvalJudgeReport,
  EvalMetricLayer,
  EvalRunReport,
  StrategyConfig,
  StrategyPreset,
} from '@/shared/types';
import { EVAL_DATASET_EXAMPLE, parseEvalDatasetJson } from './eval-dataset';
import { parseTraceIds } from './eval-format';
import {
  EvalCompareResult,
  EvalFromTracesResult,
  EvalJudgeResult,
  EvalRunResult,
} from './EvalReports';

type EvalMode = 'run' | 'compare' | 'judge' | 'from-traces';

const MODE_LABEL: Record<EvalMode, string> = {
  run: '检索跑分',
  compare: '回归对比',
  judge: '生成评审',
  'from-traces': '在线抽样',
};

type EvalResult =
  | { mode: 'run'; report: EvalRunReport }
  | { mode: 'compare'; report: EvalCompareReport }
  | { mode: 'judge'; report: EvalJudgeReport }
  | { mode: 'from-traces'; report: EvalFromTracesReport };

/**
 * 管理员评测面：粘贴 golden，调用已落地的 /eval REST。
 * 不算分、不跑 pipeline；终端用户不可见。
 */
export default function EvalPage() {
  const navigate = useNavigate();
  const { isAdmin, collections } = useAppContext();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<EvalMode>('run');
  const [datasetText, setDatasetText] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [layer, setLayer] = useState<EvalMetricLayer>('retrieved');
  const [candidatePreset, setCandidatePreset] = useState<StrategyPreset>('high_recall');
  const [includeJudge, setIncludeJudge] = useState(true);
  const [traceIdsText, setTraceIdsText] = useState('');
  const [strategy, setStrategy] = useState<StrategyConfig | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EvalResult | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/ask', { replace: true });
    }
  }, [isAdmin, navigate]);

  useEffect(() => {
    void getStrategy().then(setStrategy);
  }, []);

  const toggleCollection = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    const text = await file.text();
    setDatasetText(text);
  };

  const handleRun = async () => {
    const parsed = parseEvalDatasetJson(datasetText);
    if ('error' in parsed) {
      toast.error(parsed.error);
      return;
    }

    const collectionIds = selectedIds.length > 0 ? selectedIds : undefined;
    setRunning(true);
    setResult(null);
    try {
      if (mode === 'run') {
        const report = await runEval({
          dataset: parsed.dataset,
          collectionIds,
          layer,
        });
        setResult({ mode: 'run', report });
      } else if (mode === 'compare') {
        const current = strategy ?? (await getStrategy());
        const candidate = applyPreset(current, candidatePreset);
        const report = await compareEval({
          dataset: parsed.dataset,
          collectionIds,
          layer,
          baseline: { label: presetLabels[current.preset] },
          candidate: { label: presetLabels[candidatePreset], strategy: candidate },
        });
        setResult({ mode: 'compare', report });
      } else if (mode === 'judge') {
        const report = await judgeEval({ dataset: parsed.dataset, collectionIds });
        setResult({ mode: 'judge', report });
      } else {
        const report = await evalFromTraces({
          dataset: parsed.dataset,
          layer,
          includeJudge,
          collectionId: selectedIds[0],
          traceIds: parseTraceIds(traceIdsText),
        });
        setResult({ mode: 'from-traces', report });
      }
      toast.success(`已跑完 ${parsed.sampleCount} 条样本`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '评测失败';
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="评测"
        description="对照 golden 跑检索指标、策略 A/B、生成 judge 或已落盘问答抽样。不算分在浏览器里。"
      />

      <div className="flex flex-wrap gap-1">
        {(Object.keys(MODE_LABEL) as EvalMode[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setMode(item);
              setResult(null);
            }}
            className={cn(
              'rounded-ctrl px-3 py-1.5 text-sm',
              mode === item ? 'bg-brand-soft font-medium text-brand' : 'text-muted hover:bg-canvas',
            )}
          >
            {MODE_LABEL[item]}
          </button>
        ))}
      </div>

      <Card className="space-y-4 p-4">
        <Field label="EvalDataset JSON" htmlFor="eval-dataset">
          <Textarea
            id="eval-dataset"
            rows={10}
            className="font-mono text-xs"
            placeholder='{"name":"...","version":"...","samples":[...]}'
            value={datasetText}
            onChange={(event) => setDatasetText(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            上传 JSON
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDatasetText(EVAL_DATASET_EXAMPLE)}>
            填入示例
          </Button>
        </div>

        {mode === 'from-traces' ? (
          <Field label="轨迹知识库" htmlFor="eval-trace-kb">
            <SelectNative
              id="eval-trace-kb"
              value={selectedIds[0] ?? ''}
              onChange={(event) => setSelectedIds(event.target.value ? [event.target.value] : [])}
            >
              <option value="">全部轨迹</option>
              {collections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectNative>
          </Field>
        ) : (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">知识库范围</legend>
            <p className="mb-2 text-xs text-muted">不选则检索全部已注册库。</p>
            <div className="flex flex-wrap gap-3">
              {collections.map((item) => (
                <label key={item.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleCollection(item.id)}
                    className="rounded border-line text-brand"
                  />
                  {item.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {mode === 'run' || mode === 'compare' || mode === 'from-traces' ? (
          <Field label="观测层" htmlFor="eval-layer">
            <SelectNative
              id="eval-layer"
              value={layer}
              onChange={(event) => setLayer(event.target.value as EvalMetricLayer)}
              className="max-w-xs"
            >
              <option value="retrieved">retrieved（召回）</option>
              <option value="selected">selected（入 prompt）</option>
            </SelectNative>
          </Field>
        ) : null}

        {mode === 'compare' ? (
          <Field label="候选预设（baseline 用当前全局装配）" htmlFor="eval-preset">
            <SelectNative
              id="eval-preset"
              value={candidatePreset}
              onChange={(event) => setCandidatePreset(event.target.value as StrategyPreset)}
              className="max-w-xs"
            >
              {(Object.keys(presetLabels) as StrategyPreset[]).map((key) => (
                <option key={key} value={key}>
                  {presetLabels[key]}
                </option>
              ))}
            </SelectNative>
          </Field>
        ) : null}

        {mode === 'from-traces' ? (
          <>
            <Field label="指定轨迹 id（可选，逗号或换行）" htmlFor="eval-trace-ids">
              <Textarea
                id="eval-trace-ids"
                rows={2}
                className="font-mono text-xs"
                value={traceIdsText}
                onChange={(event) => setTraceIdsText(event.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeJudge}
                onChange={(event) => setIncludeJudge(event.target.checked)}
                className="rounded border-line text-brand"
              />
              有完整 answer 时跑生成 judge（不用 answerPreview）
            </label>
          </>
        ) : null}

        <div className="flex items-center gap-3">
          <Button onClick={() => void handleRun()} disabled={running}>
            {running ? '跑分中…' : `运行${MODE_LABEL[mode]}`}
          </Button>
          {mode === 'judge' || mode === 'compare' ? (
            <span className="text-xs text-muted">会调检索 / 生成模型，耗时随样本数增加。</span>
          ) : null}
        </div>
      </Card>

      {result ? (
        <Card className="p-4">
          {result.mode === 'run' ? <EvalRunResult report={result.report} /> : null}
          {result.mode === 'compare' ? <EvalCompareResult report={result.report} /> : null}
          {result.mode === 'judge' ? <EvalJudgeResult report={result.report} /> : null}
          {result.mode === 'from-traces' ? <EvalFromTracesResult report={result.report} /> : null}
        </Card>
      ) : null}
    </div>
  );
}
