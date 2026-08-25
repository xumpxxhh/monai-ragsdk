# 控制台双面调整计划

> 状态：**待实施**（2026-08-24）
> 范围：在现有 `apps/web`（及必要的 `apps/server` 契约）上做大调整，**不**新开设计稿、**不**再走 HTML 原型。
> 内核对照：[packages/routing.md](../packages/routing.md)、[runtime.md](../packages/runtime.md)、[indexing.md](../packages/indexing.md)
> 旧产品原型（历史，不再作为实现蓝本）：[prototype/monai-rag-console.md](../prototype/monai-rag-console.md)
> 工程骨架仍以 [architecture.md](./architecture.md) 为准。

---

## 1. 定位

控制台走 **双面**：

| 面 | 给谁 | 主路径 | 信息密度 |
| --- | --- | --- | --- |
| **产品面** | 终端用户 | 提问 → 流式答案 → 点击引用核验 | 不暴露 pipeline 术语 |
| **内核面** | 管理员 / SDK 集成方 | 同一套问答与入库，但按内核阶段展开 | 必须能看见四段 runtime + 离线 indexing |

不是「纯 SDK Demo」，也不是现在这份「知识库问答 SaaS」。终端用户继续用问答产品；管理员视图必须把内核设计摊开，而不是藏在开关和运维页后面。

实施约束：

- 改现有页面与路由，不另起仓库、不另写可点击 HTML 原型。
- 不回头改 `packages/` 边界来迁就 UI（runtime 边界见 runtime.md §2）。
- `eval` 包已有检索指标、diff、生成 judge 协议；管理员侧栏「评测」走 `/eval`，调用 `/eval/run`、`/eval/compare`、`/eval/judge`、`/eval/from-traces`（见 [api.md](../server/api.md)、[eval-handoff.md](../context/eval-handoff.md)）。不要再放「评测即将推出」占位。

---

## 2. 现状错位（为什么要调）

当前 Web 按旧原型做成业务控制台（工作台 / 知识库 / 问答 / 观测 / 设置 + 角色头像 / 通知铃 / 评测占位）。内核实际是：

```
离线 indexing:  load → transform → filter → chunk → embed → upsert
在线 runtime:   pre-retrieval → retrieval → post-retrieval → generation
门面:           createCollection() 只编排 ingest / search / ask
装配:           推荐 createRuntimeFromConfig；post 有官方顺序
观测:           跟阶段走的事件，不是独立运维产品
```

具体错点：

1. **导航不对应分层**。侧栏是 SaaS 产品结构；策略页甚至不在侧栏，要绕设置才能进。
2. **策略页把 pipeline 拍扁成开关**。官方 post 顺序是 `llm-rerank → score-threshold → … → lost-in-the-middle`；UI 既不展示顺序，检索段只剩 `topK`，路由文案写成「调整召回量」，与 `routeDecision`（targets / skip / searchType）不符。`lostInMiddle` 已在配置类型里，页面未露出。Active RAG 是内核冻结项，却占生成段一等开关。
3. **问答是聊天产品，不是一次 `runtime.run()`**。管理员只能看到改写后的有效提问；`counts`、`strategies`、`retrievalMetadata.skipped`、grounding 拒答原因都到不了当次回答旁边。仅检索是独立页 `/search-debug`，和问答断开。
4. **Collection 被撕开**。Server 已把 ask / search / strategy 做成全局（routing 选库），这和内核对齐。Web 仍是「库管文档、问答是全局聊天框、策略藏在设置」。
5. **入库不像 indexing**。切分塞在上传弹窗；观测把问答轨迹和入库任务做成两个运维 Tab，而不是「在线四段 / 离线流水线」两条 trace。
6. **产品壳干扰内核阅读**。假头像、通知红点、评测占位、问答页假消息「退货时效是多久？」、附件「后续」按钮。

---

## 3. 目标信息架构

终端用户侧栏：

- 问答
- 设置（外观、角色演示开关）

管理员侧栏：

- 工作台（健康与动态，不是概念中心）
- 问答（同一页，管理员多出检查面）
- 知识库（Collection：源 + indexing）
- **装配**（现 `/strategy`，对应 `createRuntimeFromConfig`）
- 观测（当次 run / ingest 的阶段事件）
- 评测（golden 跑分 / 对比 / judge / 抽样）
- 设置（adapters 连接状态 + 角色）

