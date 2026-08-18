import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { askStream } from '@/shared/api/documents';
import { useAppContext, useIsAdmin } from '@/shared/hooks/useAppContext';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui';
import { Input } from '@/shared/ui/form';
import { cn } from '@/shared/utils';
import type { AskMessage, Citation } from '@/shared/types';

function renderAnswerWithCitations(content: string, activeCite: number | null, onCiteClick: (n: number) => void) {
  const parts = content.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const n = Number(match[1]);
      return (
        <button
          key={i}
          type="button"
          className={cn('cite-badge', activeCite === n && 'is-active')}
          onClick={() => onCiteClick(n)}
        >
          {n}
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function AskPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentCollection, currentCollectionId } = useAppContext();
  const isAdmin = useIsAdmin();
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [input, setInput] = useState(searchParams.get('q') ?? '');
  const [streaming, setStreaming] = useState(false);
  const [activeCite, setActiveCite] = useState<number | null>(1);
  const [effectiveQuery, setEffectiveQuery] = useState<string | null>(null);
  const [showEffectiveQuery, setShowEffectiveQuery] = useState(isAdmin);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasDocuments = (currentCollection?.documentCount ?? 0) > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || !currentCollectionId || streaming) return;

    const userMsg: AskMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: question,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);
    setEffectiveQuery(null);

    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    abortRef.current = new AbortController();
    try {
      const { stream, effectiveQuery: eq, citations } = await askStream(
        currentCollectionId,
        question,
        abortRef.current.signal,
      );
      if (eq) setEffectiveQuery(eq);

      let content = '';
      for await (const chunk of stream) {
        if (chunk === '__NO_GROUNDING__') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: '', noGrounding: true }
                : m,
            ),
          );
          break;
        }
        content = chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content, citations } : m)),
        );
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content, citations, effectiveQuery: eq } : m,
        ),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: m.content || '（请求失败）', interrupted: true } : m,
        ),
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, currentCollectionId, streaming]);

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant') {
        return [...prev.slice(0, -1), { ...last, interrupted: true }];
      }
      return prev;
    });
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const citations: Citation[] = lastAssistant?.citations ?? [];

  if (!hasDocuments) {
    return (
      <EmptyState
        icon={<FolderOpen className="h-12 w-12" />}
        title="这个知识库还没有文档"
        description="请先让管理员完成入库，或切换其他知识库"
        action={
          currentCollectionId ? (
            <Link to={`/knowledge-bases/${currentCollectionId}/documents`}>
              <Button>去文档与入库</Button>
            </Link>
          ) : null
        }
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-sm font-medium">
          问答 · {currentCollection?.name}
        </h1>
        {isAdmin ? (
          <div className="hidden items-center gap-3 rounded-ctrl border border-line px-3 py-1.5 text-sm sm:flex">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" name="mode" defaultChecked className="text-brand" /> 问答
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="mode"
                className="text-brand"
                onChange={() => navigate('/search-debug')}
              />{' '}
              仅检索
            </label>
          </div>
        ) : null}
      </div>

      <div className="ask-layout flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-auto p-1">
            {messages.length === 0 ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-card rounded-br-md bg-brand px-4 py-3 text-sm text-white shadow-card">
                  退货时效是多久？
                </div>
              </div>
            ) : null}
            {messages.map((msg) =>
              msg.role === 'user' ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-card rounded-br-md bg-brand px-4 py-3 text-sm text-white shadow-card">
                    {msg.content}
                  </div>
                </div>
              ) : msg.noGrounding ? (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[90%] rounded-card border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
                    <p className="mb-1 font-medium text-warning">知识库未覆盖该问题</p>
                    <p className="text-muted">
                      当前库中没有足够依据回答。可换一种问法，或请管理员补充相关文档。
                    </p>
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[90%] rounded-card rounded-bl-md border border-line bg-surface px-4 py-3 text-sm leading-relaxed shadow-card">
                    <div className={cn(streaming && msg === lastAssistant && 'stream-cursor')}>
                      {renderAnswerWithCitations(msg.content, activeCite, setActiveCite)}
                    </div>
                    {msg.interrupted ? (
                      <span className="text-xs font-medium text-warning">（已中断）</span>
                    ) : null}
                  </div>
                </div>
              ),
            )}
            <div ref={bottomRef} />
          </div>

          <div className="shrink-0 border-t border-line bg-surface p-4">
            <div className="flex items-end gap-2">
              <Button variant="secondary" size="lg" className="w-10 shrink-0 px-0" title="附件（后续）">
                <Plus className="h-4 w-4" />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入问题，例如：运费谁承担？"
                className="h-10 flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <Button
                className="shrink-0"
                onClick={() => (streaming ? stop() : void send())}
              >
                {streaming ? '停止' : '发送'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">答案均基于当前知识库；可点击角标查看原文。</p>
          </div>
        </section>

        <aside className="ask-cite-panel w-80 shrink-0 overflow-auto border-l border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">本轮依据</h2>
          {citations.length === 0 ? (
            <p className="text-sm text-muted">本轮未产生引用</p>
          ) : (
            <div className="space-y-3">
              {citations.map((cite) => (
                <button
                  key={cite.index}
                  type="button"
                  className={cn(
                    'cite-card w-full rounded-ctrl border border-line p-3 text-left text-sm transition-colors',
                    activeCite === cite.index && 'is-active',
                  )}
                  onClick={() => setActiveCite(cite.index)}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium">
                      [{cite.index}] {cite.title}
                    </span>
                    <span className="text-xs text-brand">相似度高</span>
                  </div>
                  <p className="text-xs text-muted">{cite.snippet}</p>
                </button>
              ))}
            </div>
          )}

          {(effectiveQuery || lastAssistant?.effectiveQuery) && (
            <div className="mt-4 border-t border-line pt-4">
              <button
                type="button"
                className="text-xs text-brand hover:underline"
                onClick={() => setShowEffectiveQuery((v) => !v)}
              >
                有效提问（改写后{showEffectiveQuery ? '，点击收起' : '，点击展开'}）
              </button>
              {showEffectiveQuery ? (
                <p className="mt-2 text-sm">「{effectiveQuery ?? lastAssistant?.effectiveQuery}」</p>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
