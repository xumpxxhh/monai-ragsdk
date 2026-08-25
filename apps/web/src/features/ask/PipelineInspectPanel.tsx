import { Link } from 'react-router-dom';
import { cn } from '@/shared/utils';
import type { PipelineSnapshot } from '@/shared/types';
import { RUNTIME_STAGES } from '@/features/strategy/strategy-assembly';

function joinList(values: string[] | undefined): string | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  return values.join(' → ');
}

function Field({ label, value }: { label: string; value?: string | number | boolean }) {
  if (value === undefined || value === '') {
    return null;
  }
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 break-words font-mono text-[11px]">{String(value)}</span>
    </div>
  );
}

/** 管理员检查面：展示当次 runtime 四段摘要，不暴露完整 RAGResponse。 */
export function PipelineInspectPanel({
  pipeline,
  traceId,
  className,
}: {
  pipeline: PipelineSnapshot;
  traceId?: string;
  className?: string;
}) {
  const resolvedTraceId = traceId ?? pipeline.traceId;
  const gen = pipeline.generation;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">本轮流水线</h3>
        {resolvedTraceId ? (
          <Link
            to={`/observe?trace=${encodeURIComponent(resolvedTraceId)}`}
            className="shrink-0 text-xs text-brand hover:underline"
          >
            观测详情
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 text-[10px]">
        {RUNTIME_STAGES.map((stage) => (
          <span key={stage.id} className="rounded bg-canvas px-1.5 py-0.5 text-muted">
            {stage.label}
          </span>
        ))}
      </div>

      <StageBlock title="预处理">
        <Field label="原问" value={pipeline.preRetrieval.originalQuery} />
        <Field label="有效问" value={pipeline.preRetrieval.effectiveQuery} />
        <Field label="子查询" value={joinList(pipeline.preRetrieval.subQueries)} />
        <Field label="策略" value={joinList(pipeline.preRetrieval.strategies)} />
        <Field label="改写原因" value={pipeline.preRetrieval.rewriteReason} />
      </StageBlock>

      <StageBlock title="检索">
        <Field label="召回数" value={pipeline.retrieval.retrieved} />
        <Field
          label="skip"
          value={
            pipeline.retrieval.skipped === undefined
              ? undefined
              : pipeline.retrieval.skipped
                ? `是（${pipeline.retrieval.skipReason ?? '未知原因'}）`
                : '否'
          }
        />
        <Field label="FanOut 路数" value={pipeline.retrieval.retrieverCount} />
        <Field label="融合候选" value={pipeline.retrieval.fusedCandidateCount} />
        <Field label="策略" value={joinList(pipeline.retrieval.strategies)} />
      </StageBlock>

      <StageBlock title="后处理">
        <Field label="选中" value={pipeline.postRetrieval.selected} />
        <Field label="丢弃" value={pipeline.postRetrieval.dropped} />
        <Field label="最终片段" value={pipeline.postRetrieval.finalChunks} />
        <Field label="策略" value={joinList(pipeline.postRetrieval.strategies)} />
      </StageBlock>

      {gen ? (
        <StageBlock title="生成">
          <Field label="引用数" value={gen.citationCount} />
          <Field
            label="拒答"
            value={gen.groundingRefusal === undefined ? undefined : gen.groundingRefusal ? '是' : '否'}
          />
          <Field label="空依据原因" value={gen.chunksEmptyReason} />
          <Field label="无依据策略" value={gen.noGroundingPolicy} />
          {gen.chunksEmptyReason === 'skipped' ? (
            <p className="text-[10px] text-muted">
              routing skip 时 explicit 策略不模板拒答，仍可走模型知识。
            </p>
          ) : null}
        </StageBlock>
      ) : null}

      {pipeline.timings ? (
        <div className="border-t border-line pt-2 text-[10px] text-muted">
          耗时(ms)：
          {[
            pipeline.timings.preRetrieval !== undefined
              ? `预处理 ${pipeline.timings.preRetrieval}`
              : null,
            pipeline.timings.retrieval !== undefined ? `检索 ${pipeline.timings.retrieval}` : null,
            pipeline.timings.postRetrieval !== undefined
              ? `后处理 ${pipeline.timings.postRetrieval}`
              : null,
            pipeline.timings.generation !== undefined ? `生成 ${pipeline.timings.generation}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      ) : null}
    </div>
  );
}

function StageBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-ctrl border border-line bg-canvas/40 p-2.5">
      <div className="mb-1.5 text-xs font-medium">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
