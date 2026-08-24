import { Card } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { RAGErrorRecord, RAGTrace } from '@/shared/types';

import {
  eventLabel,
  formatAttributesJson,
  isFailureEvent,
  summarizeEventAttributes,
} from './trace-labels';

type TraceEventTimelineProps = {
  trace: RAGTrace;
};

function formatOffsetMs(startedAt: number, timestamp: number): string {
  const delta = Math.max(0, timestamp - startedAt);
  return delta > 0 ? `+${delta}ms` : '0ms';
}

function ErrorList({ errors }: { errors: RAGErrorRecord[] }) {
  return (
    <Card className="mt-4 border-warning/30 bg-warning/5 p-4 text-sm">
      <p className="mb-2 font-medium text-warning">执行错误</p>
      <ul className="space-y-2">
        {errors.map((item) => (
          <li key={`${item.name}-${item.timestamp}`} className="text-warning">
            <span className="font-medium">{eventLabel(item.name)}</span>
            {': '}
            {item.error.message}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function TraceEventTimeline({ trace }: TraceEventTimelineProps) {
  const startedAt = trace.startedAt;

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-medium">执行详情</h3>
      <div className="space-y-3 border-l-2 border-line pl-4">
        {trace.events.map((event, index) => {
          const summary = summarizeEventAttributes(event);
          const failed = isFailureEvent(event.name);

          return (
            <div key={`${event.name}-${event.timestamp}-${index}`} className="relative">
              <span
                className={cn(
                  'trace-dot absolute -left-[1.35rem] top-1.5',
                  failed && 'trace-dot--warn',
                )}
              />
              <div className="space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className={cn('text-sm font-medium', failed && 'text-warning')}>
                    {eventLabel(event.name)}
                  </p>
                  <span className="text-xs text-muted">
                    {formatOffsetMs(startedAt, event.timestamp)}
                  </span>
                  {typeof event.durationMs === 'number' ? (
                    <span className="text-xs text-muted">耗时 {event.durationMs}ms</span>
                  ) : null}
                  <span className="text-xs text-muted">stage: {event.stage}</span>
                </div>
                {summary ? <p className="text-xs text-muted">{summary}</p> : null}
                {event.attributes ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-brand hover:underline">
                      attributes
                    </summary>
                    <pre className="mt-1 max-h-64 overflow-auto rounded-ctrl bg-canvas p-2 font-mono text-[11px] leading-relaxed text-muted">
                      {formatAttributesJson(event.attributes)}
                    </pre>
                  </details>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {trace.errors && trace.errors.length > 0 ? <ErrorList errors={trace.errors} /> : null}
    </div>
  );
}
