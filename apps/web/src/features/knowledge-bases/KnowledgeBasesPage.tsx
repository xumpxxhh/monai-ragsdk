import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  createCollection,
  searchCollections,
  subscribeCollectionsChanged,
} from '@/shared/api/collections';
import { Button } from '@/shared/ui/Button';
import { HealthBadge } from '@/shared/ui/Badge';
import { Card, PageHeader } from '@/shared/ui';
import { Field, Input } from '@/shared/ui/form';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import type { CollectionSummary, IngestMode } from '@/shared/types';

export default function KnowledgeBasesPage() {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ingestMode, setIngestMode] = useState<IngestMode>('incremental');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const result = await searchCollections(debouncedSearch);
    setCollections(result.items);
  }, [debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => subscribeCollectionsChanged(load), [load]);

  const handleCreate = async (goIngest: boolean) => {
    if (!name.trim()) {
      toast.error('请填写知识库名称');
      return;
    }
    setCreating(true);
    try {
      const created = await createCollection({ name: name.trim(), description, ingestMode });
      toast.success(`已创建「${created.name}」`);
      setCreateOpen(false);
      setName('');
      setDescription('');
      if (goIngest) {
        window.location.href = `/knowledge-bases/${created.id}/documents`;
      } else {
        void load();
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="知识库"
        description="每个库对应一套入库、检索与问答闭环"
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索库名"
                className="w-48 pl-9"
              />
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> 新建库
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {collections.map((kb) => (
          <Card key={kb.id} className="flex flex-col p-5">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-ctrl bg-brand-soft text-brand">
                <BookOpen className="h-5 w-5" />
              </div>
              <HealthBadge health={kb.health} />
            </div>
            <h3 className="font-semibold">{kb.name}</h3>
            <p className="mt-1 text-sm text-muted">
              文档 {kb.documentCount} · 默认策略：{kb.presetLabel}
            </p>
            {kb.failedIngestCount > 0 ? (
              <p className="mt-1 text-xs text-warning">失败入库 {kb.failedIngestCount}</p>
            ) : null}
            <p className="mt-2 line-clamp-2 text-xs text-muted">{kb.description}</p>
            <div className="mt-auto flex gap-2 pt-4">
              <Link to={`/knowledge-bases/${kb.id}/documents`} className="flex-1">
                <Button className="w-full">进入</Button>
              </Link>
              <Link to="/ask" className="flex-1">
                <Button variant="secondary" className="w-full">
                  问答
                </Button>
              </Link>
            </div>
          </Card>
        ))}

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex min-h-[220px] flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface/50 p-5 text-muted transition-colors hover:border-brand hover:text-brand"
        >
          <Plus className="mb-2 h-8 w-8" />
          <span className="font-medium">新建知识库</span>
          <span className="mt-1 text-xs">上传文档开始…</span>
        </button>
      </div>

      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="新建知识库"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button variant="secondary" disabled={creating} onClick={() => void handleCreate(false)}>
              创建
            </Button>
            <Button disabled={creating} onClick={() => void handleCreate(true)}>
              创建并去入库
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <Field label="名称" htmlFor="kb-name">
            <Input id="kb-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="说明" htmlFor="kb-desc">
            <Input id="kb-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="入库模式">
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={ingestMode === 'incremental'}
                  onChange={() => setIngestMode('incremental')}
                  className="text-brand"
                />
                增量更新
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={ingestMode === 'full'}
                  onChange={() => setIngestMode('full')}
                  className="text-brand"
                />
                全量重建
              </label>
              <p className="text-xs text-muted">增量会跳过未变化文档，减少重复计算</p>
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
