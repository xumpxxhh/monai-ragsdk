import { useEffect, useState } from 'react';
import { getDocument } from '@/shared/api/documents';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { DocStatusBadge } from '@/shared/ui/Badge';
import { toast } from '@/shared/ui/Toast';
import { formatDateTime } from '@/shared/utils';
import type { DocumentDetail, DocumentSource } from '@/shared/types';

interface DocumentContentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  /** 列表行摘要；打开时再按需拉 content。 */
  document: DocumentSource | null;
}

/** 展示入库时登记的原始文本；内容按需请求，避免列表接口膨胀。 */
export function DocumentContentModal({
  open,
  onOpenChange,
  collectionId,
  document,
}: DocumentContentModalProps) {
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !document) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setDetail(null);

    void getDocument(collectionId, document.id)
      .then((next) => {
        if (!cancelled) {
          setDetail(next);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : '加载原文失败';
          toast.error(message);
          onOpenChange(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, collectionId, document, onOpenChange]);

  const title = document?.title ?? '文档原文';

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      className="w-[720px] max-h-[85vh] overflow-hidden"
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      }
    >
      {document ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-mono">{document.sourceId}</span>
          <DocStatusBadge status={document.status} />
          <span>{formatDateTime(document.updatedAt)}</span>
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-muted">加载原文…</p>
      ) : (
        <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-ctrl border border-line bg-canvas p-3 text-xs leading-relaxed text-ink">
          {detail?.content?.trim() ? detail.content : '（无原文内容）'}
        </pre>
      )}
    </Modal>
  );
}
