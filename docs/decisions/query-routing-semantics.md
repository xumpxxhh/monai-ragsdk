# Query Routing 内核语义偏移 — 决策归档

> 状态：**草案**
> 日期：2026-08-19
> 范围：`packages/runtime` 的 pre-retrieval `query-routing-strategy` 内核语义定义

---

## 背景：业界标准 Query Routing 语义

### 业界共识定义

综合多个权威来源（[Guild.ai](https://www.guild.ai/glossary/query-routing-ai)、[AI Wiki](https://artificial-intelligence-wiki.com/ai-development/rag-systems/rag-query-routing/)、[Medium](https://levelup.gitconnected.com/routing-the-right-way-directing-queries-to-the-best-components-a01adc71d56b)、[Milvus Blog](https://milvus.io/blog/build-smarter-rag-routing-hybrid-retrieval.md)、[DEV Community](https://dev.to/rogiia/build-an-advanced-rag-app-query-routing-cn1)），RAG 领域的 Query Routing 标准定义是：

> **分析用户查询的意图与特征，将其智能路由到最合适的数据源、检索策略或语言模型。**

核心职责是 **决定"去哪里检索"和"怎么检索"**，而不仅仅是给查询打一个分类标签。

### 三种主流实现方式

| 方式                             | 原理                                                                                | 延迟       | 适用场景                                |
| -------------------------------- | ----------------------------------------------------------------------------------- | ---------- | --------------------------------------- |
| **Logical Routing（逻辑路由）**  | LLM 分析查询意图，通过结构化输出（JSON / function calling）选择目标数据源或检索策略 | ~500-800ms | 数据源类型明确（≤5 个）、需深度意图理解 |
| **Semantic Routing（语义路由）** | 将查询和预定义路由规则嵌入向量空间，通过相似度匹配选路                              | ~50-100ms  | 查询类型相对固定（≤20 种）、对延迟敏感  |
| **Hybrid（混合路由）**           | 语义路由做快速分流，低置信度时 fallback 到逻辑路由                                  | 视场景     | 生产环境推荐方案                        |

### 典型路由目标（业界实例）

路由的目标不仅限于"选知识库"，而是更广义的"选择最优检索路径"：

- **不同数据源**：向量库 vs SQL 数据库 vs 知识图谱 vs Web 搜索
- **不同检索策略**：单步检索 vs 多步迭代检索 vs 直接 LLM 回答（跳过检索）
- **不同索引类型**：Dense index vs Sparse index vs Hybrid index
- **不同模型**：轻量模型 vs 推理模型（如 OpenAI 内部的模型路由）
- **不同知识库/collection**：产品文档库 vs FAQ 库 vs 法规库

### Adaptive RAG（2024-2026 新趋势）

被业界称为"emerging best practice"（NAACL 2024，Atlan 2026 综述）。核心思路是训练一个小型查询分类器，将查询路由到不同复杂度的检索管线：

- 无需检索 → 直接 LLM 回答（省 retrieval 开销）
- 单步检索 → 标准 RAG 管线
- 多步迭代检索 → 复杂推理管线（Self-RAG / CRAG 风格）

这进一步说明：标准 Query Routing 的核心价值在于 **根据查询复杂度/意图动态选择整条检索-生成路径**，而不只是输出一个标签。

---

## 当前内核实现 vs 标准定义的偏移

### 当前实现

内核 Query Routing 位于 `packages/runtime/src/stages/pre-retrieval/strategies/query-routing-strategy.ts`。

其 system prompt：

> "你是查询路由器。根据用户问题决定检索 route（用于选择检索/后处理配置）。只输出 JSON：{ route, topK, budget, filters }"

实际行为：

1. LLM 输出一个 `route` 字符串标签（如 `conceptual` / `factual`）→ 写入 `request.route`
2. 可选输出 `topK` → 写入 `request.budget.maxChunks`
3. 可选输出 `budget` → 写入 `request.budget`
4. 可选输出 `filters` → 写入 `request.filters.metadata`
5. `alsoSetStrategy` 默认 `true`，把 `route` 复制到 `request.strategy`

### 下游消费点梳理

通过对 runtime pipeline 的完整搜索：

| 阶段                         | 是否读取 `request.route` | 用途                                                |
| ---------------------------- | ------------------------ | --------------------------------------------------- |
| **retrieval**（检索）        | 否                       | 不参与 retriever 选择或检索行为                     |
| **post-retrieval**（后处理） | 否                       | 不参与 rerank/压缩等决策                            |
| **generation**（生成）       | 否                       | 不参与 prompt 构建或模型选择                        |
| **debug / observability**    | 是                       | 写入 `RuntimeDebugInfo.route`、observation snapshot |
| **assemble-runtime-result**  | 是                       | 透传到最终结果对象中供调试                          |

**结论**：`request.route` 在核心检索-生成管线中 **没有任何实质性的行为影响**。它是一个纯 debug/observability 字段。

### 偏移总结

| 维度             | 业界标准 Query Routing                 | 当前内核实现                                          |
| ---------------- | -------------------------------------- | ----------------------------------------------------- |
| **核心职责**     | 决定"去哪里检索"（选数据源/策略/模型） | 输出分类标签 + 参数建议                               |
| **路由目标**     | 数据源 / 检索策略 / 模型 / 索引类型    | 无实际路由目标（标签不被消费）                        |
| **下游行为影响** | 改变检索路径                           | 仅 debug/observability                                |
| **更准确的名称** | Query Routing                          | Query Classification + Retrieval Parameter Suggestion |

---

## 决策：内核 Query Routing 必须演进为真正的路由

当前实现名为"Query Routing"，但实际只做分类标签 + 参数建议，`request.route` 在下游管线中无任何消费点——这意味着它 **名不副实，没有实际路由能力**。

如果把"源选择"甩给 server 层，那内核的 `query-routing-strategy` 就沦为一个昂贵的分类器（调用 LLM 只为打个标签），Query Routing 作为 pre-retrieval 核心环节的架构意义被掏空。

**因此，内核必须承担真正的路由职责：`route` 的输出必须在下游被消费，切实改变检索路径。**

### 需要落地的改动

1. **runtime 引入 `route → retriever` 映射消费机制**
   - `request.route` 的值必须在 retrieval 阶段被读取，用于选择对应的 retriever / 数据源 / 索引
   - 可通过配置式映射（`{ "factual": retrieverA, "conceptual": retrieverB }`）或动态分发实现

2. **支持多路径检索决策**
   - 路由目标不限于"选知识库"，也包括：选检索策略（dense vs sparse vs hybrid）、选是否跳过检索（Adaptive RAG 风格）、选检索深度（单步 vs 多步迭代）
   - 参考业界 Adaptive RAG 模式：无需检索 → 直接 LLM / 单步检索 → 标准管线 / 多步迭代 → 复杂推理管线

3. **保留现有参数建议能力作为附加产出**
   - `topK`/`budget`/`filters` 等参数建议仍然有价值，可作为路由决策的附属输出
   - 但它们不应是 Query Routing 的全部职责

### 改动边界

具体的 runtime 协议变更和实现细节不在本决策文档中展开，将在后续迭代中以独立设计文档落地。本文档仅归档"内核 Query Routing 必须做真正的路由"这一方向性决策。

---

## 参考资料

- [Guild.ai — Query Routing (AI)](https://www.guild.ai/glossary/query-routing-ai)
- [AI Wiki — RAG Query Routing: Intelligent Multi-Source Routing](https://artificial-intelligence-wiki.com/ai-development/rag-systems/rag-query-routing/)
- [Medium — Routing the Right Way: Directing Queries to the Best Components](https://levelup.gitconnected.com/routing-the-right-way-directing-queries-to-the-best-components-a01adc71d56b)
- [Milvus Blog — Build Smarter RAG with Routing and Hybrid Retrieval](https://milvus.io/blog/build-smarter-rag-routing-hybrid-retrieval.md)
- [DEV Community — Build an Advanced RAG App: Query Routing](https://dev.to/rogiia/build-an-advanced-rag-app-query-routing-cn1)
- [DEV Community — Adaptive Query Routing](https://dev.to/mithxcode/why-basic-rag-fails-in-production-and-how-adaptive-query-routing-fixes-it-5c1n)
- [Atlan — 12 Advanced RAG Techniques (2026)](https://atlan.com/know/advanced-rag-techniques/)
- [Easton — RAG Query Routing: Logic, Semantic, and Hybrid](https://eastondev.com/blog/en/posts/ai/20260505-rag-query-routing/)
