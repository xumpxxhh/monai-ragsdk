import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getAskTrace, listAskTraces, listIngestTraces } from '@/shared/api/observe';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useAppContext } from '@/shared/hooks/useAppContext';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui';
import { Input } from '@/shared/ui/form';
import { cn, formatRelativeTime } from '@/shared/utils';
import type { AskTrace, IngestTaskTrace } from '@/shared/types';
import { PipelineInspectPanel } from '@/features/ask/PipelineInspectPanel';
import { TraceEventTimeline } from './TraceEventTimeline';
import { stageLabel } from './trace-labels';

type Tab = 'runtime' | 'indexing';

/** 优先用 pipeline.timings 展示四段耗时；旧记录回退 stages 键名映射。 */
function runtimeStageRows(detail: AskTrace): Array<{ id: string; label: string; durationMs?: number }> {
  const timings = detail.pipeline?.timings;
  if (timings) {
    return [
      { id: 'preRetrieval', label: stageLabel('preRetrieval'), durationMs: timings.preRetrieval },
      { id: 'retrieval', label: stageLabel('retrieval'), durationMs: timings.retrieval },
      { id: 'postRetrieval', label: stageLabel('postRetrieval'), durationMs: timings.postRetrieval },
      { id: 'generation', label: stageLabel('generation'), durationMs: timings.generation },
    ].filter((row) => row.durationMs !== undefined);
  }

  return detail.stages.map((stage) => ({
    id: stage.id,
    label: stageLabel(stage.id),
    durationMs: stage.durationMs,
  }));
}

