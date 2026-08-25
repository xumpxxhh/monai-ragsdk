import { Link } from 'react-router-dom';
import { cn } from '@/shared/utils';
import type { RAGErrorRecord, RAGEvent } from '@/shared/types';
import { isFailureEvent } from '@/features/observe/trace-labels';
import {
  groupPresentedEvents,
  type PresentedField,
  type PresentedObserverEvent,
  type StageGroup,
} from './observer-event-presenter';

export type ObserverRunMode = 'ask' | 'search';

type StageStatus = 'pending' | 'running' | 'done' | 'fail' | 'skipped';

const STAGE_ORDER: StageGroup[] = [
  'pre-retrieval',
  'retrieval',
  'post-retrieval',
  'generation',
  'run',
];

const STAGE_HEADINGS: Record<StageGroup, string> = {
  'pre-retrieval': '预处理',
  retrieval: '检索',
  'post-retrieval': '后处理',
  generation: '生成',
  run: '收尾',
};

function mapEventToStageGroup(name: string): StageGroup | null {
  if (name.startsWith('runtime.query.') || name.startsWith('runtime.query_strategy.')) {
    return 'pre-retrieval';
  }
  if (
    name.startsWith('runtime.retrieval.') ||
    name.startsWith('runtime.retrieval_fanout.') ||
    name.startsWith('runtime.retrieval_fuse.')
  ) {
    return 'retrieval';
  }
  if (
    name.startsWith('runtime.post_retrieval.') ||
    name.startsWith('runtime.post_retrieval_strategy.')
  ) {
    return 'post-retrieval';
  }
  if (name.startsWith('runtime.generation.')) {
    return 'generation';
  }
  if (name.startsWith('runtime.run.') || name.startsWith('runtime.search.')) {
    return 'run';
  }
  return null;
}

/** 由已到达的事件推断四段进度，供顶栏展示。 */
function deriveStageStatuses(
  events: RAGEvent[],
  running: boolean,
  mode: ObserverRunMode,
): Record<StageGroup, StageStatus> {
  const statuses: Record<StageGroup, StageStatus> = {
    'pre-retrieval': 'pending',
    retrieval: 'pending',
    'post-retrieval': 'pending',
    generation: mode === 'search' ? 'skipped' : 'pending',
    run: 'pending',
  };

  for (const event of events) {
    const group = mapEventToStageGroup(event.name);
    if (!group || statuses[group] === 'skipped') {
      continue;
    }
    if (isFailureEvent(event.name)) {
      statuses[group] = 'fail';
    } else if (
      event.name.endsWith('.complete') ||
      event.name.endsWith('.select') ||
      event.name.endsWith('.preprocess')
    ) {
      statuses[group] = 'done';
    } else if (event.name.endsWith('.start') || event.name.endsWith('.receive')) {
      if (statuses[group] === 'pending') {
        statuses[group] = running ? 'running' : 'done';
      }
    }
  }

  if (running) {
    const firstPending = STAGE_ORDER.find(
      (id) => statuses[id] !== 'done' && statuses[id] !== 'fail' && statuses[id] !== 'skipped',
    );
    if (firstPending && statuses[firstPending] === 'pending') {
      statuses[firstPending] = 'running';
    }
  }

  return statuses;
}

function statusLabel(status: StageStatus): string {
  switch (status) {
    case 'running':
      return '进行中';
    case 'done':
      return '完成';
    case 'fail':
      return '失败';
    case 'skipped':
      return '不经过';
    default:
      return '等待';
  }
}

function FieldRow({ field }: { field: PresentedField }) {
  return (
    <div
      className={cn('grid gap-1 text-xs', field.multiline ? 'grid-cols-1' : 'grid-cols-[5rem_1fr]')}
    >
      <span className="text-muted">{field.label}</span>
      <span
        className={cn(
          'min-w-0 break-words leading-relaxed',
          field.emphasis ? 'font-medium text-ink' : 'text-ink/90',
          field.multiline && 'whitespace-pre-wrap',
        )}
      >
        {field.value}
      </span>
    </div>
  );
}

