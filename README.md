# Claude Skills

A collection of reusable [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skills, packaged as a plugin for team sharing.

## Skills

### spec-interview

Before implementing any significant feature, interview the user using `AskUserQuestion` to clarify requirements, then generate a structured spec document. Implementation happens in a separate session.

**Workflow:** Explore existing code → Interview user (2-4 rounds) → Generate spec → Save to `specs/` → Stop

Inspired by [this approach](https://x.com/trq212/status/2005315275026260309) from the Claude Code team.

### headless-web-fetch

Use Playwright's headless Chromium to fetch content from JavaScript-rendered pages (X/Twitter, SPAs, dashboards) that `WebFetch` can't handle.

**Features:**
- Auto-installs Playwright + Chromium on first run
- Configurable scroll depth and wait time for lazy-loaded content
- Custom User-Agent to avoid bot detection

### zeplin-sync

Align a component's styling to a Zeplin design. Given a Zeplin screen URL and the target code file, it reads the design spec, edits the code, and verifies the result with a render → screenshot → compare loop.

**Workflow:** Fetch Zeplin spec + reference image (`zeplin.js`) → screenshot the running component (Playwright MCP) → list discrepancies → edit code → re-render and compare → iterate (≤3 rounds) → report

**Aligns:** visual style values (colors, spacing, typography, radius), layout structure, and copy. Asset/icon export is out of scope.

**Requirements:**
- `ZEPLIN_TOKEN` env var (Zeplin web → Profile → Developer → Create new token)
- The Playwright MCP enabled (for screenshots)
- The project's dev server already running, plus the component's route/URL

## Installation

```bash
# Add marketplace
/plugin marketplace add KayneWang/claude-skills

# Install plugin
/plugin install kayne-skills
```

## Usage

```bash
# Interview user to generate a feature spec
/spec-interview

# Fetch JS-rendered page content
/headless-web-fetch

# Align a component to its Zeplin design
# e.g. "用 zeplin-sync 把 <组件> 对齐到 <Zeplin screen 链接>，路由是 <url>"
/zeplin-sync
```

## License

MIT
