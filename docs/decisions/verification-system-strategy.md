# 验证体系落地策略

## 目的

本文档用于指导后续 AI 与开发者在当前 monorepo 中逐步建立验证体系，确保后续生成代码具备可验证、可运行、可回归的工程质量。

本文档不是“立即实施清单”，而是结合当前仓库状态整理出的阶段化落地策略。

## 当前仓库前提

当前仓库已从纯初始化阶段进入 `core + indexing + adapters + runtime` 的最小实现与验证阶段，已完成内容主要包括：

- `pnpm workspace` 结构。
- 7 个一级 package 的目录骨架。
- 每个 package 的最小 `package.json`、`src/index.ts`、`tsconfig.json`。
- 根级 TypeScript project references。
- Git 初始化与基础文档。
- 根目录已安装 `typescript`。
- 根目录已安装 `tsx` 与 `vitest`。
- `packages/core` 已开始实现共享领域契约，并已引入 `zod`。
- `packages/core` 已补最小 `demo/` 与 `__tests__/`。
- `packages/core` 已补 `Document` / `Vector` 共享模型。
- `packages/indexing` 已开始实现离线索引构建 MVP，并已补最小 `demo/` 与 `__tests__/`。
- `packages/adapters` 已开始实现 LangChain 适配 MVP，并已补 `demo/` 与 `__tests__/`。
- `packages/runtime` 已开始实现在线四阶段编排 MVP，并已补 `demo/` 与 `__tests__/`。
- 根 `package.json` 已具备 `typecheck`、`test`、`test:integration`、`check`、`smoke`、`verify` 入口。

当前尚未完成：

- `observability`、`eval`、`utils` 的包级实际实现。
- 上述未进入实现阶段 package 的测试脚本。
- 更完整的 integration、smoke 场景实现；当前仅覆盖 `runtime + adapters` 与 `indexing + runtime` 两条最小闭环链路。

因此，验证体系仍必须按阶段推进，当前已在根目录以及 `core`、`indexing`、`adapters`、`runtime` 中完成最小落地。

更准确地说：

- 阶段 1 已在根目录最小落地。
- 阶段 2 已在 `core`、`indexing`、`adapters` 与 `runtime` 中开始落地。
- 阶段 3 已开始最小落地。

## 核心目标

验证体系的目标保持不变，但应按工程节奏落地：

- 类型安全：约束 AI 生成代码的静态类型正确性。
- 行为一致：确保模块行为符合约定。
- 包级自治：每个 package 的关键能力可独立验证。
- 跨包协同：验证 package 之间的协作链路。
- 防止回归：在迭代中及时发现破坏性修改。

## 分层模型

后续验证体系建议保留以下五层，但分批启用：

1. Type 验证：基于 TypeScript 的静态检查。
2. Spec 验证：基于 Zod 的输入输出边界校验。
3. Unit Test：基于 Vitest 的单元测试。
4. Demo 验证：包级最小可运行示例。
5. Integration / Smoke：跨包链路与最小闭环验证。

## 阶段化落地规则

### 阶段 0：初始化阶段

该阶段已完成。

要求：

- 只维护工程骨架，不补业务实现。
- 不主动安装验证体系依赖。
- 不提前创建与当前代码无关的测试用例。
- 可以先沉淀验证策略文档与目录约定。

### 阶段 1：验证基础设施阶段

当用户明确要求开始建设验证体系时，先落地基础设施，而不是先写大量测试。

当前状态：已在根目录最小落地。

优先事项：

1. 在根目录安装仓库级验证工具。
2. 为根 `package.json` 增加统一脚本入口。
3. 明确 Vitest、TypeScript、Demo 的统一执行约定。
4. 为需要验证的 package 增加最小目录约定。

建议的根级工具：

- `typescript`
- `vitest`
- `tsx`

说明：

- 这些工具属于仓库级开发工具，应优先安装在根目录。
- 依赖归属规则以 `docs/decisions/package-installation-strategy.md` 为准。

### 阶段 2：包级验证阶段

当某个 package 开始承载真实逻辑后，再为该 package 增加验证内容。

当前状态：`core`、`indexing`、`adapters` 与 `runtime` 已开始落地，其他 package 尚未开始。

要求：

- 有逻辑，就要有 Type 验证。
- 有明确输入输出边界，就应补 Zod Schema。
- 有稳定函数行为，就应补 Unit Test。
- 有最小可演示流程，就应补 demo。

不要为了“看起来完整”而先批量补空测试。

### 阶段 3：跨包验证阶段

当至少两个 package 形成稳定依赖链路后，再启用集成测试与冒烟测试。

当前状态：已在根目录最小落地，覆盖 `runtime + adapters` 与 `indexing + runtime` 两条链路。

适用时机：

- `core + runtime` 已有可执行主路径。
- `runtime + adapters` 已形成稳定适配链路。
- `indexing` 能输出可被 `runtime` 消费的中间结果。

