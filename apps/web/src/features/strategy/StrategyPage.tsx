import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { Card, PageHeader } from '@/shared/ui';
import { Input, SelectNative, SwitchRow } from '@/shared/ui/form';
import { toast } from '@/shared/ui/Toast';
import type { StrategyConfig, StrategyPreset } from '@/shared/types';
import { KERNEL_ONLY_POST_STRATEGIES, POST_RETRIEVAL_CONTROLS } from './strategy-assembly';
import { PipelineStageBar } from './PipelineStageBar';

/** 全局运行时装配；读写 `/api/v1/strategy`，编译进 createRuntimeFromConfig 四段链。 */
export default function StrategyPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAppContext();
  const [config, setConfig] = useState<StrategyConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/ask', { replace: true });
    }
  }, [isAdmin, navigate]);

  useEffect(() => {
    void getStrategy().then(setConfig);
  }, []);

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
      toast.success('运行时装配已保存');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(resetStrategyDefaults());
    toast.success('已恢复默认装配');
  };

  if (!config) {
    return <div className="text-sm text-muted">加载中…</div>;
  }

  return (
    <div>
      <PageHeader
        title="运行时装配"
        description="作用于全部问答与检索；下方四段即编译进 runtime 的实际配置。"
        actions={
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
        }
      />

      <p className="mb-4 text-sm text-muted">
        预设「{presetLabels[config.preset]}」只是开关组合快捷方式（{presetDescriptions[config.preset]}
        ）；保存后真正生效的是下方四段。
      </p>

      <PipelineStageBar config={config} className="mb-5" />

      <div className="space-y-4">
        <Card className="p-4">
          <h3 className="mb-1 font-medium">1. 预处理（pre-retrieval）</h3>
          <p className="mb-3 text-xs text-muted">查询改写、扩展、拆解、多路与路由策略，在检索前变换 effectiveQuery。</p>
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
            description="LLM 写入 routeDecision（targets / skip / searchType）；FanOut 按 retriever id 过滤目标库，无匹配时不回退第一个 retriever"
          />
        </Card>

        <Card className="p-4">
          <h3 className="mb-1 font-medium">2. 检索（retrieval）</h3>
          <p className="mb-3 text-xs text-muted">
            多库场景走 FanOut + RRF 融合；searchType 由路由写入 routeDecision 后由 pgvector 消费。
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>topK（budget.maxChunks）</span>
            <Input
              type="number"
              min={1}
              value={config.retrieval.topK}
              onChange={(e) =>
                setConfig({
                  ...config,
                  retrieval: { topK: Math.max(1, Number(e.target.value) || 8) },
                })
              }
              className="w-20"
            />
            <span className="text-xs text-muted">进入生成的片段上限</span>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-1 font-medium">3. 后处理（post-retrieval）</h3>
          <p className="mb-3 text-xs text-muted">按内核官方装配顺序编号；仅列出本控制台可编辑的策略。</p>
          <div className="space-y-1">
            {POST_RETRIEVAL_CONTROLS.map((item) => (
              <div key={item.id} className="rounded-ctrl border border-transparent px-1">
                <SwitchRow
                  checked={config.postRetrieval[item.configKey]}
                  onCheckedChange={(v) =>
                    setConfig({
                      ...config,
                      postRetrieval: { ...config.postRetrieval, [item.configKey]: v },
                    })
                  }
                  label={
                    <span>
                      <span className="mr-2 font-mono text-[10px] text-muted">{item.order}.</span>
                      <span className="font-mono text-xs text-brand">{item.id}</span>
                      <span className="ml-2">{item.label}</span>
                    </span>
                  }
                  description={item.description}
                />
                {item.configKey === 'scoreThreshold' && config.postRetrieval.scoreThreshold ? (
                  <div className="mb-2 ml-10 flex items-center gap-2 text-sm">
                    <span className="text-muted">阈值</span>
                    <Input
                      type="number"
                      step={0.05}
                      min={0}
                      max={1}
                      value={config.postRetrieval.scoreThresholdValue}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          postRetrieval: {
                            ...config.postRetrieval,
                            scoreThresholdValue: Number(e.target.value) || 0.2,
                          },
                        })
                      }
                      className="w-24"
                    />
                  </div>
                ) : null}
                {item.configKey === 'contextBudget' && config.postRetrieval.contextBudget ? (
                  <div className="mb-2 ml-10 flex items-center gap-2 text-sm">
                    <span className="text-muted">最多保留</span>
                    <Input
                      type="number"
                      min={1}
                      value={config.postRetrieval.contextBudgetMax}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          postRetrieval: {
                            ...config.postRetrieval,
                            contextBudgetMax: Math.max(1, Number(e.target.value) || 5),
                          },
                        })
                      }
                      className="w-20"
                    />
                    <span className="text-muted">段</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
            内核默认链还包含 {KERNEL_ONLY_POST_STRATEGIES.join(' → ')}，本控制台未暴露对应开关。
          </p>
        </Card>

        <Card className="p-4">
          <h3 className="mb-1 font-medium">4. 生成（generation）</h3>
          <p className="mb-3 text-xs text-muted">
            引用与 grounding policy 为一等配置；runtime 会用包装器按策略处理无依据场景（skip 检索时 explicit 不拒答）。
          </p>
          <SwitchRow
            checked={config.generation.citations}
            onCheckedChange={(v) =>
              setConfig({ ...config, generation: { ...config.generation, citations: v } })
            }
            label="引用溯源"
            description="答案附带出处编号（推荐常开）"
          />
          <div className="mt-3 space-y-2 text-sm">
            <p className="font-medium">无依据策略（noGroundingPolicy）</p>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                checked={config.generation.noGroundingPolicy === 'explicit'}
                onChange={() =>
                  setConfig({
                    ...config,
                    generation: { ...config.generation, noGroundingPolicy: 'explicit' },
                  })
                }
                className="mt-0.5 text-brand"
              />
              <span>
                <span className="font-medium">explicit</span>
                <span className="mt-0.5 block text-xs text-muted">
                  无召回或 post 过滤后为空时模板拒答（routing skip 除外）
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                checked={config.generation.noGroundingPolicy === 'generalize'}
                onChange={() =>
                  setConfig({
                    ...config,
                    generation: { ...config.generation, noGroundingPolicy: 'generalize' },
                  })
                }
                className="mt-0.5 text-brand"
              />
              <span>
                <span className="font-medium">generalize</span>
                <span className="mt-0.5 block text-xs text-muted">
                  仍尝试用模型知识回答，并说明非来自知识库
                </span>
              </span>
            </label>
          </div>
          <p className="mt-4 text-xs text-muted">
            Active RAG：内核冻结项，配置字段可写入但不生效。
          </p>
        </Card>
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        <Link to="/settings" className="text-sm text-brand hover:underline">
          ← 返回设置
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleReset}>
            恢复默认
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? '保存中…' : '保存装配'}
          </Button>
        </div>
      </div>
    </div>
  );
}
