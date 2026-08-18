import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { getCollection } from '@/shared/api/collections';
import {
  applyPreset,
  getStrategy,
  presetDescriptions,
  presetLabels,
  resetStrategyDefaults,
  saveStrategy,
} from '@/shared/api/strategy';
import { useAppContext } from '@/shared/hooks/useAppContext';
import { Button } from '@/shared/ui/Button';
import { Card, ComingSoonModal } from '@/shared/ui';
import { Input, SelectNative, SwitchRow } from '@/shared/ui/form';
import { toast } from '@/shared/ui/Toast';
import type { CollectionDetail, StrategyConfig, StrategyPreset } from '@/shared/types';

export default function StrategyPage() {
  const { id = '' } = useParams();
  const { setCurrentCollectionId } = useAppContext();
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [config, setConfig] = useState<StrategyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void getCollection(id).then(setCollection);
    void getStrategy(id).then(setConfig);
    setCurrentCollectionId(id);
  }, [id, setCurrentCollectionId]);

  const handlePresetChange = (preset: StrategyPreset) => {
    if (!config) return;
    setConfig(applyPreset(config, preset));
    toast.success(`已套用预设：${presetLabels[preset]}`);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await saveStrategy(config);
      toast.success('策略已保存');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!id) return;
    setConfig(resetStrategyDefaults(id));
    toast.success('已恢复默认');
  };

  if (!collection || !config) {
    return <div className="text-sm text-muted">加载中…</div>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <Link to={`/knowledge-bases/${id}/documents`} className="text-muted hover:text-brand">
            {collection.name}
          </Link>
          <ChevronRight className="mx-1 inline h-3 w-3 text-muted" />
          <span className="font-medium">策略</span>
        </div>
        <div className="flex items-center gap-2">
          <SelectNative
            value={config.preset}
            onChange={(e) => handlePresetChange(e.target.value as StrategyPreset)}
            className="h-8"
          >
            {(Object.keys(presetLabels) as StrategyPreset[]).map((key) => (
              <option key={key} value={key}>
                {presetLabels[key]}
              </option>
            ))}
          </SelectNative>
          <Button variant="secondary" size="sm" onClick={() => setComingSoon('策略预设另存')}>
            另存为
          </Button>
        </div>
      </div>

      <p className="mb-4 text-sm text-muted">
        预设说明：{presetDescriptions[config.preset]}
      </p>

      <div className="space-y-4">
        <Card className="p-4">
          <h3 className="mb-2 font-medium">1. 提问预处理</h3>
          <SwitchRow
            checked={config.preRetrieval.rewrite}
            onCheckedChange={(v) =>
              setConfig({ ...config, preRetrieval: { ...config.preRetrieval, rewrite: v } })
            }
            label="查询改写"
            description="把口语问法改成更利于检索的表述"
          />
          <SwitchRow
            checked={config.preRetrieval.expansion}
            onCheckedChange={(v) =>
              setConfig({ ...config, preRetrieval: { ...config.preRetrieval, expansion: v } })
            }
            label="查询扩展"
            description="补充相关说法（可能增加召回与耗时）"
          />
          <SwitchRow
            checked={config.preRetrieval.decomposition}
            onCheckedChange={(v) =>
              setConfig({ ...config, preRetrieval: { ...config.preRetrieval, decomposition: v } })
            }
            label="问题拆解"
            description="复杂问题拆成多个子问题"
          />
          <SwitchRow
            checked={config.preRetrieval.multiQuery}
            onCheckedChange={(v) =>
              setConfig({ ...config, preRetrieval: { ...config.preRetrieval, multiQuery: v } })
            }
            label="多路查询"
            description="同一意图多种措辞并行检索后融合"
          />
          <SwitchRow
            checked={config.preRetrieval.routing}
            onCheckedChange={(v) =>
              setConfig({ ...config, preRetrieval: { ...config.preRetrieval, routing: v } })
            }
            label="查询路由"
            description="按问题类型调整召回量/过滤（高级）"
          />
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 font-medium">2. 检索</h3>
          <div className="flex items-center gap-2 text-sm">
            <span>召回数量 topK</span>
            <Input
              type="number"
              value={config.retrieval.topK}
              onChange={(e) =>
                setConfig({
                  ...config,
                  retrieval: { topK: Number(e.target.value) || 8 },
                })
              }
              className="w-20"
            />
          </div>
          <p className="mt-2 text-xs text-muted">混合检索 / 稀疏检索：后续</p>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 font-medium">3. 检索后处理</h3>
          <SwitchRow
            checked={config.postRetrieval.scoreThreshold}
            onCheckedChange={(v) =>
              setConfig({ ...config, postRetrieval: { ...config.postRetrieval, scoreThreshold: v } })
            }
            label="分数阈值过滤"
            description={`低于 ${config.postRetrieval.scoreThresholdValue} 丢弃`}
          />
          <SwitchRow
            checked={config.postRetrieval.dedupe}
            onCheckedChange={(v) =>
              setConfig({ ...config, postRetrieval: { ...config.postRetrieval, dedupe: v } })
            }
            label="近重复去除"
          />
          <SwitchRow
            checked={config.postRetrieval.contextBudget}
            onCheckedChange={(v) =>
              setConfig({ ...config, postRetrieval: { ...config.postRetrieval, contextBudget: v } })
            }
            label="上下文预算"
            description={`最多保留 ${config.postRetrieval.contextBudgetMax} 段`}
          />
          <SwitchRow
            checked={config.postRetrieval.rerank}
            onCheckedChange={(v) =>
              setConfig({ ...config, postRetrieval: { ...config.postRetrieval, rerank: v } })
            }
            label="智能重排序"
            description="用模型对候选再排序（更准，更慢更贵）"
          />
          <SwitchRow
            checked={config.postRetrieval.compression}
            onCheckedChange={(v) =>
              setConfig({ ...config, postRetrieval: { ...config.postRetrieval, compression: v } })
            }
            label="上下文压缩"
            description="压缩后再生成，减少噪音"
          />
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 font-medium">4. 生成</h3>
          <SwitchRow
            checked={config.generation.citations}
            onCheckedChange={(v) =>
              setConfig({ ...config, generation: { ...config.generation, citations: v } })
            }
            label="引用溯源"
            description="答案附带出处编号（推荐常开）"
          />
          <SwitchRow
            checked={config.generation.activeRag}
            onCheckedChange={() => undefined}
            disabled
            label="Active RAG"
            description="答不稳时自动再检索（后续 · 暂不可用）"
          />
          <div className="mt-2 space-y-2 text-sm">
            <p className="text-muted">兜底：无依据时 →</p>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={config.generation.noGroundingPolicy === 'explicit'}
                onChange={() =>
                  setConfig({
                    ...config,
                    generation: { ...config.generation, noGroundingPolicy: 'explicit' },
                  })
                }
                className="text-brand"
              />
              明确说「知识库未覆盖」
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={config.generation.noGroundingPolicy === 'generalize'}
                onChange={() =>
                  setConfig({
                    ...config,
                    generation: { ...config.generation, noGroundingPolicy: 'generalize' },
                  })
                }
                className="text-brand"
              />
              仍尝试泛化回答
            </label>
          </div>
        </Card>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={handleReset}>
          恢复默认
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>

      <ComingSoonModal
        open={comingSoon !== null}
        onOpenChange={(open) => !open && setComingSoon(null)}
        title={comingSoon ?? ''}
      />
    </div>
  );
}
