# 在 Codex 里使用这些 skill

**Codex 原生支持 SKILL.md。** [Codex CLI 支持开放的 agent skills 标准](https://developers.openai.com/codex/skills)——`SKILL.md` 的 frontmatter 用 `name` + `description`,靠 `description` **隐式触发**(任务匹配时自动加载),也可 `/skills` 或 `$skill-name` **显式调用**。这和 Claude Code 的机制一致。

**本仓库这两个 skill 的 `SKILL.md` 已经直接兼容**(frontmatter 就是 `name` + `description`),不需要改写、不需要 AGENTS.md 片段。适配 = **把 skill 目录 symlink 进 Codex 的 skills 目录**,跟本仓库 CLAUDE.md 里现有的 `~/.claude/skills/` 软链做法完全对称。

## 安装(symlink,和 `~/.claude/skills` 一个套路)

把 `<REPO>` 换成你这份 clone 的实际路径:

```bash
# 个人级(全局可用)。官方文档路径是 ~/.agents/skills;
# 若你的 Codex 版本不识别,改用 ~/.codex/skills(见下方「路径自检」)。
mkdir -p ~/.agents/skills
ln -s <REPO>/skills/headless-web-fetch ~/.agents/skills/headless-web-fetch
ln -s <REPO>/skills/zeplin-sync         ~/.agents/skills/zeplin-sync
```

或**项目级**(只在某个 repo 内生效,两个来源一致推荐的路径):

```bash
mkdir -p <你的项目>/.agents/skills
ln -s <REPO>/skills/zeplin-sync <你的项目>/.agents/skills/zeplin-sync
```

> **软链指向本仓库工作树**——别 `move`/删本仓库,否则链接失效(和 `~/.claude/skills` 同一个注意事项)。

### 路径自检

个人级目录路径各来源有出入:[OpenAI 官方](https://developers.openai.com/codex/skills)写 `~/.agents/skills`,部分第三方指南写 `~/.codex/skills`。装完后开 Codex 敲 **`/skills`**,看两个 skill 有没有列出来:

- 列出来了 → 路径对,完事。
- 没列出来 → 换另一个目录再软链一次,或两个都做。

## 怎么触发

- **隐式**:直接用自然语言描述任务(如「把这个组件按 Zeplin 设计稿对齐」),Codex 按 `description` 自动选中。
- **显式**:`/skills` 列表里选,或 prompt 里用 `$zeplin-sync` 指名。
- (可选)想要 `/简短名` 这种斜杠触发,可在 SKILL.md frontmatter 加一行 `command: <名>`;不加也能隐式触发,本仓库默认没加。

## 运行时脚本

两个 skill 的 `SKILL.md` 用 `<skill-dir>/xxx.js` 引用脚本,`<skill-dir>` 就是 skill 所在目录(即软链目标)。Codex 在 shell 里 `node <skill-dir>/fetch.js <url>` 即可,**无需额外配置或环境变量**。

- **headless-web-fetch**:纯 Node 脚本,零障碍。首次跑自动装 Playwright + Chromium(约 160MB),给命令 ≥120s 超时。
- **zeplin-sync**:还依赖 Playwright MCP + 看图,见下。

## zeplin-sync 的额外注意点

`zeplin-sync/SKILL.md` 按 Claude Code 写,以下几处在 Codex 下要留意:

1. **Playwright MCP 要先配**(skill 里的 `browser_*` 工具)。编辑 `~/.codex/config.toml`:
   ```toml
   [mcp_servers.playwright]
   command = "npx"
   args = ["@playwright/mcp@latest"]
   ```
   配好后 `browser_navigate` / `browser_resize` / `browser_take_screenshot` / `browser_snapshot` / `browser_close` 等与 Claude Code 同名可用。
   (也可在 skill 目录放 `agents/openai.yaml` 用 `dependencies.tools` 声明该 MCP 依赖,但 MCP server 本身仍需在 Codex 配置里注册。)
2. **`ZEPLIN_TOKEN`** 环境变量要 `export`(Zeplin web → Profile → Developer → Create new token)。
3. **TodoWrite**:Codex 没有这个工具,skill 里「写 TodoWrite 差异清单」改用 Codex 自己的计划/清单机制即可,不影响流程。
4. **看图能力**:skill 的「渲染 → 截图 → 肉眼比对」闭环,在 Claude Code 里靠把截图读进模型来比。Codex 对「看自己刚截的图」支持视版本而定——稳妥做法:**以 `node zeplin.js` 输出的 spec 精确数值(颜色/字号/间距/圆角/阴影)驱动改样式 + `browser_snapshot` 核对结构与文案**,像素级视觉差异让用户肉眼把关。

---

## 来源

- [Agent Skills — Codex | OpenAI Developers](https://developers.openai.com/codex/skills)(权威:目录路径、frontmatter、隐式/显式触发)
- [How to Set Up OpenAI Codex (2026): AGENTS.md, MCP Servers, Skills, Config — llmx.tech](https://llmx.tech/blog/openai-codex-setup-agents-md-mcps-skills-definitive-guide/)(项目级 `.agents/skills/`、用户级 `~/.codex/skills/` 的说法)
- [Codex CLI Skills: Install & Use SKILL.md (2026 Guide) — Agensi](https://www.agensi.io/learn/codex-cli-skills-install-skill-md)(跨 Claude Code / Codex / Cursor 可移植)