路由调整：

| 现路由 | 调整 |
| --- | --- |
| `/` 固定工作台 | `/` 按着陆偏好跳到 `/ask` 或 `/home` |
| `/strategy` 仅设置入口 | 侧栏「装配」直达；标题改为运行时装配 |
| `/search-debug` | 并进问答的「仅检索」模式；旧路径重定向 `/ask?mode=search` |
| 评测 | 管理员侧栏 `/eval`，不再用占位弹窗 |

顶栏去掉假头像 / 通知铃。角色切换留在设置（演示用），侧栏底部可保留「当前视图」。

---

## 4. 各页怎么改（基于现文件）

### 4.1 问答 `features/ask/AskPage.tsx` — 双面主舞台

**产品面（终端用户）**

- 左对话 + 右「本轮依据」保留。
- 去掉空态假气泡、附件占位。
- 无文档空态仍引导去知识库（或提示找管理员）。

**内核面（管理员）**

- 同页切换：问答（`runtime.runStream`）/ 仅检索（`runtime.search`），不要跳走。
- 右侧检查面以 **observer 事件时间线**为主（四段状态条 + 中文事件摘要）；`PipelineSnapshot` 审计表留给观测详情。
- ask SSE 实时推送 `observer` / `observer-error`；search 响应附带 `executionTrace`。
- 每段产物仍可从 observer attributes / pipeline 对照：

| 段 | 露出什么（有则显示） |
| --- | --- |
| pre-retrieval | `originalQuery` / `effectiveQuery` / `subQueries` / `strategies.preRetrieval` / `rewriteReason` |
| retrieval | `counts.retrieved`、是否 skip（`retrievalMetadata.skipped` + skipReason）、FanOut 路数 |
| post-retrieval | `counts.selected / dropped / finalChunks`、`strategies.postRetrieval`（按官方顺序理解） |
| generation | 引用数；`generationMetadata.groundingRefusal` / `chunksEmptyReason` / `noGroundingPolicy`。`skipped` 豁免 explicit 拒答，文案不要说成「无依据就一定拒答」 |

- 用 `traceId` 链到观测详情。
- 从某个知识库点「问答」时，可带 `collectionIds`（已有全局 API），表示本轮限定 targets，而不是再造「先选库才能问」。

### 4.2 装配 `features/strategy/StrategyPage.tsx`

把开关板改成 **四段装配画布**，语义对齐 `apps/server` 的 `buildRuntime` / 内核官方 post 顺序。

- 顶上四段条：预处理 → 检索 → 后处理 → 生成；显示各段已开启件数。
- **后处理按官方顺序编号展示**（与 `POST_RETRIEVAL_ASSEMBLY_ORDER` 一致，控制台没有的策略不要发明开关）：

  `llm-rerank → score-threshold → duplicate-removal → budget-trim → source-coverage → context-compression → lost-in-the-middle`

  控制台没有 `predicate-filter` / `context-ordering`：页面脚注说明「内核默认链有，本控制台未暴露」，不要做假开关。
- 检索段：`topK` 即 `budget.maxChunks` 的产品入口；说明多库走 FanOut + RRF，searchType 由 routing 写入 `routeDecision` 后由 pgvector 消费。不要再写「混合检索：后续」当一等能力。
- 查询路由文案改为：写出 `routeDecision`（targets / skip / searchType）；FanOut 按 retriever id 过滤，无匹配不回退 `[0]`。
- 生成段：引用 + grounding policy（explicit / generalize）为一等；Active RAG 降为脚注「内核冻结，字段可写不生效」。
- 预设保留（降低管理员负担），但说明预设只是开关组合，真正编译进 runtime 的是下面四段。

### 4.3 观测 `features/observe/ObservePage.tsx`

- Tab 语义改为 **在线运行** / **离线入库**，对应 runtime vs indexing。
- 详情先按四段摘要（可复用问答那份 `pipeline` 快照），再展开 observer 事件。
- 拿掉无效按钮「查看引用片段」；「用相同策略重放」可继续占位或改成带问题跳回 `/ask?q=`。
- 阶段耗时 id 用已有 `trace-labels.ts` 映射到四段中文名。