function EventCard({ item }: { item: PresentedObserverEvent }) {
  return (
    <div
      className={cn(
        'rounded-ctrl border border-line bg-canvas/30 p-2.5',
        item.failed && 'border-warning/40 bg-warning/5',
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className={cn('text-sm font-medium', item.failed && 'text-warning')}>{item.title}</p>
        {item.outcome ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px]',
              item.outcome === '已生效' && 'bg-brand-soft text-brand',
              item.outcome === '未改动' && 'bg-canvas text-muted',
              item.outcome === '失败' && 'bg-warning/15 text-warning',
              item.outcome !== '已生效' &&
                item.outcome !== '未改动' &&
                item.outcome !== '失败' &&
                'bg-canvas text-muted',
            )}
          >
            {item.outcome}
          </span>
        ) : null}
        {typeof item.durationMs === 'number' ? (
          <span className="text-[10px] text-muted">{item.durationMs}ms</span>
        ) : null}
      </div>
      {item.fields.length > 0 ? (
        <div className="space-y-1.5">
          {item.fields.map((field) => (
            <FieldRow key={field.label} field={field} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">本步无额外字段</p>
      )}
    </div>
  );
}

/** 管理员检查面：按 observer 事件结构展示关键字段，不 dump 原始 JSON。 */
export function ObserverRunPanel({
  events,
  errors,
  running,
  mode,
  traceId,
  className,
}: {
  events: RAGEvent[];
  errors?: RAGErrorRecord[];
  running: boolean;
  mode: ObserverRunMode;
  traceId?: string | null;
  className?: string;
}) {
  const statuses = deriveStageStatuses(events, running, mode);
  const groups = groupPresentedEvents(events);
  const hasContent = events.length > 0 || (errors && errors.length > 0) || running;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">本轮内核运行</h3>
        {traceId ? (
          <Link
            to={`/observe?trace=${encodeURIComponent(traceId)}`}
            className="shrink-0 text-xs text-brand hover:underline"
          >
            原始 trace
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STAGE_ORDER.filter((id) => statuses[id] !== 'skipped' || mode === 'search').map((id) => {
          if (mode === 'search' && id === 'generation') {
            return (
              <span
                key={id}
                className="rounded-ctrl bg-canvas/50 px-2 py-1 text-[11px] text-muted line-through decoration-muted/40"
              >
                {STAGE_HEADINGS[id]}
                <span className="ml-1 opacity-70">不经过</span>
              </span>
            );
          }
          const status = statuses[id];
          return (
            <span
              key={id}
              className={cn(
                'rounded-ctrl px-2 py-1 text-[11px]',
                status === 'running' && 'bg-brand-soft font-medium text-brand',
                status === 'done' && 'bg-canvas text-ink',
                status === 'fail' && 'bg-warning/10 text-warning',
                status === 'pending' && 'bg-canvas text-muted',
              )}
            >
              {STAGE_HEADINGS[id]}
              <span className="ml-1 opacity-70">{statusLabel(status)}</span>
            </span>
          );
        })}
      </div>

      {running && events.length === 0 ? <p className="text-xs text-brand">正在启动内核…</p> : null}

      {!hasContent ? (
        <p className="text-sm text-muted">提问或检索后，这里会逐步展示每个运行步骤的关键信息。</p>
      ) : groups.length > 0 ? (
        <div className="space-y-4">
          {groups.map((section) => (
            <section key={section.group}>
              <h4 className="mb-2 text-xs font-medium text-muted">{section.label}</h4>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <EventCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : running ? (
        <p className="text-xs text-muted">等待第一步事件…</p>
      ) : null}

      {errors && errors.length > 0 ? (
        <div className="rounded-ctrl border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning">
          {errors.map((item) => (
            <p key={`${item.name}-${item.timestamp}`}>{item.error.message}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
