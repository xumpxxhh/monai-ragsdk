# Monorepo 工程结构说明

## 根目录职责

- `.cursor/rules/project-constraints.mdc`：仓库级 Cursor 工程约束。
- `docs/`：项目文档目录。
- `docs/decisions/`：工程决策文档目录。
- `packages/`：SDK 各一级 package。
- `package.json`：根级 workspace 信息。
- `pnpm-workspace.yaml`：workspace 声明。
- `pnpm-lock.yaml`：锁文件。
- `tsconfig.json`：根级 TypeScript 配置与 project references 入口。
- `.gitignore`：Git 忽略规则。

## package 统一约定

每个一级 package 当前都包含以下最小文件：

- `package.json`
- `src/index.ts`
- `tsconfig.json`
- `README.md`
- `dist/`（执行构建后生成）

对已进入实现阶段的 package，还可能额外包含：

- `demo/`
- `__tests__/`

其中：

- `package.json` 用于声明独立包身份。
- `src/` 只允许存放 `.ts` 源码。
- `src/index.ts` 是源码入口。
- `dist/` 是唯一合法的构建产物输出目录。
- `tsconfig.json` 继承根配置，并开启 `composite`，同时将构建产物输出到 `dist/`。
- `README.md` 用于记录该包的定位与阶段状态。

## TypeScript 工程关系

根级 `tsconfig.json` 当前采用 solution-style 结构：

- 使用 `files: []` 作为空入口。
- 使用 `references` 引用 7 个一级 package。
- 每个 package 使用独立 `tsconfig.json` 接入整个工程图。

该结构适合后续演进为标准的多包构建体系。

当前各 package 统一采用以下产物边界：

- `main` 指向 `dist/index.js`
- `types` 指向 `dist/index.d.ts`
- `exports` 指向 `dist/`
- 不允许将 `.js`、`.d.ts`、`.map` 等构建产物写回 `src/`

## 当前不包含的内容

- `eval`、`utils` 的业务实现。
- 发布配置。
- CI 配置。
- 尚未进入实现阶段 package 的测试框架配置。
- 更完整的 integration / smoke 级验证基础设施。
- 完整文档生命周期与独立知识库一级 package（当前门面 MVP 挂在 `runtime.createCollection()`）。

以上内容都应按 `docs/decisions/sdk-evolution-roadmap.md` 的阶段顺序逐步补充，而不是在本文档中视为永久排除项。

## 依赖安装约定

关于依赖安装在根目录还是子包目录的规则，统一以 `docs/decisions/package-installation-strategy.md` 为准。

在引入任何新依赖前，应先根据该文档判断依赖归属，再决定是否执行安装。

## 验证体系约定

关于测试、demo、integration、smoke 与验证工具的引入顺序，统一以 `docs/decisions/verification-system-strategy.md` 为准。

当前 `core`、`indexing`、`adapters` 与 `runtime` 已进入 demo 与 unit test 阶段，`observability` 已进入最小实现与 unit test 阶段，根目录也已补最小 integration / smoke 链路；其余 package 仍不应提前批量引入验证体系实现。
