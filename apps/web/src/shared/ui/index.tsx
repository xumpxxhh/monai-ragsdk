import { cn } from '@/shared/utils';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      {icon ? <div className="mb-4 text-line">{icon}</div> : null}
      <p className="text-lg font-medium">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-card border border-line bg-surface shadow-card', className)}>
      {children}
    </div>
  );
}

export function ComingSoonModal({
  open,
  onOpenChange,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  return (
    <div
      className={cn('fixed inset-0 z-50', !open && 'hidden')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="coming-soon-title"
    >
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="relative mx-auto mt-28 w-[420px] max-w-[92vw] rounded-card bg-surface shadow-soft">
        <div className="flex h-14 items-center justify-between border-b border-line px-5">
          <h3 className="font-medium">规划中</h3>
          <button type="button" className="text-muted hover:text-ink" onClick={() => onOpenChange(false)}>
            ×
          </button>
        </div>
        <div className="p-5 text-sm leading-relaxed text-muted">
          <span id="coming-soon-title" className="font-medium text-ink">
            {title}
          </span>
          {' '}
          正在建设中，不影响当前入库与问答。MVP 先打通「入库 → 可引用问答 → 可解释调优」。
        </div>
        <div className="flex h-14 items-center justify-end border-t border-line px-5">
          <button
            type="button"
            className="h-9 rounded-ctrl bg-brand px-4 text-sm text-white"
            onClick={() => onOpenChange(false)}
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
