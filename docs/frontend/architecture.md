# 前端工程架构骨架

面向 B 端控制台、管理后台类应用的通用前端工程结构。约定目录分层、数据访问、UI 基建与工具链，可直接作为新项目起点。

---

## 1. 定位与原则

| 原则 | 说明 |
|---|---|
| **Feature 优先** | 按业务域划分 `features/`，页面、局部逻辑、域内工具放在同一目录 |
| **Shared 沉淀** | 跨域复用的 API、UI、Hooks、类型放在 `shared/` |
| **薄入口** | `App.tsx` 只维护路由表；布局在 `layouts/`；启动逻辑在 `main.tsx` |
| **轻量状态** | 默认用页面内 `useState` 与模块级单例；不预设全局状态库 |
| **类型与 API 对齐** | 请求/响应类型集中在 `shared/types`，与后端契约一致 |
| **原语 + 自研 UI** | 交互无障碍原语（如 Radix）负责行为；视觉与组合在 `shared/ui` 统一 |

适用：REST 为主、按需接入 WebSocket 或 SSE 的后台应用。

---

## 2. 技术栈

| 类别 | 选型 | 说明 |
|---|---|---|
| 运行时 | React + TypeScript | 函数组件 + Hooks |
| 构建 | Vite | 通过 `envPrefix` 控制注入浏览器的环境变量前缀 |
| 路由 | react-router-dom | `BrowserRouter` + 可配置 `basename` |
| 样式 | Tailwind CSS | 语义 token 映射到 CSS 变量 |
| 组件原语 | Radix UI | Dialog、Select、Tabs 等无样式交互组件 |
| 通知 | sonner 或同类库 | 在 `shared/ui` 做薄封装 |
| 测试 | Vitest + Testing Library + jsdom | 测试文件与源码同目录，后缀 `*.test.ts(x)` |
| 规范 | ESLint + Prettier | 按仓库统一配置 |

以下为**按需引入**，不属于骨架必需：

- 画布 / 图编辑：`@xyflow/react`、`@dagrejs/dagre` 等
- 代码编辑：CodeMirror 等
- 与后端共享的类型或校验：独立 npm 包或 monorepo 内 workspace 包

---

## 3. 目录结构

```
<project-root>/
├── index.html
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── package.json
├── public/
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── vite-env.d.ts
    │
    ├── config/
    │   └── env.ts
    │
    ├── layouts/
    │   ├── AppShell.tsx
    │   ├── Sidebar.tsx
    │   ├── Topbar.tsx
    │   └── FullscreenLayout.tsx
    │
    ├── features/
    │   └── <domain>/
    │       ├── <Domain>Page.tsx
    │       ├── components/       # 可选：仅本域使用的组件
    │       ├── utils.ts
    │       └── *.test.ts
    │
    ├── pages/                    # 可选：调试页或尚未归入 feature 的页面
    │
    └── shared/
        ├── api/
        │   ├── http.ts
        │   ├── <resource>.ts
        │   ├── <resource>-events.ts   # 可选
        │   └── <channel>-client.ts    # 可选：WebSocket 等
        ├── hooks/
        ├── types/
        ├── ui/
        │   ├── form/
        │   ├── Modal.tsx
        │   └── ...
        ├── theme/
        └── utils/
```

### 3.1 分层职责

```
┌─────────────────────────────────────────────────────────┐
│  features/*     业务页面、域内状态、域内组件与工具       │
├─────────────────────────────────────────────────────────┤
│  layouts/*      导航壳、Outlet、壳层内的公共数据加载     │
├─────────────────────────────────────────────────────────┤
│  shared/api     网络请求、错误类型、按资源划分的 API     │
│  shared/hooks   订阅、轮询、长连接等的 React 封装        │
│  shared/ui      可复用组件与设计 token 的使用方式        │
│  shared/types   DTO、枚举、API 错误体                    │
├─────────────────────────────────────────────────────────┤
│  config/env     环境变量读取与 URL 派生                    │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Feature 与 Shared 的边界

| 放入 `features/` | 放入 `shared/` |
|---|---|
| 某条路由对应的页面 | 被两个及以上 feature 使用的组件 |
| 仅本域使用的 Panel、Modal | HTTP 封装、通用 Modal、Form |
| 域内校验与转换逻辑 | 主题、Toast、通用 Status 展示 |
| 页面级状态编排 | WebSocket 单例客户端 |

---

## 4. 启动与路由

### 4.1 入口 `main.tsx`

建议顺序：

1. 引入全局样式与字体
2. 初始化主题（在首屏渲染前写入 CSS 变量）
3. `createRoot` → `StrictMode` → `BrowserRouter` → `App`
4. 挂载全局通知组件（与路由同级，避免随路由卸载）

```tsx
applyTheme(readStoredTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename}>
      <App />
      <Toaster />
    </BrowserRouter>
  </StrictMode>,
);
```

### 4.2 路由表 `App.tsx`

- 列表、概览等常规页：用 `<Route element={<AppShell />}>` 嵌套，子路由通过 `<Outlet />` 渲染
- 全屏编辑、全屏详情：独立 `<Route>`，页面内使用 `FullscreenLayout` 或等价结构
- 路由表集中在一处；路由组件使用 default export

```tsx
<Routes>
  <Route element={<AppShell />}>
    <Route path="/" element={<HomePage />} />
    <Route path="/items" element={<ItemsListPage />} />
  </Route>
  <Route path="/items/new" element={<ItemEditorPage />} />
  <Route path="/items/:id" element={<ItemDetailPage />} />
