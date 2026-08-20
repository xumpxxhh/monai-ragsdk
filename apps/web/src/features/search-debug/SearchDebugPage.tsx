import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { searchDocuments } from '@/shared/api/documents';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui';
import { Input, SelectNative } from '@/shared/ui/form';
import type { SearchResult } from '@/shared/types';

export default function SearchDebugPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('退货时效');
  const [topK, setTopK] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await searchDocuments({ query: query.trim(), topK });
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-sm font-medium">仅检索调试</h1>
        <Link to="/ask">
          <Button variant="secondary" size="sm">
            切回完整问答
          </Button>
        </Link>
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-2 lg:flex-row">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入查询"
            className="h-10 flex-1"
          />
          <SelectNative
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            className="h-10"
          >
            <option value={10}>topK 10</option>
            <option value={5}>topK 5</option>
            <option value={20}>topK 20</option>
          </SelectNative>
          <Button className="h-10" onClick={() => void handleSearch()} disabled={loading}>
            {loading ? '检索中…' : '检索'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">检索全部已注册知识库</p>
      </Card>

      {result ? (
        <>
          <p className="mb-3 text-sm text-muted">
            结果 {result.hits.length} 条（已应用：{result.appliedFilters.join(' / ')}）
          </p>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas/50 text-left text-muted">
                <tr>
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">来源</th>
                  <th className="px-4 py-3 w-20">分数</th>
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
          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={() => navigate(`/ask?q=${encodeURIComponent(result.query)}`)}
            >
              用该查询发起完整问答 →
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
