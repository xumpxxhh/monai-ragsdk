import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle, FileText, MessageCircle, TriangleAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { listActivities, getDashboard } from '@/shared/api/observe';
import { useAppContext } from '@/shared/hooks/useAppContext';
import { Button } from '@/shared/ui/Button';
import { Card, PageHeader } from '@/shared/ui';
import { IngestStatsChips } from '@/shared/ui/Badge';
import { Input } from '@/shared/ui/form';
import { formatDateTime, formatRelativeTime } from '@/shared/utils';
import type { ActivityItem, DashboardStats } from '@/shared/types';

export default function HomePage() {
  const navigate = useNavigate();
  const { currentCollection, currentCollectionId, isAdmin, preferences, updatePreferences } =
    useAppContext();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [question, setQuestion] = useState('');

  useEffect(() => {
    if (!currentCollectionId) return;
    void getDashboard(currentCollectionId).then(setStats);
    void listActivities(currentCollectionId).then(setActivities);
  }, [currentCollectionId]);

  const handleAsk = () => {
    const q = question.trim();
    navigate(q ? `/ask?q=${encodeURIComponent(q)}` : '/ask');
  };

  return (
    <div>
      <PageHeader
        title="工作台"
        actions={
          isAdmin ? (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={preferences.showHealthCards}
                onChange={(e) => updatePreferences({ showHealthCards: e.target.checked })}
                className="rounded border-line text-brand"
              />
              显示健康卡片
            </label>
          ) : undefined
        }
      />

      <section className="relative mb-5 overflow-hidden rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 translate-x-1/3 -translate-y-1/2 rounded-full bg-brand-soft/60" />
        <p className="relative mb-2 text-sm text-muted">
          有问题？直接问当前知识库 ·{' '}
          <span className="font-medium text-brand">{currentCollection?.name ?? '—'}</span>
        </p>
        <div className="relative flex flex-col gap-3 sm:flex-row">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例如：退货时效是多久？发票抬头怎么改？"
            className="h-11 flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          />
          <Button size="lg" onClick={handleAsk}>
            提问 <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {isAdmin && preferences.showHealthCards && stats ? (
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between text-sm text-muted">
              <span>文档源</span>
              <FileText className="h-4 w-4 text-brand" />
            </div>
            <p className="text-3xl font-semibold tracking-tight">{stats.documentCount}</p>
            <p className="mt-2 text-xs text-success">
              <CheckCircle className="mr-1 inline h-3 w-3" />
              {stats.lastIngestSuccess ? '上次入库成功' : '上次入库有失败'} ·{' '}
              {stats.lastIngestAt ? formatDateTime(stats.lastIngestAt) : '暂无'}
            </p>
          </Card>
          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between text-sm text-muted">
              <span>近 7 日问答</span>
              <MessageCircle className="h-4 w-4 text-brand" />
            </div>
            <p className="text-3xl font-semibold tracking-tight">
              {stats.askCount7d} <span className="text-base font-normal text-muted">次</span>
            </p>
            <p className="mt-2 text-xs text-muted">平均引用 {stats.avgCitations} 段 / 次</p>
          </Card>
          <Card className="p-5 ring-1 ring-warning/30">
            <div className="mb-2 flex items-center justify-between text-sm text-muted">
              <span>失败入库</span>
              <TriangleAlert className="h-4 w-4 text-warning" />
            </div>
            <p className="text-3xl font-semibold tracking-tight text-warning">
              {stats.failedIngestCount}
            </p>
            {currentCollectionId ? (
              <Link
                to={`/knowledge-bases/${currentCollectionId}/documents`}
                className="mt-2 inline-flex text-xs font-medium text-brand hover:underline"
              >
                去处理 →
              </Link>
            ) : null}
          </Card>
        </div>
      ) : null}

      <Card>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-medium">最近动态</h2>
          {isAdmin ? (
            <Link to="/observe" className="text-xs text-brand hover:underline">
              查看观测
            </Link>
          ) : null}
        </div>
        <ul className="divide-y divide-line text-sm">
          {activities.map((item) => (
            <li key={item.id} className="flex gap-3 px-5 py-3.5">
              <span className="w-12 shrink-0 text-muted">{formatRelativeTime(item.time)}</span>
              <div>
                {item.kind === 'ingest' && item.stats ? (
                  <>
                    <span className="font-medium">{item.title}</span>
                    <div className="mt-1.5">
                      <IngestStatsChips stats={item.stats} />
                    </div>
                  </>
                ) : (
                  <span>{item.title}</span>
                )}
                {item.kind === 'ask' ? (
                  <Link to="/ask" className="ml-2 text-brand hover:underline">
                    复现问答
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
