---
name: headless-web-fetch
description: Use when WebFetch fails to retrieve content from JavaScript-rendered pages (e.g., X/Twitter, SPAs), or when the user asks to fetch a page that requires JS execution to display content
---

# Headless Web Fetch

## Overview

Use Playwright's headless Chromium to fetch content from pages that require JavaScript rendering. WebFetch only retrieves static HTML, so JS-heavy sites (X/Twitter, SPAs, dashboards) return empty shells. This skill solves that.

## When to Use

- WebFetch returned no meaningful content (empty page, login prompts, "enable JavaScript" messages)
- Target URL is a known JS-rendered site (X/Twitter, modern SPAs)
- User explicitly asks to use a headless browser

**When NOT to use:** WebFetch works fine for the target URL. Try WebFetch first.

## Usage

```bash
# Basic usage (dependencies auto-install on first run)
node <skill-dir>/fetch.js <url>

# With options
node <skill-dir>/fetch.js <url> --scroll 10 --wait 8000
```

`<skill-dir>` is the directory where this SKILL.md is located.

| Option | Default | Description |
|--------|---------|-------------|
| `--scroll N` | 5 | Number of scroll iterations for lazy-loaded content |
| `--wait MS` | 5000 | Milliseconds to wait for JS rendering after page load |

Set Bash timeout to ≥ 60s when calling.

## Gotchas

- **First run may be slow** — auto-installs playwright + Chromium (~160MB, one-time). Set Bash timeout to ≥ 120s on first use.
- **Use `domcontentloaded`** — the script already does this. `networkidle` times out on SPAs that keep firing requests.
- **Increase `--scroll` for long content** — sites like X/Twitter use infinite scroll.
- **Increase `--wait` for slow sites** — some pages need more time to hydrate.