### 4.4 知识库 / 文档

- 列表说明改为：Collection 是门面；**入库走 indexing，问答走全局 runtime**。全局装配状态可展示，但不要暗示每库一套在线策略（server 已全局化）。
- 文档页在入库区用一句话标出 indexing 阶段：`load → chunk → embed → upsert`，增量 skip/replace 继续用现有计数芯片。
- 卡片「问答」跳到全局问答，可选带 `collectionIds`。
- 文档列表可查看入库登记原文：`GET .../documents/:documentId`（`DocumentDetail.content`）；列表接口仍不含正文。

### 4.5 工作台 / 设置 / 壳层

- 工作台仅管理员默认入口：健康卡片 + 动态保留；增加「当前装配」摘要（四段开关一览 → 装配页）。
- 设置：角色演示开关保留（双面依赖它）；「连接与模型」按 adapters（Embedding / Chat / 向量库）表述；策略入口改叫装配。
- `Sidebar` / `Topbar` / `App.tsx` 按 §3 改导航与着陆。

---

## 5. 服务端契约（Web 需要、现 API 不够）

现 `POST /api/v1/ask` 的 SSE `result` 只有 `citations` / `noGrounding`；`meta` 只有 `effectiveQuery`。管理员检查面不够用。

计划（实施时再改代码，并回写 [server/api.md](../server/api.md)）：

1. 增加精简 DTO `PipelineSnapshot`（从 `RuntimeResult` / `RuntimeSearchResult` 映射，不把整份 RAGResponse 丢给浏览器）。
2. ask SSE `result`（及必要时 `meta`）附带 `pipeline` + `traceId`。
3. `POST /api/v1/search` 的 `SearchResult` 同样带 `pipeline`；`appliedFilters` 可改为实际生效的 post 策略名，避免永远空数组。
4. `AskTrace` 落盘同一份 `pipeline`，观测详情不用只靠 timings 键名猜阶段。

已知缺口（先用现有字段，不要为 UI 改内核契约）：

- `routeDecision` **不在** `RAGResponse` 具名字段上；检索 skip 目前只能从 `retrievalMetadata.skipped` / `skipReason` 读。控制台不要假装能列出完整 targets，除非以后内核把决策写入审计快照。
- generation 无策略链；生成段只展示 grounding 包装器产物。

---

## 6. 明确不做

- 不新写原型 Markdown / 不生成独立 HTML 演示站。
- 不把控制台做成纯 pipeline IDE（终端用户问答不能拆掉）。
- 不实现 Active RAG、答案内标记解析、Chroma 查询、OTLP。
- 不把 ask/search 重新绑回单库 path。
- 不为控制台体验回头改 `packages/runtime` 边界。
- 不在 `docs/packages/` Wiki 写 apps 现状。

---

## 7. 建议实施顺序

一次只动一条用户可感知主路径，避免「导航改了、问答仍看不见四段」。

| 顺序 | 内容 | 主要文件 |
| --- | --- | --- |
| 1 | `PipelineSnapshot` 映射 + ask/search/trace 回传 | `apps/server` mappers、ask-stream、api 类型；`docs/server/api.md` |
| 2 | 双面导航与着陆（去掉评测占位、假顶栏） | `Sidebar`、`Topbar`、`App.tsx` |
| 3 | 装配页：四段画布 + 官方 post 顺序 + 文案 | `StrategyPage.tsx` |
| 4 | 问答页：管理员检查面；仅检索并入 | `AskPage` 及拆出的 inspect / search 子组件 |
| 5 | 观测 / 工作台 / 知识库 / 设置对齐 | 对应 feature 页 |

验收（管理员视图）：

- 不问也能从侧栏进入「装配」，并看出后处理顺序与内核一致。
- 问一句之后，不必去观测页也能看到本轮四段摘要。
- 切到终端用户后，上述检查面消失，问答 + 引用仍可用。

验收（终端用户）：

- 默认能直接问；答案可点引用。
- 看不到策略类名、FanOut、scoreKind 等内核词。
