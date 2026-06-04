# zeplin-sync — 设计稿对齐 Skill 设计

> 状态：已通过 brainstorming 验证，待实现
> 日期：2026-06-04

## 背景与目标

通过 vibe 方式可以快速生成 MVP 级别的前端代码，但样式通常仍需按设计稿重构。
本 skill 让用户把 **Zeplin 设计稿链接** 和 **对应的代码文件** 交给 agent，agent
自动读取设计规格、修改代码，并通过「渲染—截图—比对」闭环验证改对了。

服务两种时机（底层是同一套闭环，区别只是范围）：

- **首次对齐**：vibe 出的 MVP 代码，样式偏差大，整体对齐到设计稿。
- **增量同步**：代码已基本一致，设计师改了几处，对齐改动部分。

## 核心决策（brainstorming 结论）

| 维度 | 决策 |
| --- | --- |
| 数据源 | Zeplin REST API（用户已持有 personal access token） |
| 比对方式 | 渲染闭环：读规格 → 改代码 → 渲染截图 → 跟设计参考图比对 → 迭代 |
| 使用时机 | 首次对齐 + 增量同步，复用同一闭环 |
| 输入契约 | 单 Zeplin screen 链接 + 目标代码文件（可缺省，agent 帮定位）。1:1 为核心原语 |
| 渲染方式 | 复用用户已跑的 dev server，调用时给路由/URL |
| 对齐范围 | 视觉样式值 + 布局结构 + 文案内容（**不含**切图/资源导出，留作后续增强） |
| 实现架构 | 方案 A：薄脚本（Zeplin 抽取）+ agent 编排闭环 |
| 迭代上限 | 默认 3 轮，可在调用时临时调高 |
| 截图工具 | 复用环境中已有的 Playwright MCP（非自带脚本） |

显式排除（YAGNI / v1 范围外）：

- 切图/icon/图片资源的导出与接入。
- 多屏自动映射、config 映射清单等编排层（核心闭环跑稳后再加薄封装）。
- 重脚本 diff 引擎（从实时 DOM 抽 computed CSS 做数值 diff）—— DOM↔图层映射脆弱，过度设计。

## 架构

```
skills/zeplin-sync/
  SKILL.md        # 编排闭环的指令（灵活那一半）
  zeplin.js       # 运行时：抓 Zeplin 规格 + 下载设计参考图（确定性那一半）
  package.json    # 依赖（Node 18+ 自带 fetch，力求零运行时依赖）
```

> 注：仓库 `plugin.json` 不再用 `skills` 字段（commit `00227b4` 已移除），
> skill 靠目录约定自动发现。**新增 skill 只建目录即可，无需改 manifest。**

数据流：

```
用户给: screen链接 + 路由 + (可选)代码文件
        │
        ▼
  zeplin.js ──► 规格JSON(尺寸/颜色/文字样式/图层/文案/token) + 本地参考图.png
        │
        ▼
  agent: 读规格 + 读参考图 + 读代码
        │
        ▼
  ┌──► 改代码(按现有样式约定, 用精确值, 优先复用已有token) ──┐
  │                                                          │
  │    Playwright MCP 导航dev server路由 → 截图              │
  │                  → 跟参考图视觉比对                       │
  └──── 不一致 (≤3轮) ◄──────────────────────────────────────┘
        │
        ▼
  报告: 改了什么 / 残留差异 / 需人决策项
```

## 组件设计

### 1. `zeplin.js`（确定性抽取）

**调用**：`node skills/zeplin-sync/zeplin.js <screen链接>`
**鉴权**：环境变量 `ZEPLIN_TOKEN`（Zeplin Web 端 Profile → Developer → Create new token）

**职责**：

1. 从链接解析 `projectId` + `screenId`，兼容 `app.zeplin.io/project/{projectId}/screen/{screenId}`
   及带 `version` 等变体。
2. 调 Zeplin REST API（base `https://api.zeplin.dev/v1`）：
   - screen 基本信息：名字、尺寸、最新 version id、设计参考图 URL。
   - 最新 version 图层树：每层 `rect`(x/y/宽/高)、填充色、边框、圆角、阴影、
     文字样式(字体/字号/字重/行高/字间距/颜色)、文案 `content`。
   - project 色板 + 文字样式 token（把死值映射回 token 名）。
3. 下载设计参考图到本地临时路径（如 `/tmp/zeplin-sync/<screenId>.png`）。
4. 向 stdout 输出归一化 JSON：

```json
{
  "screen":   { "name": "...", "width": 0, "height": 0, "densityScale": 1 },
  "referenceImage": "/tmp/zeplin-sync/<screenId>.png",
  "tokens":   { "colors": { "name": "#hex" }, "textStyles": [ ] },
  "layers":   [ { "name": "", "type": "", "rect": {}, "fills": [], "border": {},
                 "borderRadius": 0, "shadows": [], "textStyle": {}, "content": "" } ]
}
```

设计原则：脚本只做确定性抓取与归一化，**不做任何代码判断**。Node 18+ 用全局
`fetch`，力求零依赖；若需依赖则首次运行自动安装（沿用 `headless-web-fetch` 套路）。

### 2. `SKILL.md`（agent 编排闭环）

触发（frontmatter `description`）：用户表达「按 Zeplin 设计稿对齐/重构样式」「把这个
组件 sync 到设计稿」等意图。

执行步骤：

1. **前置检查**：`ZEPLIN_TOKEN` 已设置；**Playwright MCP 可用**；dev server 已在跑
   （问用户该组件路由/URL）；目标代码文件（缺省则按路由定位）。
2. **抓设计**：跑 `zeplin.js` → 规格 JSON + 参考图路径；用 Read 把参考图作为图像读入。
3. **建基线**：Playwright MCP 导航到路由，截当前状态读入，与参考图对比，把差异
   （样式值 / 布局 / 文案）列成 TodoWrite 清单。
4. **改代码**：识别项目现有样式约定（Tailwind / CSS Modules / styled-components…），
   用规格 JSON 的精确值逐项改，**优先复用代码里已有的设计 token/变量**而非写死。
5. **重渲染验证**：重新截图与参考图比对，逐项勾掉清单。
6. **迭代**：未对齐回到第 4 步，**最多 3 轮**（可临时调高），收敛或不再改善即停。
7. **报告**：总结改动、残留差异、需人决策项（如范围外的切图差异、映射歧义）。

## 错误处理

| 情况 | 处理 |
| --- | --- |
| `ZEPLIN_TOKEN` 缺失/失效 | 指引去 Web 端 Developer 页生成并设置环境变量 |
| 403 / 非项目成员 | 权限问题（非付费、非 skill 问题），提示用户确认在该 project 内 |
| 链接解析失败 | 打印期望的链接格式 |
| Playwright MCP 不可用 | 提示安装/启用 Playwright MCP |
| 路由打不开/空白 | 让用户确认 dev server 在跑、路由正确 |
| screen↔组件 映射没把握 | 直接问用户，不硬猜 |
| 范围外差异（icon/图片） | 报告但不处理（v1 不做切图导出） |

## 验证策略

- **脚本单测**：`zeplin.js` 的链接解析 + 一份录制的 API 响应 → 归一化 JSON 快照。
- **端到端手测**：取一个真实 Zeplin screen + 一个故意改歪的组件，跑 skill，确认能
  收敛、最终截图与参考图一致。

## 后续增强（不在 v1）

- 切图/资源导出与接入。
- 多屏批量：自动映射或 config 映射清单（核心闭环之上的薄编排层）。
- 增量同步利用 Zeplin version 历史做设计 diff，精确缩小改动范围。
