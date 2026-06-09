# zeplin-sync

把组件代码按 Zeplin 设计稿对齐 —— 读取设计规格、修改代码，并通过「渲染 → 截图 → 比对」闭环验证；同时支持把设计稿里的静态素材（icon/图片）按页面增量接入。

> 本文档讲**怎么配置和使用**。`SKILL.md` 是给 agent 看的执行指令，无需手动阅读。

## 能力概览

- **样式对齐**：颜色、间距、字体、圆角、边框、阴影、布局、文案 —— 按 Zeplin 精确规格改代码，Tailwind 项目优先复用 `tailwind.config` 的 theme token。
- **静态素材**：导出 `exportable` 素材（icon 优先 SVG，位图 PNG `@2x`），按**当前页面在用素材**增量处理 —— 内容未变跳过、变化原地替换、缺失新增。
- **闭环验证**：用 Playwright 截运行中的页面，跟设计参考图比对，不一致就迭代（默认 ≤3 轮）。

## 前置配置

### 1. Zeplin Access Token（必需）

在 Zeplin **网页端**（不是桌面客户端）生成：

`Profile → Developer → Create new token` → 起个名字 → Create → **立刻复制保存**（离开页面后不再显示）。

> 生成 token 不收费。只要你的账号在目标设计稿所在的 project 里是成员，就能用自己的 token 读到它 —— 不需要你额外付费。

把 token 设到环境变量 `ZEPLIN_TOKEN`。因为 skill 的脚本是在你的 shell 环境里跑的，最可靠的方式是写进 shell 配置文件：

```bash
echo 'export ZEPLIN_TOKEN=<你的token>' >> ~/.zshrc   # 或 ~/.bashrc
# 重开终端，或 source 一下
```

> ⚠️ 不要把 token 写进任何会提交到 git 的文件。

### 2. Playwright MCP（必需）

闭环靠 Playwright MCP 截图（`browser_*` 工具）。确保当前 Claude Code 会话里已启用 Playwright MCP，否则 skill 会在前置检查处停下并提示你启用。

### 3. 运行中的 dev server（必需）

skill **不会**帮你启动项目 —— 它复用你已经跑起来的 dev server。使用前先把项目跑起来（如 `npm run dev`），并记下目标组件的**路由/URL**（如 `http://localhost:3000/profile`）。

## 怎么用

在你的**前端项目**目录里开一个 Claude Code 会话，直接用自然语言触发，给齐三样东西：**Zeplin screen 链接 + 路由 + 目标组件文件**（组件文件可省略，agent 会按路由帮你找）：

```
用 zeplin-sync 把 src/pages/Profile.tsx 对齐到
https://app.zeplin.io/project/<pid>/screen/<sid>，路由是 http://localhost:3000/profile
```

agent 会：抓 Zeplin 规格 + 参考图 → 截当前页面建基线、列差异 → 改代码（Tailwind 项目走 theme token）→ 需要时同步素材 → 重新截图比对、迭代 → 输出报告 → 关闭浏览器并清理临时图。

## 底层脚本（一般无需手动调）

skill 内部会调这两个 CLI，你也可以单独跑来调试：

```bash
# 输出归一化的设计规格 JSON + 下载参考图到临时目录
node <skill-dir>/zeplin.js "<screen-url>"

# 导出 exportable 素材 + 输出带内容 hash 的 manifest
node <skill-dir>/assets.js "<screen-url>"
```

两者都读 `ZEPLIN_TOKEN`。`<skill-dir>` 即本目录。

## 范围与边界

- **做**：样式值、布局、文案、静态素材（导出 + 页面级增量接入）。
- **不做**：自动「素材 ↔ 代码元素」映射启发式、多倍图 `srcset` —— 映射有歧义时 agent 会问你。
- **只归一化纯色填充**：渐变 / 图片填充不在规格里（`layers[].fills` 不含），agent 会从参考图里目测处理。
- **素材匹配**以内容 hash 为准：设计师重新导出/压缩过的素材可能 hash 对不上，会被当作「变化」处理。

## 常见问题

- **Zeplin 返回 403 / 读不到** → 权限问题：确认你的账号是该 project 成员（不是 token 格式或付费问题）。
- **链接解析失败** → `zeplin.js` 会打印期望的链接格式（`https://app.zeplin.io/project/<pid>/screen/<sid>`）。
- **页面空白 / 404** → 确认 dev server 在跑、路由正确。
- **`assets.js` 输出 `assets: []`** → 该 screen 没有 exportable 素材，跳过素材步骤即可。
- **字体被改坏** → 设计稿字体常是系统字体（PingFang 等）在 web 上无意义；skill 默认不硬塞，除非项目 `tailwind.config` 里真配了该字体。
