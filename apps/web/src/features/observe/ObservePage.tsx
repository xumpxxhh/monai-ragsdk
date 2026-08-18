import { useEffect, useState } from 'react';
import { getAskTrace, listAskTraces, listIngestTraces } from '@/shared/api/observe';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { Button } from '@/shared/ui/Button';
import { Card, ComingSoonModal } from '@/shared/ui';
import { Input, SelectNative } from '@/shared/ui/form';
import { cn, formatRelativeTime } from '@/shared/utils';
import type { AskTrace, IngestTaskTrace } from '@/shared/types';

type Tab = 'qa' | 'ingest';

export default function ObservePage() {
  const [tab, setTab] = useState<Tab>('qa');
  const [traces, setTraces] = useState<AskTrace[]>([]);
  const [ingestTraces, setIngestTraces] = useState<IngestTaskTrace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AskTrace | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [comingSoon, setComingSoon] = useState<string | null>(null);

  useEffect(() => {
    if (tab === 'qa') {
      void listAskTraces({ q: debouncedSearch }).then((items) => {
        setTraces(items);
        if (items[0] && !selectedId) setSelectedId(items[0].id);
      });
    } else {
      void listIngestTraces().then(setIngestTraces);
    }
  }, [tab, debouncedSearch, selectedId]);

  useEffect(() => {
    if (selectedId && tab === 'qa') {
      void getAskTrace(selectedId).then(setDetail);
    }
  }, [selectedId, tab]);

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">观测</h1>
        <div className="flex items-center gap-1 rounded-ctrl bg-canvas p-0.5 text-sm">
          <button
            type="button"
            className={cn(
              'h-7 rounded-ctrl px-3',
              tab === 'qa' && 'bg-surface font-medium text-brand shadow-sm',
            )}
            onClick={() => setTab('qa')}
          >
            问答轨迹
          </button>
          <button
            type="button"
            className={cn(
              'h-7 rounded-ctrl px-3',
              tab === 'ingest' && 'bg-surface font-medium text-brand shadow-sm',
            )}
            onClick={() => setTab('ingest')}
          >
            入库任务
          </button>
          <button
            type="button"
            className="h-7 rounded-ctrl px-3 text-muted"
            onClick={() => setComingSoon('轨迹导出')}
          >
            导出(后续)
          </button>
        </div>
      </div>

      {tab === 'qa' ? (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="flex w-full shrink-0 flex-col border-r border-line bg-surface md:w-72">
            <div className="space-y-2 border-b border-line p-3">
              <SelectNative className="h-8 w-full text-xs">
                <option>近 24 小时</option>
                <option>近 7 天</option>
              </SelectNative>
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
                  <p className="mt-2 text-sm">原问题：{detail.question}</p>
                  {detail.effectiveQuestion ? (
                    <p className="text-sm text-muted">有效问题：{detail.effectiveQuestion}</p>
                  ) : null}
                </div>

                <div className="space-y-4 border-l-2 border-line pl-4">
                  {detail.stages.map((stage) => (
                    <div key={stage.id} className="relative">
                      <span
                        className={cn(
                          'trace-dot absolute -left-[1.35rem] top-1',
                          stage.warning && 'trace-dot--warn',
                        )}
                      />
                      <p className="text-sm font-medium">{stage.label}</p>
                      {stage.durationMs ? (
                        <p className="text-xs text-muted">+{stage.durationMs}ms</p>
                      ) : null}
                    </div>
                  ))}
                </div>

                {detail.warnings.length > 0 ? (
                  <Card className="mt-4 border-warning/30 bg-warning/5 p-4 text-sm text-warning">
                    {detail.warnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </Card>
                ) : null}

                <div className="mt-4 flex gap-2">
                  <Button variant="secondary" size="sm">
                    查看引用片段
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setComingSoon('用相同策略重放')}>
                    用相同策略重放(后续)
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">选择一条轨迹查看详情</p>
            )}
          </div>
        </div>
      ) : (
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
      )}

      <ComingSoonModal
        open={comingSoon !== null}
        onOpenChange={(open) => !open && setComingSoon(null)}
        title={comingSoon ?? ''}
      />
    </div>
  );
}
