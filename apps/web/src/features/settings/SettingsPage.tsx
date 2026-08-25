import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getConnectionInfo } from '@/shared/api/observe';
import { getStrategy, presetLabels } from '@/shared/api/strategy';
import { useAppContext } from '@/shared/hooks/useAppContext';
import { Card, PageHeader } from '@/shared/ui';
import { SelectNative } from '@/shared/ui/form';
import { toast } from '@/shared/ui/Toast';
import { cn } from '@/shared/utils';
import type { ConnectionInfo } from '@/shared/types';

function ConnectionBadge({ status }: { status: 'connected' | 'unconfigured' }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs',
        status === 'connected' ? 'bg-success/10 text-success' : 'bg-canvas text-muted',
      )}
    >
      {status === 'connected' ? '已连接' : '未配置'}
    </span>
  );
}

export default function SettingsPage() {
  const { preferences, updatePreferences, isAdmin } = useAppContext();
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [globalPresetLabel, setGlobalPresetLabel] = useState<string | null>(null);

  useEffect(() => {
    void getConnectionInfo().then(setConnection);
    if (isAdmin) {
      void getStrategy().then((strategy) => setGlobalPresetLabel(presetLabels[strategy.preset]));
    }
  }, [isAdmin]);

  const handleRoleChange = (role: 'admin' | 'user') => {
    updatePreferences({ role });
    toast.success(role === 'admin' ? '已切换为管理员视图' : '已切换为终端用户视图');
  };

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="设置" />

      <Card className="p-5">
        <h2 className="mb-4 font-medium">外观</h2>
        <div className="flex gap-3">
          {(['compact', 'comfortable'] as const).map((density) => (
            <label
              key={density}
              className={cn(
                'flex-1 cursor-pointer rounded-ctrl border p-3',
                preferences.density === density ? 'border-brand bg-brand-soft' : 'border-line',
              )}
            >
              <input
                type="radio"
                name="density"
                className="sr-only"
                checked={preferences.density === density}
                onChange={() => updatePreferences({ density })}
              />
              <span className="text-sm font-medium">{density === 'compact' ? '紧凑' : '舒适'}</span>
              <span className="mt-1 block text-xs text-muted">
                {density === 'compact' ? '表格与列表更密，适合大屏运维' : '默认间距，适合日常问答'}
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-medium">默认着陆页</h2>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={preferences.landingPage === 'home'}
              onChange={() => updatePreferences({ landingPage: 'home' })}
              className="text-brand"
            />
            工作台（管理员推荐）
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={preferences.landingPage === 'ask'}
              onChange={() => updatePreferences({ landingPage: 'ask' })}
              className="text-brand"
            />
            问答（终端用户推荐）
          </label>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-medium">角色（演示）</h2>
        <p className="mb-4 text-xs text-muted">
          便于评审切换信息密度；真实部署接入权限后移除此开关。
        </p>
        <SelectNative
          value={preferences.role}
          onChange={(e) => handleRoleChange(e.target.value as 'admin' | 'user')}
          className="max-w-xs"
        >
          <option value="admin">管理员</option>
          <option value="user">终端用户</option>
        </SelectNative>
      </Card>

      {isAdmin ? (
        <Card className="p-5">
          <h2 className="mb-1 font-medium">运行时装配</h2>
          <p className="mb-4 text-xs text-muted">
            当前预设：{globalPresetLabel ?? '加载中…'}。四段装配作用于全部问答与检索，不按单库分别配置。
          </p>
          <Link to="/strategy" className="text-sm text-brand hover:underline">
            打开运行时装配 →
          </Link>
          <span className="mx-2 text-muted">·</span>
          <Link to="/eval" className="text-sm text-brand hover:underline">
            打开评测 →
          </Link>
        </Card>
      ) : null}

      <Card className="p-5">
        <h2 className="mb-1 font-medium">Adapters 连接</h2>
        <p className="mb-4 text-xs text-muted">Embedding / Chat / 向量库由部署环境注入，页面不收集密钥。</p>
        {connection ? (
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted">Embedding</dt>
              <dd>
                <ConnectionBadge status={connection.embedding} />
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Chat</dt>
              <dd>
                <ConnectionBadge status={connection.chat} />
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">向量库（pgvector）</dt>
              <dd>
                <ConnectionBadge status={connection.vectorStore} />
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted">加载中…</p>
        )}
      </Card>
    </div>
  );
}
