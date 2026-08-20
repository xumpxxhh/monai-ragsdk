import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Upload } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { getCollection } from '@/shared/api/collections';
import {
  getLastIngest,
  listDocuments,
  recommendIngest,
  removeDocument,
  retryDocument,
  startIngest,
  subscribeDocumentsChanged,
} from '@/shared/api/documents';
import {
  IngestConfigModal,
  loaderLabel,
} from '@/features/documents/IngestConfigModal';
import { useIsAdmin } from '@/shared/hooks/useAppContext';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { Button } from '@/shared/ui/Button';
import { DocStatusBadge, IngestStatsChips } from '@/shared/ui/Badge';
import { Card, ComingSoonModal } from '@/shared/ui';
import { Input, SelectNative } from '@/shared/ui/form';
import { toast } from '@/shared/ui/Toast';
import { formatDateTime } from '@/shared/utils';
import type {
  ChunkingConfig,
  ChunkingStrategy,
  CollectionDetail,
  DocumentSource,
  IngestProgressEvent,
  LastIngestSummary,
} from '@/shared/types';

const DEFAULT_CHUNKING: ChunkingConfig & { strategy: ChunkingStrategy } = {
  strategy: 'fixed',
  chunkSize: 500,
  overlap: 50,
};

function recommendChunkingForLoader(loaderHint: string): ChunkingConfig & { strategy: ChunkingStrategy } {
  if (loaderHint === 'text/markdown') {
    return { strategy: 'heading' };
  }
  return { strategy: 'fixed', chunkSize: 500, overlap: 50 };
}

function inferMimeType(file: File): string {
  if (file.type?.trim()) {
    return file.type.trim();
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'text/markdown';
  }
  if (lower.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return 'text/html';
  }
  return 'text/plain';
}