</Routes>
```

### 4.3 两种布局

| 布局 | 结构 | 典型用途 |
|---|---|---|
| **AppShell** | 侧栏 + 顶栏 + `<main><Outlet /></main>` | 带导航的后台页 |
| **FullscreenLayout** | 顶栏（返回、标题、操作）+ 全高内容区 | 编辑器、沉浸式详情 |

AppShell 可在此层加载侧栏需要的公共数据（如最近记录），并通过 pub/sub 或 props 向下传递。

---

## 5. 配置与环境变量

### 5.1 Vite

```ts
export default defineConfig({
  plugins: [react()],
  envPrefix: 'APP_',   // 只有 APP_ 前缀的变量会进入 import.meta.env
});
```

### 5.2 `config/env.ts`

环境变量在此集中读取和派生，业务代码不直接拼接 URL。

| 变量 | 用途 |
|---|---|
| `APP_BASE_PATH` | 路由 `basename`；值为 `/` 时规范化为空字符串 |
| `APP_API_BASE_URL` | REST、SSE 的请求根路径 |
| 派生函数 | 例如由 HTTP(S) 地址推导 WebSocket 地址 |

```ts
function toRouterBasename(basePath: string): string {
  if (!basePath || basePath === '/') return '';
  return basePath.replace(/\/$/, '');
}

export const routerBasename = toRouterBasename(import.meta.env.APP_BASE_PATH ?? '/');
export const apiBaseUrl = import.meta.env.APP_API_BASE_URL ?? '';
```

开发环境使用 `.env.development`；生产环境使用 `.env.production`。生产环境 API 地址常用同源相对路径（如 `/api/v1`）。

---

## 6. 数据层

### 6.1 HTTP 封装

文件：`shared/api/http.ts`

约定：

- 请求路径相对于 `apiBaseUrl`，不在各模块重复写前缀
- 提供 `apiGet`、`apiPost`、`apiPut`、`apiDelete`
- 非 2xx 响应统一抛出 `ApiError`，携带 `status` 与解析后的 `body`
- 若后端提供 SSE：可增加 `apiPostSse`，用 `fetch` + `ReadableStream` 按行解析 `data:`  payload

```ts
export class ApiError extends Error {
  status: number;
  body?: unknown;
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  // 构建 URL → fetch → 解析 JSON → 校验 response.ok
}
```

### 6.2 按资源划分 API 模块

每个后端资源一个文件，例如 `items.ts`、`users.ts`：

- 导出动词化方法：`list`、`get`、`create`、`update`、`remove`
- 类型来自 `shared/types` 或在模块内声明后导出
- 页面与 feature 不直接调用 `fetch`

### 6.3 跨页刷新（轻量 pub/sub）

用于「A 页变更后，B 页（如侧栏）需要刷新」且不想引入全局 store 的场景。

```ts
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeItemsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyItemsChanged(): void {
  for (const listener of listeners) listener();
}
```

创建、删除成功后调用 `notify*`；订阅方在 `useEffect` 中注册并在卸载时取消。

### 6.4 WebSocket（可选）

**客户端类**（`shared/api/<channel>-client.ts`）：

- 导出单例 getter，全应用共享一条连接
- 按业务 id 维护 `Map<id, Set<Listener>>`，支持同一 id 多路监听
- 有订阅时连接，无订阅时断开
- 暴露连接状态变更回调，供 UI 展示

**Hook**（`shared/hooks/use<Channel>.ts`）：

- 在 `useEffect` 中 subscribe，cleanup 时 unsubscribe
- 用 `useRef` 保存最新回调，避免闭包过期
- 若 REST 已加载历史数据，可向 subscribe 传入偏移量，避免重复推送

```
页面 ── REST API ──► 初始数据、写操作
页面 ── Hook ──► WS Client ──► 增量事件
壳层 ◄── pub/sub ◄── notify（列表类变更）
```

### 6.5 类型

`shared/types` 描述 API 边界上的数据结构：

- 字段名、枚举值与后端一致
- 日期、时间通常以 ISO 字符串形式出现
- 与 OpenAPI 或后端 DTO 保持同步；领域模型若另有共享包，前端只引用 API 需要的部分

---

## 7. UI 与设计系统

### 7.1 三层样式

```
index.css         定义 CSS 变量（颜色、surface、状态色）
      ↓
tailwind.config   将 token 映射为 Tailwind 类名
      ↓
