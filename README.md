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

## 在 Codex 里用

Codex 原生支持 `SKILL.md`（开放 agent skills 标准），本仓库的 skill 直接兼容——把 skill 目录 symlink 进 Codex 的 skills 目录即可，和 `~/.claude/skills` 一个套路。详见 [codex/](codex/README.md)。

## License

MIT
