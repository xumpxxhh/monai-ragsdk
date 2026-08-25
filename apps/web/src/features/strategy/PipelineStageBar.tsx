import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/utils';
import type { StrategyConfig } from '@/shared/types';
import { RUNTIME_STAGES, stageEnabledCounts } from './strategy-assembly';

/** 四段装配条：展示各段已开启件数，供装配页与工作台复用。 */
export function PipelineStageBar({
  config,
  className,
}: {
  config: StrategyConfig;
  className?: string;
}) {
  const counts = stageEnabledCounts(config);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 rounded-card border border-line bg-surface px-3 py-2 text-xs',
        className,
      )}
    >
      {RUNTIME_STAGES.map((stage, index) => (
        <div key={stage.id} className="flex items-center gap-1">
          {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" /> : null}
          <span
            className={cn(
              'rounded-ctrl px-2 py-1',
              counts[stage.id] > 0 ? 'bg-brand-soft font-medium text-brand' : 'text-muted',
            )}
          >
            {stage.label}
            <span className="ml-1 tabular-nums text-[10px] opacity-80">{counts[stage.id]}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