组件              className 只使用语义类名，不写散落 hex
```

常用语义 token 示例：

- 背景：`canvas`、`surface`、`raised`、`panel`
- 文字：`ink`、`muted`、`faint`
- 边框：`line`、`line-soft`
- 状态：`success`、`warning`、`danger`，或按业务定义 `running`、`failed` 等
- 圆角与阴影：如 `rounded-card`、`shadow-card`

### 7.2 主题

- 维护主题 id 列表；用户选择写入 `localStorage`
- `applyTheme(id)` 向 `document.documentElement` 写入 CSS 变量（及可选的 `data-theme` 属性）
- 切换主题不依赖重新构建

### 7.3 组件组织

| 层级 | 位置 | 职责 |
|---|---|---|
| 交互原语 | Radix 等 | 焦点、键盘、ARIA |
| 表单 | `shared/ui/form` | Input、Select、Field、Switch 等，共用样式与错误展示 |
| 复合组件 | `shared/ui` | Modal、Drawer、Tabs、EmptyState、DropdownMenu |
| 领域组件 | feature 内或 `shared` 子目录 | 仅当复用面足够大再放入 shared |

Dialog 的外部点击、嵌套层级等横切逻辑，可抽成 hook 或 util，避免在每个 Modal 重复实现。

### 7.4 表单

- `Field` 组件配合 context，统一 label、error、控件 id 的关联
- 动态表单（如 JSON Schema 驱动）可单独建子目录，包含解析、渲染、校验与对应单测

---

## 8. 状态管理

| 场景 | 建议做法 |
|---|---|
| 列表筛选、分页、表单草稿 | 页面内 `useState` / `useReducer` |
| 复杂编辑器本地态 | 页面级 state + feature 内纯函数 |
| 实时推送 | WebSocket 客户端 + 专用 Hook |
| 壳层公共列表 | AppShell 内 fetch + pub/sub 触发刷新 |
| 可缓存的配置或 schema | 模块级 `Map` + 显式 preload |
| 主题 | `localStorage` + `applyTheme` |

默认不引入 Redux、Zustand 等。出现跨多路由、多层 prop drilling 且 pub/sub 不够用时，再评估轻量 store。

---

## 9. 测试

```ts
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

优先为纯函数与数据转换写单测：校验逻辑、事件归并、schema 解析等。页面级 E2E 按项目需要单独配置，不纳入本骨架默认范围。

---

## 10. 构建与脚本

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "check-types": "tsc -b",
    "preview": "vite preview",
    "test": "vitest run",
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

| 脚本 | 作用 |
|---|---|
| `dev` | 开发服务器 |
| `build` | TypeScript 项目引用构建检查后打包 |
| `check-types` | 仅类型检查，供 CI 使用 |
| `preview` | 本地预览生产构建 |
| `test` | 单次运行 Vitest |

### TypeScript 项目引用

- `tsconfig.json`：引用 `tsconfig.app.json`（源码）与 `tsconfig.node.json`（Vite 配置等）
- 应用配置开启 `noUnusedLocals`、`noUnusedParameters` 等严格项，按团队标准调整

### Monorepo（可选）

若项目位于 monorepo：

- 前端应用放在 `apps/<name>/`
- 根目录脚本通过包管理器 filter 启动单个应用
- 共享类型或工具以 workspace 协议依赖内部包

---

## 11. 初始化清单

### 11.1 工程文件

- [ ] `package.json`
- [ ] `vite.config.ts`（含 `envPrefix`）
- [ ] `tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json`
- [ ] `tailwind.config.js`、`postcss.config.js`
- [ ] `vitest.config.ts`
- [ ] `index.html`
- [ ] `.env.development`、`.env.production`

### 11.2 源码最小集

```
src/
├── main.tsx
├── App.tsx
├── index.css
├── config/env.ts
├── layouts/AppShell.tsx
├── layouts/FullscreenLayout.tsx
├── features/home/HomePage.tsx
├── shared/api/http.ts
├── shared/types/index.ts
├── shared/theme/theme.ts
└── shared/ui/Toast.tsx
```

### 11.3 第一个业务模块

1. 在 `shared/types` 定义 API 类型
2. 在 `shared/api/<resource>.ts` 封装 CRUD
3. 在 `features/<resource>/` 添加页面
4. 在 `App.tsx` 注册路由，在 AppShell 导航中添加入口
5. 若需实时能力，再补充 WebSocket 客户端与 Hook

### 11.4 环境变量示例

```bash
# .env.development
APP_BASE_PATH=/
APP_API_BASE_URL=http://localhost:3000/api/v1

# .env.production
APP_BASE_PATH=/console
APP_API_BASE_URL=/api/v1
```

---

## 12. 约定与反模式

### 建议

- 新路由对应新的 `features/<domain>/` 目录
- 新 REST 资源对应新的 `shared/api/<resource>.ts`
- 确认会被多处复用后，再放入 `shared/ui`
- 大型可视化或专用编辑器逻辑放在独立子目录，由单一 feature 主要消费

### 避免

- 在 `App.tsx` 写数据请求或业务分支
- 在组件内硬编码 API 根路径
- 每个 feature 各自实现一套 fetch 与错误处理
- 过早引入全局 store 或第二套主题方案
- 将只用一次的组件放入 `shared/ui`，导致 shared 膨胀
