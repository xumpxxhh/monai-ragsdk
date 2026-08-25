import { NavLink } from 'react-router-dom';
import { ClipboardCheck, History, Home, Layers, MessageCircle, Settings, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/shared/utils';
import { useAppContext } from '@/shared/hooks/useAppContext';

const adminNavItems = [
  { to: '/home', label: '工作台', icon: Home, end: true },
  { to: '/ask', label: '问答', icon: MessageCircle },
  { to: '/knowledge-bases', label: '知识库', icon: Layers },
  { to: '/strategy', label: '装配', icon: SlidersHorizontal },
  { to: '/eval', label: '评测', icon: ClipboardCheck },
  { to: '/observe', label: '观测', icon: History },
  { to: '/settings', label: '设置', icon: Settings },
];

const userNavItems = [
  { to: '/ask', label: '问答', icon: MessageCircle, end: true },
  { to: '/settings', label: '设置', icon: Settings },
];

export function Sidebar() {
  const { isAdmin, preferences } = useAppContext();
  const navItems = isAdmin ? adminNavItems : userNavItems;

  return (
    <aside className="app-aside flex w-60 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-ctrl bg-brand text-sm text-white">
          🍃
        </span>
        <div>
          <div className="text-sm font-semibold leading-tight">MonAI RAG</div>
          <div className="text-[10px] text-muted">{isAdmin ? '内核控制台' : '知识库问答'}</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3 text-sm">
        {navItems.map((item) => {
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
      </nav>

      <div className="border-t border-line p-3 text-xs text-muted">
        视图：{preferences.role === 'admin' ? '管理员' : '终端用户'}
      </div>
    </aside>
  );
}
