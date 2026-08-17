# 依赖安装策略

## 目的

本文档用于约束 monorepo 中依赖应安装在根目录还是子包目录，避免后续 AI 或开发者把依赖安装到错误位置。

## 适用范围

适用于当前仓库的 `pnpm workspace` 结构：

- 根目录负责 workspace 管理与仓库级工具。
- `packages/*` 下的每个一级 package 都是独立 workspace 包。

## 总原则

- 谁直接使用依赖，谁声明依赖。
- 优先保持依赖声明显式，不依赖“根目录顺带可用”。
- 区分“仓库级工具依赖”和“包级运行时依赖”。
- 除非明确要求，否则不要在初始化阶段引入依赖。

## 应安装在根目录的依赖

以下依赖通常安装在根目录：

- 整个仓库共享的开发工具。
- 整个仓库统一使用的编译工具。
- 整个仓库统一使用的代码质量工具。
- 整个仓库统一调度的测试或构建工具。

常见示例：

- `typescript`
- `eslint`
- `prettier`
- `vitest`
- `tsup`
- 其他仅服务整个仓库的开发工具

原因：

- 统一版本，避免不同 package 使用不同工具版本。
- 便于根级脚本统一调度。
- 这类依赖通常不属于任何单个 package 的运行时依赖。

示例命令：

```bash
pnpm add typescript -w -D
```

说明：

- `-w` 表示安装到 workspace 根目录。
- `-D` 表示安装到 `devDependencies`。

## 应安装在子包中的依赖

以下依赖通常安装在具体 package 下：

- 某个 package 在运行时直接使用的依赖。
- 某个 package 对外发布后，消费者运行该包时必须具备的依赖。
- 只服务单个 package 的开发依赖。

常见示例：

- `zod`
- `lodash-es`
- 具体模型 SDK
- 向量库客户端
- 只服务单个 package 的测试辅助库或构建插件

原因：

- 每个 package 的 `package.json` 应能独立描述自身依赖。
- 发布到 npm 后，依赖关系应由该 package 自己声明。
- `pnpm` 会复用物理存储，不会因为多个子包声明同一依赖而造成显著浪费。

## workspace 内部依赖规则

如果一个 package 依赖另一个 workspace 内部包，应在消费方 package 中声明依赖，而不是装在根目录。

示例：

```json
{
  "dependencies": {
    "@monai-ragsdk/core": "workspace:*"
  }
}
```

规则：

- `runtime` 依赖 `core`，就在 `packages/runtime/package.json` 中声明。
- `indexing` 依赖 `utils`，就在 `packages/indexing/package.json` 中声明。
- 不要把内部包依赖错误地声明到根 `package.json`。

## 判断规则

当需要安装一个新依赖时，按下面顺序判断：

1. 它是否只服务整个仓库的开发流程？
如果是，装在根目录。

2. 它是否会被某个 package 在运行时代码中直接 `import`？
如果是，装在该 package。

3. 它是否只服务某一个 package 的测试、构建或代码生成？
如果是，装在该 package 的 `devDependencies`。

4. 它是否是 workspace 内部包？
如果是，在消费方 package 中使用 `workspace:*` 声明。

## 当前阶段约束

当前仓库仍处于初始化阶段，因此：

- 不要因为“以后可能会用到”而提前安装依赖。
- 只有在需求已经明确时，才添加依赖。
- 添加依赖前，应先判断是否已超出初始化阶段边界。

## 给后续 AI 的执行要求

后续 AI 在安装依赖前，必须先回答下面三个问题：

1. 这是仓库级工具，还是包级依赖？
2. 这是运行时依赖，还是开发时依赖？
3. 这是外部依赖，还是 workspace 内部依赖？

如果这三个问题不能明确回答，则不要直接安装依赖，应先补充说明或更新文档。