export default function DocumentsPage() {
  const { id = '' } = useParams();
  const isAdmin = useIsAdmin();
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [lastIngest, setLastIngest] = useState<LastIngestSummary | null>(null);
  const [documents, setDocuments] = useState<DocumentSource[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const debouncedSearch = useDebouncedValue(search);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [ingestSubmitting, setIngestSubmitting] = useState(false);
  const [loaderHint, setLoaderHint] = useState('text/plain');
  const [chunking, setChunking] = useState<ChunkingConfig & { strategy: ChunkingStrategy }>(
    DEFAULT_CHUNKING,
  );
  const [ingestOpen, setIngestOpen] = useState(false);
  const [ingestProgress, setIngestProgress] = useState<IngestProgressEvent | null>(null);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [col, ingest, docs] = await Promise.all([
      getCollection(id),
      getLastIngest(id),
      listDocuments(id, { q: debouncedSearch, status: statusFilter }),
    ]);
    setCollection(col);
    setLastIngest(ingest);
    setDocuments(docs.items);
  }, [id, debouncedSearch, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => subscribeDocumentsChanged(load), [load]);

  const loadIngestRecommendation = useCallback(
    async (files: File[]) => {
      setConfigLoading(true);
      try {
        const sample = files[0];
        const mimeType = sample ? inferMimeType(sample) : 'text/plain';
        const recommendation = await recommendIngest(id, [
          { id: sample?.name, metadata: { title: sample?.name, mimeType } },
        ]);
        setLoaderHint(recommendation.loaderHint);
        setChunking(recommendation.chunking);
      } catch {
        const fallbackMime = files[0] ? inferMimeType(files[0]) : 'text/plain';
        setLoaderHint(fallbackMime);
        setChunking(recommendChunkingForLoader(fallbackMime));
        toast.error('获取推荐配置失败，已使用本地默认值');
      } finally {
        setConfigLoading(false);
      }
    },
    [id],
  );

  const handlePickFiles = () => {
    fileRef.current?.click();
  };

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setPendingFiles(files);
    setConfigOpen(true);
    await loadIngestRecommendation(files);
  };

  const handleLoaderChange = (nextLoader: string) => {
    setLoaderHint(nextLoader);
    setChunking(recommendChunkingForLoader(nextLoader));
  };

  const handleStartIngest = async () => {
    if (pendingFiles.length === 0) return;
    setIngestSubmitting(true);
    setConfigOpen(false);
    setIngestOpen(true);
    setIngestProgress(null);

    try {
      const stream = await startIngest(id, {
        files: pendingFiles,
        chunking,
        loaderHint,
      });
      for await (const progress of stream) {
        setIngestProgress(progress);
        if (progress.done) {
          toast.success(
            `入库完成（${loaderLabel(loaderHint)} / ${chunking.strategy}）：新增 ${progress.stats.added} / 跳过 ${progress.stats.skipped} / 失败 ${progress.stats.failed}`,
          );
          void load();
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '入库失败';
      toast.error(message);
      setIngestOpen(false);
    } finally {
      setIngestSubmitting(false);
      setPendingFiles([]);
    }
  };

  const handleRetry = async (docId: string) => {
    await retryDocument(id, docId);
    toast.success('已重新入库');
    void load();
  };

  const handleDelete = async (docId: string, title: string) => {
    if (!window.confirm(`确定删除「${title}」？此操作不可恢复。`)) return;
    await removeDocument(id, docId);
    toast.success('已删除');
    void load();
  };

  if (!collection) {
    return <div className="text-sm text-muted">加载中…</div>;
  }

  const pct = ingestProgress
    ? Math.round((ingestProgress.current / ingestProgress.total) * 100)
    : 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="truncate text-sm">
          <Link to="/knowledge-bases" className="text-muted hover:text-brand">
            知识库
          </Link>
          <ChevronRight className="mx-1 inline h-3 w-3 text-muted" />
          <span className="font-medium">{collection.name}</span>
          <span className="text-muted"> / 文档与入库</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link to="/strategy">
            <Button variant="secondary" size="sm">
              全局策略
            </Button>
          </Link>
          {isAdmin ? (
            <Link to="/search-debug">
              <Button variant="secondary" size="sm">
                仅检索调试
              </Button>
            </Link>
          ) : null}
          <Link to="/ask">
            <Button size="sm">去问答</Button>
          </Link>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-4 lg:flex-row">
        <div className="w-full shrink-0 space-y-2 lg:w-48">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".md,.txt,.markdown,.json,.csv,.html,.pdf"
            className="hidden"
            onChange={(event) => void handleFilesSelected(event)}
          />
          <Button className="w-full" onClick={handlePickFiles} disabled={ingestSubmitting}>
            <Upload className="h-4 w-4" /> 上传入库
          </Button>
          <Button
            variant="secondary"
            className="w-full text-muted"
            onClick={() => setComingSoon('从目录同步')}
          >
            从目录同步 <span className="text-[10px]">后续</span>
          </Button>
        </div>

        <Card className="flex-1 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              上次入库：
              <span className="font-medium">
                {lastIngest ? formatDateTime(lastIngest.finishedAt) : '暂无'}
              </span>
              {lastIngest ? (
                <span className="text-muted">
                  {' '}
                  · {lastIngest.mode === 'incremental' ? '增量' : '全量'}
                </span>
              ) : null}
            </p>
          </div>
          {lastIngest ? <IngestStatsChips stats={lastIngest.stats} /> : null}
        </Card>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索源 ID / 标题"
          className="max-w-xs"
        />
        <SelectNative value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">全部状态</option>
          <option value="indexed">已索引</option>
          <option value="failed">失败</option>
          <option value="unchanged">未变化</option>
        </SelectNative>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (window.confirm('确定清理无效源？不可恢复。')) toast.success('清理任务已提交');
          }}
        >
          清理无效源
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas/50 text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">源 ID</th>
              <th className="px-4 py-3 font-medium">标题/路径</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">更新时间</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td className="px-4 py-3 font-mono text-xs">{doc.sourceId}</td>
                <td className="px-4 py-3">{doc.title}</td>
                <td className="px-4 py-3">
                  <DocStatusBadge status={doc.status} />
                  {doc.failReason ? (
                    <p className="mt-1 text-xs text-danger">{doc.failReason}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted">{formatDateTime(doc.updatedAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {doc.status === 'failed' ? (
                      <button
                        type="button"
                        className="text-brand hover:underline"
                        onClick={() => void handleRetry(doc.id)}
                      >
                        重试
                      </button>
                    ) : (
                      <button type="button" className="text-muted hover:text-brand">
                        重新入库
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-danger hover:underline"
                      onClick={() => void handleDelete(doc.id, doc.title)}
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <IngestConfigModal
        open={configOpen}
        onOpenChange={setConfigOpen}
        files={pendingFiles}
        loaderHint={loaderHint}
        chunking={chunking}
        loading={configLoading}
        submitting={ingestSubmitting}
        onLoaderChange={handleLoaderChange}
        onChunkingChange={setChunking}
        onConfirm={() => void handleStartIngest()}
      />

      {ingestOpen ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIngestOpen(false)} />
          <div className="relative mx-auto mt-28 w-[420px] max-w-[92vw] rounded-card bg-surface p-5 shadow-soft">
            <h3 className="mb-3 font-medium">入库进行中</h3>
            <p className="text-sm">
              {ingestProgress
                ? `正在处理 ${ingestProgress.current} / ${ingestProgress.total}`
                : '准备中…'}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas">
              <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
            </div>
            {ingestProgress ? (
              <>
                <p className="mt-2 text-xs text-muted">当前：{ingestProgress.fileName}</p>
                <div className="mt-3">
                  <IngestStatsChips stats={ingestProgress.stats} />
                </div>
                {ingestProgress.log ? (
                  <p className="mt-2 text-xs text-danger">· {ingestProgress.log}</p>
                ) : null}
              </>
            ) : null}
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setIngestOpen(false)}>
                后台继续
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ComingSoonModal
        open={comingSoon !== null}
        onOpenChange={(open) => !open && setComingSoon(null)}
        title={comingSoon ?? ''}
      />
    </div>
  );
}
