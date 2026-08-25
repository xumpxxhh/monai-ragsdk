import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { askStream, searchDocuments } from '@/shared/api/documents';
import { useAppContext, useIsAdmin } from '@/shared/hooks/useAppContext';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui';
import { Input } from '@/shared/ui/form';
import { cn } from '@/shared/utils';
import type { AskMessage, Citation, RAGErrorRecord, RAGEvent, SearchResult } from '@/shared/types';
import { AskSearchPanel } from './AskSearchPanel';
import { ObserverRunPanel } from './ObserverRunPanel';

type AskMode = 'ask' | 'search';

function renderAnswerWithCitations(
  content: string,
  activeCite: number | null,
  onCiteClick: (n: number) => void,
) {
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

function parseCollectionIds(raw: string | null): string[] | undefined {
  if (!raw) {
    return undefined;
  }
  const ids = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

export default function AskPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { totalDocumentCount, collections, isAdmin } = useAppContext();
  const admin = useIsAdmin();

  const mode: AskMode = searchParams.get('mode') === 'search' ? 'search' : 'ask';
  const collectionIds = useMemo(
    () => parseCollectionIds(searchParams.get('collectionIds')),
    [searchParams],
  );

  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [input, setInput] = useState(searchParams.get('q') ?? '');
  const [streaming, setStreaming] = useState(false);
  const [activeCite, setActiveCite] = useState<number | null>(1);
  const [runTraceId, setRunTraceId] = useState<string | null>(null);
  const [observerEvents, setObserverEvents] = useState<RAGEvent[]>([]);
  const [observerErrors, setObserverErrors] = useState<RAGErrorRecord[]>([]);

  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');
  const [searchTopK, setSearchTopK] = useState(10);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasDocuments = totalDocumentCount > 0;

  const scopeLabel = useMemo(() => {
    if (!collectionIds || collectionIds.length === 0) {
      return undefined;
    }
    const names = collectionIds
      .map((id) => collections.find((item) => item.id === id)?.name ?? id)
      .join('、');
    return `本轮限定知识库：${names}`;
  }, [collectionIds, collections]);

  const setMode = useCallback(
    (next: AskMode) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === 'search') {
            params.set('mode', 'search');
          } else {
            params.delete('mode');
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || streaming) return;

    const userMsg: AskMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: question,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);
    setRunTraceId(null);
    // 新一轮开始即清空时间线，等待 live observer 事件
    setObserverEvents([]);
    setObserverErrors([]);

    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    abortRef.current = new AbortController();
    try {
      const result = await askStream({
        question,
        collectionIds,
        signal: abortRef.current.signal,
        onTraceId: (traceId) => {
          setRunTraceId(traceId);
        },
        onObserverEvent: (event) => {
          setObserverEvents((prev) => [...prev, event]);
        },
        onObserverError: (error) => {
          setObserverErrors((prev) => [...prev, error]);
        },
        onExecutionTrace: (trace) => {
          // 用完整快照覆盖 live 列表，防止漏事件或乱序
          setObserverEvents(trace.events);
          setObserverErrors(trace.errors ?? []);
          setRunTraceId(trace.traceId);
        },
      });

      let content = '';
      for await (const chunk of result.stream) {
        if (chunk === '__NO_GROUNDING__') {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: '', noGrounding: true } : m)),
          );
          break;
        }
        content = chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content, citations: result.citations } : m,
          ),
        );
      }

      if (result.traceId) {
        setRunTraceId(result.traceId);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content,
                citations: result.citations,
                effectiveQuery: result.effectiveQuery,
                pipeline: result.pipeline,
                traceId: result.traceId,
              }
            : m,
        ),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || '（请求失败）', interrupted: true }
            : m,
        ),
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [collectionIds, input, streaming]);

  const runSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query || searchLoading) return;
    setSearchLoading(true);
    setObserverEvents([]);
    setObserverErrors([]);
    setRunTraceId(null);
    try {
      const data = await searchDocuments({ query, topK: searchTopK, collectionIds });
      setSearchResult(data);
      setRunTraceId(data.traceId);
      if (data.executionTrace) {
        setObserverEvents(data.executionTrace.events);
        setObserverErrors(data.executionTrace.errors ?? []);
      }
    } finally {
      setSearchLoading(false);
    }
  }, [collectionIds, searchLoading, searchQuery, searchTopK]);

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

  const switchToAskWithQuery = (query: string) => {
    setInput(query);
    setMode('ask');
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete('mode');
        params.set('q', query);
        return params;
      },
      { replace: true },
    );
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const citations: Citation[] = lastAssistant?.citations ?? [];
  const inspectTraceId = runTraceId ?? lastAssistant?.traceId ?? searchResult?.traceId ?? null;
  const kernelRunning = streaming || searchLoading;

  if (!hasDocuments) {
    return (
      <EmptyState
        icon={<FolderOpen className="h-12 w-12" />}
        title="还没有可检索的文档"
        description={
          isAdmin ? '请先在任一知识库中完成文档入库' : '请联系管理员完成文档入库后再提问'
        }
        action={
          isAdmin ? (
            <Link to="/knowledge-bases">
              <Button>去知识库管理</Button>
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-sm font-medium">问答</h1>
        {admin ? (
          <div className="flex items-center gap-3 rounded-ctrl border border-line px-3 py-1.5 text-sm">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="ask-mode"
                checked={mode === 'ask'}
                onChange={() => setMode('ask')}
                className="text-brand"
              />
              问答
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="ask-mode"
                checked={mode === 'search'}
                onChange={() => setMode('search')}
                className="text-brand"
              />
              仅检索
            </label>
          </div>
        ) : null}
      </div>

      {scopeLabel ? (
        <p className="mb-3 rounded-ctrl border border-line bg-canvas/50 px-3 py-2 text-xs text-muted">
          {scopeLabel}
        </p>
      ) : null}

      <div className="ask-layout flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          {mode === 'search' && admin ? (
            <AskSearchPanel
              query={searchQuery}
              topK={searchTopK}
              loading={searchLoading}
              result={searchResult}
              onQueryChange={setSearchQuery}
              onTopKChange={setSearchTopK}
              onSearch={() => void runSearch()}
              onAskWithQuery={switchToAskWithQuery}
              scopeHint={scopeLabel}
            />
          ) : (
            <>
              <div className="flex-1 space-y-5 overflow-auto p-1">
                {messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">
                    输入问题开始对话；答案引用可在右侧核验。
                  </p>
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
                          当前范围内没有足够依据回答。可换一种问法，或请管理员补充相关文档。
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
                  <Button className="shrink-0" onClick={() => (streaming ? stop() : void send())}>
                    {streaming ? '停止' : '发送'}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {collectionIds
                    ? '答案基于所选知识库；可点击角标查看原文。'
                    : '答案基于全部已注册知识库；可点击角标查看原文。'}
                </p>
              </div>
            </>
          )}
        </section>

        <aside className="ask-cite-panel w-[26rem] shrink-0 overflow-auto border-l border-line bg-surface p-4 xl:w-[30rem]">
          {admin ? (
            <ObserverRunPanel
              events={observerEvents}
              errors={observerErrors}
              running={kernelRunning}
              mode={mode === 'search' ? 'search' : 'ask'}
              traceId={inspectTraceId}
              className={cn(mode === 'ask' && 'mb-4 border-b border-line pb-4')}
            />
          ) : null}

          {mode === 'ask' || !admin ? (
            <>
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
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-medium">
                          [{cite.index}] {cite.title}
                        </span>
                        <span className="shrink-0 text-xs text-brand">{cite.score.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-muted">{cite.snippet}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
