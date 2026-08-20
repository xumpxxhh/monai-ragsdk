import { useEffect, useState } from 'react';
import type { ChunkingConfig, ChunkingStrategy } from '@/shared/types';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { Field, Input, SelectNative } from '@/shared/ui/form';

export const LOADER_OPTIONS = [
  { value: 'text/plain', label: '纯文本' },
  { value: 'text/markdown', label: 'Markdown' },
  { value: 'application/pdf', label: 'PDF' },
  { value: 'text/html', label: 'HTML' },
] as const;

export const CHUNK_STRATEGY_OPTIONS: Array<{ value: ChunkingStrategy; label: string }> = [
  { value: 'fixed', label: '固定长度（fixed）' },
  { value: 'heading', label: '按标题（heading）' },
  { value: 'parent-child', label: '父子块（parent-child）' },
];

export function loaderLabel(hint: string): string {
  return LOADER_OPTIONS.find((item) => item.value === hint)?.label ?? hint;
}

interface IngestConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: File[];
  loaderHint: string;
  chunking: ChunkingConfig & { strategy: ChunkingStrategy };
  loading: boolean;
  submitting: boolean;
  onLoaderChange: (loaderHint: string) => void;
  onChunkingChange: (chunking: ChunkingConfig & { strategy: ChunkingStrategy }) => void;
  onConfirm: () => void;
}

/** 入库前配置 chunk / loader 策略；loader 通过 mimeType 传给服务端推荐与入库。 */
export function IngestConfigModal({
  open,
  onOpenChange,
  files,
  loaderHint,
  chunking,
  loading,
  submitting,
  onLoaderChange,
  onChunkingChange,
  onConfirm,
}: IngestConfigModalProps) {
  const [chunkSize, setChunkSize] = useState(String(chunking.chunkSize ?? 500));
  const [overlap, setOverlap] = useState(String(chunking.overlap ?? 50));

  useEffect(() => {
    setChunkSize(String(chunking.chunkSize ?? 500));
    setOverlap(String(chunking.overlap ?? 50));
  }, [chunking.chunkSize, chunking.overlap, open]);

  const handleStrategyChange = (strategy: ChunkingStrategy) => {
    onChunkingChange({
      strategy,
      chunkSize: Number(chunkSize) || 500,
      overlap: Number(overlap) || 50,
    });
  };

  const handleChunkSizeBlur = () => {
    onChunkingChange({
      ...chunking,
      chunkSize: Number(chunkSize) || 500,
      overlap: Number(overlap) || 50,
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="入库配置"
      className="w-[480px]"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={loading || submitting || files.length === 0}>
            {submitting ? '入库中…' : `开始入库（${files.length} 个文件）`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium">待入库文件</p>
          <ul className="max-h-28 space-y-1 overflow-auto rounded-ctrl border border-line bg-canvas/40 px-3 py-2 text-xs">
            {files.map((file) => (
              <li key={file.name} className="truncate text-muted">
                {file.name}
              </li>
            ))}
          </ul>
        </div>

        {loading ? (
          <p className="text-sm text-muted">正在分析文件并生成推荐配置…</p>
        ) : (
          <>
            <Field label="Loader 类型">
              <SelectNative value={loaderHint} onChange={(e) => onLoaderChange(e.target.value)}>
                {LOADER_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </SelectNative>
              <p className="mt-1 text-xs text-muted">
                影响服务端对文档类型的识别；当前 Web 上传为纯文本 JSON，此处用于对齐推荐策略。
              </p>
            </Field>

            <Field label="Chunk 策略">
              <SelectNative
                value={chunking.strategy}
                onChange={(e) => handleStrategyChange(e.target.value as ChunkingStrategy)}
              >
                {CHUNK_STRATEGY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </SelectNative>
            </Field>

            {chunking.strategy === 'fixed' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Chunk 大小">
                  <Input
                    type="number"
                    min={100}
                    value={chunkSize}
                    onChange={(e) => setChunkSize(e.target.value)}
                    onBlur={handleChunkSizeBlur}
                  />
                </Field>
                <Field label="Overlap">
                  <Input
                    type="number"
                    min={0}
                    value={overlap}
                    onChange={(e) => setOverlap(e.target.value)}
                    onBlur={handleChunkSizeBlur}
                  />
                </Field>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}
