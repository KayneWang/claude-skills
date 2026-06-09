# headless-web-fetch

用 Playwright 的无头 Chromium 抓取 `WebFetch` 处理不了的 JS 渲染页面（X/Twitter、SPA、各类 dashboard）。`WebFetch` 只拿静态 HTML，JS 重的站点返回的是空壳 —— 这个 skill 补上这一块。

> 本文档讲**怎么配置和使用**。`SKILL.md` 是给 agent 看的执行指令，无需手动阅读。

## 能力概览

- **JS 渲染抓取**：用真实浏览器加载页面，拿到 JS 执行后的内容。
- **懒加载支持**：可配置滚动深度，触发无限滚动 / 懒加载内容。
- **规避检测**：自定义 User-Agent，绕过基础的机器人检测。

## 前置配置

无需手动配置 —— **首次运行自动安装** Playwright + Chromium（约 160MB，一次性）。首次调用把 Bash 超时设到 ≥ 120s。

## 怎么用

直接用自然语言触发，给一个 URL 即可。一般在 `WebFetch` 抓不到内容时使用：

```
用 headless-web-fetch 抓一下 <url>
```

## 底层脚本（一般无需手动调）

skill 内部会调这个 CLI，你也可以单独跑来调试：

```bash
# 基础用法（首次运行自动装依赖）
node <skill-dir>/fetch.js <url>

# 带参数
node <skill-dir>/fetch.js <url> --scroll 10 --wait 8000
```

| 参数 | 默认 | 说明 |
|------|------|------|
| `--scroll N` | 5 | 滚动次数，用于加载懒加载内容 |
| `--wait MS` | 5000 | 页面加载后等待 JS 渲染的毫秒数 |

`<skill-dir>` 即本目录。调用时把 Bash 超时设到 ≥ 60s。

## 常见问题

- **首次运行很慢** → 在装 playwright + Chromium，正常现象，把超时设到 ≥ 120s。
- **内容不全** → 调大 `--scroll`（如 X/Twitter 这种无限滚动）。
- **页面没渲染完** → 调大 `--wait`，给慢站点更多 hydrate 时间。
