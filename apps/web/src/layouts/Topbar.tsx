import { Bell, ChevronDown } from 'lucide-react';
import { useAppContext } from '@/shared/hooks/useAppContext';

interface TopbarProps {
  title?: string;
  children?: React.ReactNode;
}

export function Topbar({ title, children }: TopbarProps) {
  const { preferences } = useAppContext();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {title ? <h1 className="shrink-0 text-sm font-medium">{title}</h1> : null}
        {children}
      </div>

      <div className="flex items-center gap-4">
        <button type="button" className="relative text-muted hover:text-ink" aria-label="通知">
          <Bell className="h-4 w-4" />
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-danger" />
        </button>
        <div className="flex items-center gap-2">
          <img
            src="https://i.pravatar.cc/80?img=32"
            alt="用户头像"
            className="h-8 w-8 rounded-full object-cover"
          />
          <span className="hidden text-sm sm:inline">
            {preferences.role === 'admin' ? '管理员' : '终端用户'}
          </span>
          <ChevronDown className="hidden h-3 w-3 text-muted sm:block" />
        </div>
      </div>
    </header>
  );
}
