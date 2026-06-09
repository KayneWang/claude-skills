# Claude Skills

一组可复用的 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill，打包成插件，方便团队共享。

## Skills

| Skill | 一句话 | 文档 |
|-------|--------|------|
| **headless-web-fetch** | 用无头 Chromium 抓取 `WebFetch` 处理不了的 JS 渲染页面 | [详情](skills/headless-web-fetch/README.md) |
| **zeplin-sync** | 把组件样式按 Zeplin 设计稿对齐，并通过「渲染 → 截图 → 比对」闭环验证 | [详情](skills/zeplin-sync/README.md) |

## 安装

```bash
# 添加 marketplace
/plugin marketplace add KayneWang/claude-skills

# 安装插件
/plugin install kayne-skills
```

装好后直接用自然语言触发对应 skill，具体用法和前置配置见各 skill 的文档。

## License

MIT
