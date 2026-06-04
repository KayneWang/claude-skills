# Claude Skills

一组可复用的 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill，打包成插件，方便团队共享。

## Skills

### spec-interview

在实现任何重要功能之前，先用 `AskUserQuestion` 与用户多轮访谈、厘清需求，然后生成结构化的 spec 文档。实现放到单独的会话里进行。

**流程：** 探索现有代码 → 访谈用户（2-4 轮）→ 生成 spec → 保存到 `specs/` → 结束

灵感来自 Claude Code 团队的[这个思路](https://x.com/trq212/status/2005315275026260309)。

### headless-web-fetch

用 Playwright 的无头 Chromium 抓取 `WebFetch` 处理不了的 JS 渲染页面（X/Twitter、SPA、各类 dashboard）。

**特性：**
- 首次运行自动安装 Playwright + Chromium
- 可配置滚动深度和等待时间，加载懒加载内容
- 自定义 User-Agent，规避机器人检测

### zeplin-sync

把组件样式对齐到 Zeplin 设计稿。给定 Zeplin screen 链接和目标代码文件，它会读取设计规格、修改代码，并通过「渲染 → 截图 → 比对」闭环验证结果。

**流程：** 抓取 Zeplin 规格 + 参考图（`zeplin.js`）→ 截图运行中的组件（Playwright MCP）→ 列出差异 → 修改代码 → 重新渲染比对 → 迭代（≤3 轮）→ 输出报告

**对齐范围：** 视觉样式值（颜色、间距、字体、圆角）、布局结构、文案内容。切图/资源导出暂不在范围内。

**前置要求：**
- `ZEPLIN_TOKEN` 环境变量（Zeplin 网页端 → Profile → Developer → Create new token）
- 启用 Playwright MCP（用于截图）
- 项目 dev server 已在运行，并提供组件的路由/URL

## 安装

```bash
# 添加 marketplace
/plugin marketplace add KayneWang/claude-skills

# 安装插件
/plugin install kayne-skills
```

## 使用

```bash
# 访谈用户、生成功能 spec
/spec-interview

# 抓取 JS 渲染的页面内容
/headless-web-fetch

# 把组件对齐到 Zeplin 设计稿
# 例如：“用 zeplin-sync 把 <组件> 对齐到 <Zeplin screen 链接>，路由是 <url>”
/zeplin-sync
```

## License

MIT