export default function ObservePage() {
  const navigate = useNavigate();
  const { isAdmin } = useAppContext();
  const [searchParams] = useSearchParams();
  const traceFromUrl = searchParams.get('trace');
  const [tab, setTab] = useState<Tab>('runtime');
  const [traces, setTraces] = useState<AskTrace[]>([]);
  const [ingestTraces, setIngestTraces] = useState<IngestTaskTrace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AskTrace | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/ask', { replace: true });
    }
  }, [isAdmin, navigate]);

  useEffect(() => {
    if (traceFromUrl) {
      setSelectedId(traceFromUrl);
      setTab('runtime');
    }
  }, [traceFromUrl]);

  useEffect(() => {
    if (tab === 'runtime') {
      void listAskTraces({ q: debouncedSearch }).then((items) => {
        setTraces(items);
        if (items[0] && !selectedId && !traceFromUrl) setSelectedId(items[0].id);
      });
    } else {
      void listIngestTraces().then(setIngestTraces);
    }
  }, [tab, debouncedSearch, selectedId, traceFromUrl]);

  useEffect(() => {
    if (selectedId && tab === 'runtime') {
      void getAskTrace(selectedId).then(setDetail);
    }
  }, [selectedId, tab]);

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">观测</h1>
          <p className="mt-0.5 text-xs text-muted">在线 runtime 四段运行与离线 indexing 入库任务</p>
        </div>
        <div className="flex items-center gap-1 rounded-ctrl bg-canvas p-0.5 text-sm">
          <button
            type="button"
            className={cn(
              'h-7 rounded-ctrl px-3',
              tab === 'runtime' && 'bg-surface font-medium text-brand shadow-sm',
            )}
            onClick={() => setTab('runtime')}
          >
            在线运行
          </button>
          <button
            type="button"
            className={cn(
              'h-7 rounded-ctrl px-3',
              tab === 'indexing' && 'bg-surface font-medium text-brand shadow-sm',
            )}
            onClick={() => setTab('indexing')}
          >
            离线入库
          </button>
        </div>
      </div>

      {tab === 'runtime' ? (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="flex w-full shrink-0 flex-col border-r border-line bg-surface md:w-72">
            <div className="border-b border-line p-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索问题关键词"
                className="h-8 text-xs"
              />
            </div>
            <ul className="flex-1 overflow-auto text-sm">
              {traces.map((trace) => (
                <li key={trace.id}>
                  <button
                    type="button"
                    className={cn(
                      'w-full px-4 py-3 text-left hover:bg-canvas',
                      selectedId === trace.id && 'bg-brand-soft',
                    )}
                    onClick={() => setSelectedId(trace.id)}
                  >
                    <span className="text-muted">{formatRelativeTime(trace.finishedAt)}</span>{' '}
                    {trace.question.slice(0, 12)}
                    {trace.question.length > 12 ? '…' : ''}
                    <span className="mt-1 block text-xs text-muted">{trace.collectionName}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div className="flex-1 overflow-auto p-4 md:p-6">
            {detail ? (
              <>
                <div className="mb-4">
                  <h2 className="font-medium">
                    Trace #{detail.id.slice(-4)} · {formatRelativeTime(detail.finishedAt)} · 耗时{' '}
                    {(detail.durationMs / 1000).toFixed(1)}s · {detail.success ? '成功' : '失败'}
                  </h2>
                  <p className="mt-2 text-sm text-muted">
                    检索范围：
                    {detail.collectionId === 'global'
                      ? detail.collectionName
                      : `${detail.collectionName}（${detail.collectionId}）`}
                  </p>
                  <p className="mt-2 text-sm">原问题：{detail.question}</p>
                  {detail.effectiveQuestion ? (
                    <p className="text-sm text-muted">有效问题：{detail.effectiveQuestion}</p>
                  ) : null}
                </div>

                {detail.pipeline ? (
                  <Card className="mb-4 p-4">
                    <PipelineInspectPanel
                      pipeline={detail.pipeline}
                      traceId={detail.traceId ?? detail.id}
                    />
                  </Card>
                ) : null}

                <div className="mb-4">
                  <h3 className="mb-3 text-sm font-medium">阶段耗时</h3>
                  <div className="space-y-4 border-l-2 border-line pl-4">
                    {(() => {
                      const rows = runtimeStageRows(detail);
                      if (rows.length === 0) {
                        return <p className="text-xs text-muted">暂无阶段耗时摘要</p>;
                      }
                      return rows.map((stage) => (
                        <div key={stage.id} className="relative">
                          <span className="trace-dot absolute -left-[1.35rem] top-1" />
                          <p className="text-sm font-medium">{stage.label}</p>
                          {stage.durationMs !== undefined ? (
                            <p className="text-xs text-muted">+{stage.durationMs}ms</p>
                          ) : null}
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {detail.executionTrace ? (
                  <TraceEventTimeline trace={detail.executionTrace} />
                ) : (
                  <Card className="mt-4 border-line bg-canvas/50 p-4 text-sm text-muted">
                    observer 事件不可用（可能为服务重启前的旧记录）。上方仍展示 pipeline 摘要与阶段耗时。
                  </Card>
                )}

                {detail.warnings.length > 0 ? (
                  <Card className="mt-4 border-warning/30 bg-warning/5 p-4 text-sm text-warning">
                    {detail.warnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </Card>
                ) : null}

                <div className="mt-4">
                  <Link
                    to={`/ask?q=${encodeURIComponent(detail.question)}`}
                    className="inline-flex"
                  >
                    <Button variant="secondary" size="sm">
                      用相同问题回到问答 →
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">选择一条在线运行轨迹查看详情</p>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            离线 indexing 流水线：load → transform → filter → chunk → embed → upsert
          </p>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas/50 text-left text-muted">
                <tr>
                  <th className="px-4 py-3">知识库</th>
                  <th className="px-4 py-3">完成时间</th>
                  <th className="px-4 py-3">模式</th>
                  <th className="px-4 py-3">结果</th>
                  <th className="px-4 py-3">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ingestTraces.map((task) => (
                  <tr key={task.id}>
                    <td className="px-4 py-3">{task.collectionName}</td>
                    <td className="px-4 py-3 text-muted">{formatRelativeTime(task.finishedAt)}</td>
                    <td className="px-4 py-3">{task.mode === 'incremental' ? '增量' : '全量'}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      新增 {task.stats.added} / 跳过 {task.stats.skipped} / 失败 {task.stats.failed}
                    </td>
                    <td className="px-4 py-3">
                      <span className={task.success ? 'text-success' : 'text-warning'}>
                        {task.success ? '成功' : '部分失败'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
