import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui';
import { Input, SelectNative } from '@/shared/ui/form';
import type { SearchResult } from '@/shared/types';

interface AskSearchPanelProps {
  query: string;
  topK: number;
  loading: boolean;
  result: SearchResult | null;
  onQueryChange: (value: string) => void;
  onTopKChange: (value: number) => void;
  onSearch: () => void;
  onAskWithQuery?: (query: string) => void;
  scopeHint?: string;
}

/** 管理员「仅检索」模式：同页调用 runtime.search，不跳独立调试页。 */
export function AskSearchPanel({
  query,
  topK,
  loading,
  result,
  onQueryChange,
  onTopKChange,
  onSearch,
  onAskWithQuery,
  scopeHint,
}: AskSearchPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Card className="shrink-0 p-4">
        <div className="flex flex-col gap-2 lg:flex-row">
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="输入检索 query"
            className="h-10 flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSearch();
              }
            }}
          />
          <SelectNative
            value={topK}
            onChange={(e) => onTopKChange(Number(e.target.value))}
            className="h-10 w-full lg:w-28"
          >
            <option value={5}>topK 5</option>
            <option value={8}>topK 8</option>
            <option value={10}>topK 10</option>
            <option value={20}>topK 20</option>
          </SelectNative>
          <Button className="h-10 shrink-0" onClick={onSearch} disabled={loading || !query.trim()}>
            {loading ? '检索中…' : '检索'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">
          {scopeHint ?? '检索全部已注册知识库；结果含 post-retrieval 流水线摘要。'}
        </p>
      </Card>

      {result ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <p className="mb-3 text-sm text-muted">
            命中 {result.hits.length} 条
            {result.effectiveQuery ? ` · 有效 query：${result.effectiveQuery}` : ''}
            {result.appliedFilters.length > 0
              ? ` · 后处理：${result.appliedFilters.join(' → ')}`
              : ''}
          </p>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas/50 text-left text-muted">
                <tr>
                  <th className="w-12 px-4 py-3">#</th>
                  <th className="px-4 py-3">来源</th>
                  <th className="w-20 px-4 py-3">分数</th>
                  <th className="px-4 py-3">片段摘要</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.hits.map((hit) => (
                  <tr key={hit.rank}>
                    <td className="px-4 py-3">{hit.rank}</td>
                    <td className="px-4 py-3">{hit.title}</td>
                    <td className="px-4 py-3 font-mono text-xs">{hit.score.toFixed(2)}</td>
                    <td className="px-4 py-3 text-muted">{hit.snippet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {onAskWithQuery ? (
            <div className="mt-4">
              <Button variant="secondary" onClick={() => onAskWithQuery(result.query)}>
                用该 query 发起完整问答 →
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">输入 query 后检索，查看 post-retrieval 后的命中与流水线。</p>
      )}
    </div>
  );
}
