import { NavLink } from 'react-router-dom';
import { FlaskConical, Home, Layers, MessageCircle, Settings, History } from 'lucide-react';
import { cn } from '@/shared/utils';
import { useAppContext } from '@/shared/hooks/useAppContext';
import { useState } from 'react';
import { ComingSoonModal } from '@/shared/ui';

const navItems = [
  { to: '/', label: '工作台', icon: Home, end: true },
  { to: '/knowledge-bases', label: '知识库', icon: Layers },
  { to: '/ask', label: '问答', icon: MessageCircle },
  { to: '/observe', label: '观测', icon: History, adminOnly: true },
  { to: '/settings', label: '设置', icon: Settings },
];

export function Sidebar() {
  const { isAdmin, preferences } = useAppContext();
  const [comingSoon, setComingSoon] = useState<string | null>(null);

  return (
    <>
      <aside className="app-aside flex w-60 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-ctrl bg-brand text-sm text-white">
            🍃
          </span>
          <div>
            <div className="text-sm font-semibold leading-tight">MonAI RAG</div>
            <div className="text-[10px] text-muted">知识库问答控制台</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3 text-sm">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-ctrl px-3 py-2 transition-colors',
                    isActive
                      ? 'bg-brand-soft font-medium text-brand'
                      : 'text-muted hover:bg-canvas hover:text-ink',
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}

          <div className="mt-2 border-t border-line pt-4">
            <button
              type="button"
              className="nav-soon flex w-full items-center gap-3 rounded-ctrl px-3 py-2 text-left text-muted"
              onClick={() => setComingSoon('评测中心')}
            >
              <FlaskConical className="h-4 w-4 shrink-0" />
              <span className="flex-1">评测</span>
              <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px]">即将推出</span>
            </button>
          </div>
        </nav>

        <div className="border-t border-line p-3 text-xs text-muted">
          视图：{preferences.role === 'admin' ? '管理员' : '终端用户'}
        </div>
      </aside>

      <ComingSoonModal
        open={comingSoon !== null}
        onOpenChange={(open) => !open && setComingSoon(null)}
        title={comingSoon ?? ''}
      />
    </>
  );
}
