# Query Routing 语义升级 — 实施方案

> 状态：**已确认**
> 日期：2026-08-19
> 前置决策：[query-routing-semantics.md](./query-routing-semantics.md)
> 范围：`packages/runtime` 的 query-routing-strategy 重构 + retriever 消费路由决策

---

## 概述

升级 query-routing-strategy 支持可插拔裁断策略（LLM / 规则 / 算法），产出结构化 RouteDecision 写入 request，由现有 retriever 消费决策调整检索行为，pipeline 保持单条流水线不分裂。

---

## 现状

- `query-routing-strategy.ts` 在 pre-retrieval 层调用 LLM 输出 `route` 标签，写入 `request.route`
- 下游 retrieval / post-retrieval / generation **无任何代码读取** `request.route`
- `FanOutRetriever` 将所有 sub-query 无差别发给所有 retriever，不看 route

## 架构总览

```mermaid
flowchart LR
  QRS["query-routing-strategy"]
  Resolver["RoutingResolver（可插拔）"]
  RD["RouteDecision → request.routeDecision"]
  Retriever["现有 retriever（FanOut / 底层）"]
  Behavior["根据 decision 调整：选 collection / searchType / skip 等"]

  QRS --> Resolver
  Resolver --> RD
  RD --> Retriever
  Retriever --> Behavior
```

**核心原则**：路由决策在 pre-retrieval 产出，retriever 消费决策调整行为，pipeline 单条流水线不分裂。

---

## 实施步骤

### 1. 新增 RouteDecision 类型

新建 `packages/runtime/src/types/route-decision.ts`：

```typescript
export type RouteDecision = {
  targets?: string[];
  retrievalMode?: "skip" | "single" | "iterative";
  searchType?: "dense" | "sparse" | "hybrid";
};
```

在 `packages/runtime/src/types/retrieval-request.ts` 新增字段：

```typescript
routeDecision?: RouteDecision;
```

保留现有 `route?: string` 不动（向后兼容 debug/observability）。

---

### 2. RoutingResolver 接口 + 内置实现

新建 `packages/runtime/src/stages/pre-retrieval/strategies/routing-resolver.ts`：

```typescript
export interface RoutingResolver {
  resolve(
    query: string,
    request: RetrievalRequest,
    context: RuntimeContext,
  ): Promise<RouteDecision | undefined>;
}
```

**内置实现**（同目录下各一个文件）：

- **`LlmRoutingResolver`** — 现有 query-routing-strategy 的 LLM 调用逻辑迁入，扩展 prompt 让 LLM 额外输出 `targets` / `retrievalMode` / `searchType`。构造参数接收 `RuntimeStrategyModel` + `availableTargets`
- **`RuleBasedRoutingResolver`** — 用户传入规则数组，按优先级匹配，命中即返回 `RouteDecision`。零 LLM 开销

```typescript
type RoutingRule = {
  name: string;
  match: (query: string, request: RetrievalRequest) => boolean;
  decision: RouteDecision;
};
```

---

### 3. 重构 query-routing-strategy.ts

修改 `packages/runtime/src/stages/pre-retrieval/strategies/query-routing-strategy.ts`：

- 构造参数新增 `resolver: RoutingResolver`
- `apply()` 调用 `resolver.resolve()` 获取 `RouteDecision`，写入 `request.routeDecision`
- 保留现有 `topK` / `budget` / `filters` 参数建议能力（从 LlmRoutingResolver 的输出中解析，仍写入 request 对应字段）
- `request.route` 仍可选写入（从 `decision.targets?.[0]` 或 resolver 自定义），兼容 observability
- 提供便捷工厂函数：`createLlmRoutingStrategy(options)` / `createRuleBasedRoutingStrategy(rules)`
- 旧的硬编码 LLM 调用方式标记 `@deprecated`，保留向后兼容

---

### 4. retriever 消费 RouteDecision

修改 `packages/runtime/src/stages/retrieval/fan-out-retriever.ts` 和/或底层 retriever，读取 `request.routeDecision` 调整检索行为：

- **`targets`** → 如果底层 retriever 支持多 collection，根据 targets 过滤/选择检索范围。FanOutRetriever 可根据 targets 只激活匹配的 retriever
- **`retrievalMode === "skip"`** → retriever 直接返回空 candidates + `{ skipped: true }` metadata，不执行实际检索
- **`searchType`** → 透传到 request metadata 或 retriever 配置，由底层 retriever 决定 dense/sparse/hybrid 行为
- **无 routeDecision** → 行为不变，完全向后兼容

具体消费方式取决于底层 retriever 的能力，FanOutRetriever 作为编排层优先消费 `targets` 和 `skip`。

---

### 5. observability

query-routing-strategy 的 observation event 扩展，增加 `routeDecision` 到 attributes 中，让 trace 能看到完整的路由决策结果（targets / retrievalMode / searchType）。

---

## 改动边界

- `run-runtime.ts` **不改动**
- pipeline 保持单条流水线，不分裂
- 现有无 routing 的用法完全不受影响（不配 query-routing-strategy 则无 routeDecision，retriever 行为不变）
- generator 自行处理空 candidates（skip 模式下 retriever 返回空结果，generator 直接用 LLM 回答）

---

## 设计决策记录

| 决策点 | 结论 | 理由 |
| --- | --- | --- |
| 路由裁断放在哪一层 | pre-retrieval | 路由是检索前决策，不应在 retrieval 层分裂管线 |
| 是否引入 RoutingRetriever | 否 | 会分裂出多条 pipeline，增加复杂度；应由现有 retriever 消费 routeDecision |
| 裁断策略是否支持多种 | 是，通过 RoutingResolver 接口 | 需要同时支持 LLM 裁断（高智能）和规则裁断（低延迟） |
| skip 模式由谁处理 | retriever 返回空 + generator 自行容错 | 不侵入 run-runtime.ts |
| request.route 是否保留 | 保留，标记为可选 debug 字段 | 向后兼容 observability |

---

## 参考

- [Query Routing 语义偏移决策归档](./query-routing-semantics.md)
