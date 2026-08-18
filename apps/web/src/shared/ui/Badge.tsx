import { cn } from '@/shared/utils';
import type { IngestStats } from '@/shared/types';

type ChipKind = 'add' | 'skip' | 'replace' | 'fail' | 'clean';

const kindClass: Record<ChipKind, string> = {
  add: 'count-chip--add',
  skip: 'count-chip--skip',
  replace: 'count-chip--replace',
  fail: 'count-chip--fail',
  clean: 'count-chip--clean',
};

export function CountChip({ kind, children }: { kind: ChipKind; children: React.ReactNode }) {
  return <span className={cn('count-chip', kindClass[kind])}>{children}</span>;
}

export function IngestStatsChips({ stats }: { stats: IngestStats }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {stats.added > 0 && <CountChip kind="add">新增 {stats.added}</CountChip>}
      {stats.skipped > 0 && <CountChip kind="skip">跳过 {stats.skipped}</CountChip>}
      {stats.replaced > 0 && <CountChip kind="replace">替换 {stats.replaced}</CountChip>}
      {stats.failed > 0 && <CountChip kind="fail">失败 {stats.failed}</CountChip>}
      {stats.cleaned > 0 && <CountChip kind="clean">清理 {stats.cleaned}</CountChip>}
    </div>
  );
}

export function HealthBadge({ health }: { health: 'healthy' | 'warning' | 'empty' }) {
  if (health === 'healthy') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        健康
      </span>
    );
  }
  if (health === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
        有告警
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">
      空库
    </span>
  );
}

export function DocStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    indexed: { label: '已索引', className: 'text-success bg-success/10' },
    failed: { label: '失败', className: 'text-danger bg-red-50' },
    unchanged: { label: '未变化', className: 'text-muted bg-canvas' },
    pending: { label: '处理中', className: 'text-warning bg-warning/10' },
  };
  const item = map[status] ?? { label: status, className: 'text-muted bg-canvas' };
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs', item.className)}>
      {item.label}
    </span>
  );
}