## 目录约定

后续验证体系应使用以下目录规则。

### 包内目录

对已进入实现阶段的 package：

```text
packages/<package-name>/
  src/
  __tests__/
  demo/
```

说明：

- `src/`：业务代码。
- `__tests__/`：单元测试目录。
- `demo/`：最小可运行示例目录。

不是所有 package 都必须在初始化阶段立即拥有 `__tests__/` 和 `demo/`，但一旦该包开始承载真实能力，就应按此结构补齐。

### 根级目录

当跨包协同开始出现后，再在根目录引入：

```text
tests/
  integration/
  smoke/
```

说明：

- `tests/integration/`：跨包集成测试。
- `tests/smoke/`：最小业务闭环测试。

当前状态：以上目录已在根目录启用，当前场景复用 `tests/shared/` 中的公共断言与场景构造。

## 工具选型约束

当前验证体系优先采用以下工具：

- TypeScript：静态类型检查。
- Vitest：测试运行框架。
- Zod：输入输出边界 Schema 校验。
- tsx：运行 TypeScript Demo。

说明：

- 这里的“优先采用”是默认策略，不应理解为永久禁止其他辅助工具。
- 如果后续确实需要少量配套工具，应先说明用途，再决定是否引入。

## 各层验证规则

### Type 验证

适用范围：所有开始承载真实实现的 package。

规则：

- 不允许提交存在 TypeScript 错误的代码。
- 根级脚本应提供统一的类型检查入口。
- 当前仓库已经启用 project references，后续应优先利用这一工程关系组织类型检查。

### Spec 验证

适用范围：存在明确外部输入输出边界的模块。

规则：

- 对外输入边界优先定义 Zod Schema。
- 数据进入核心逻辑前，优先在边界处完成 `.parse()` 或等价校验。
- `core` 包中的基础抽象与 Schema 定义应优先建设。

说明：

- 不是所有内部函数都必须立即使用 Zod。
- 优先覆盖“跨模块边界”和“外部输入边界”。

### Unit Test

适用范围：有稳定逻辑行为的 package。

规则：

- 单元测试优先覆盖纯函数、转换逻辑、边界条件与错误路径。
- `core` 与 `indexing` 是当前优先覆盖对象；`adapters` 与 `runtime` 已开始承载真实逻辑，也应立即进入这一层；后续再扩展到 `eval`。
- `utils` 与 `observability` 在承载真实逻辑后也应补齐测试。

### Demo 验证

适用范围：能提供最小闭环示例的 package。

规则：

- demo 的目标是证明“最小可用路径”，不是替代单元测试。
- 每个进入实现阶段且具备演示价值的 package，应提供 `demo/` 目录。
- 如果约定使用 `pnpm --filter <package-name> demo` 运行，则必须同步在该 package 的 `package.json` 中声明 `demo` script。

### Integration / Smoke

适用范围：存在稳定跨包链路后。

规则：

- Integration 关注包与包之间的协作接口。
- Smoke 关注最小主流程是否可用。
- 不应在单包逻辑尚未稳定时过早引入大规模集成测试。

## Root Scripts 约定

当验证体系正式进入实施阶段后，根 `package.json` 应逐步补齐统一脚本。

建议最少包含：

- `typecheck`
- `test`
- `test:integration`
- `check`
- `smoke`
- `verify`

说明：

- 脚本名称可以沿用上述命名。
- 具体命令应以当时仓库实际工具配置为准，不应在尚未安装工具前提前写死。

当前仓库现状：

- 根目录已具备 `typecheck`、`test`、`test:integration`、`check`、`smoke`、`verify`。
- 根目录已引入 `test:integration` 与 `smoke`，当前用于验证 `runtime + adapters` 与 `indexing + runtime` 的最小查询闭环。

## AI 执行顺序要求

后续 AI 在补验证体系时，应遵循以下顺序：

1. 先确认仓库是否已进入“验证基础设施阶段”。
2. 先补根级工具与统一脚本，再补单个包测试。
3. 先补类型检查与单元测试，再补 demo。
4. 先补包内验证，再补 integration 与 smoke。
5. 在引入任何依赖前，先阅读 `docs/decisions/package-installation-strategy.md`。

## 禁止事项

- 禁止在初始化阶段直接大规模安装验证依赖。
- 禁止为了满足文档结构而批量创建空测试。
- 禁止只写 demo 而不补类型检查与单元测试。
- 禁止把验证体系和评测体系混为一谈。
- 禁止把 BLEU、MRR 等评测指标实现塞入 `runtime`，这类逻辑应归入 `eval`。

## 与评测体系的边界

- 验证体系：负责代码正确性、接口稳定性与工程可运行性。
- 评测体系：负责衡量 RAG 结果质量与效果优劣。

二者可以协同存在，但不要混用目录、脚本与职责。
