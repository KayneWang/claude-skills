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
```

## License

MIT
