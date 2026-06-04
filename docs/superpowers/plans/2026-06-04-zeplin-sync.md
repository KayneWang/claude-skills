# zeplin-sync Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `zeplin-sync` skill that reads a Zeplin screen's design spec, lets the agent refactor a target component's code to match it, and verifies via a render→screenshot→compare loop.

**Architecture:** A thin Node CLI (`zeplin.js`) does the deterministic half — parse the screen URL, call the Zeplin REST API, and emit a normalized spec JSON plus a downloaded reference image. `SKILL.md` orchestrates the flexible half — the agent reads the spec + reference image, edits code following existing conventions, then drives the closed loop with the Playwright MCP.

**Tech Stack:** Node 18+ (global `fetch`, zero runtime deps), `node:test` for unit tests, Playwright MCP (provided by the environment) for screenshots.

---

## File Structure

```
skills/zeplin-sync/
  SKILL.md                     # Orchestration instructions (agent-driven loop)
  package.json                 # type:module, test script; no runtime deps
  zeplin.js                    # CLI entry: parse → fetch → normalize → download image → print JSON
  lib/
    parse-url.js               # pure: screen URL → { projectId, screenId, versionId|null }
    color.js                   # pure: rgbaToHex()
    normalize.js               # pure: { screen, version, colors } → normalized spec
    zeplin-api.js              # thin fetch wrappers over api.zeplin.dev + image download
  test/
    parse-url.test.js
    color.test.js
    normalize.test.js
    fixtures/
      screen.raw.json          # recorded real API response (Task 7)
      version.raw.json         # recorded real API response (Task 7)
```

Responsibilities are split so each pure module is unit-testable in isolation; `zeplin-api.js` isolates all network I/O; `zeplin.js` is glue only.

> The repo's `plugin.json` no longer uses a `skills` field (removed in commit `00227b4`); skills are auto-discovered by directory. **No manifest edit is required** — creating `skills/zeplin-sync/` is enough.

---

## Task 1: Scaffold skill directory + package.json

**Files:**
- Create: `skills/zeplin-sync/package.json`

- [ ] **Step 1: Create the package.json**

```json
{
  "name": "zeplin-sync",
  "version": "1.0.0",
  "description": "Read a Zeplin screen spec and align a component's code to it via a render/compare loop",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Verify Node sees it**

Run: `cd skills/zeplin-sync && node --test 2>&1 | head -5`
Expected: runs with "tests 0" (no tests yet) and exit 0, OR a "no test files" message — either confirms the toolchain works.

- [ ] **Step 3: Commit**

```bash
git add skills/zeplin-sync/package.json
git commit -m "feat(zeplin-sync): scaffold skill package"
```

---

## Task 2: URL parser (pure)

**Files:**
- Create: `skills/zeplin-sync/lib/parse-url.js`
- Test: `skills/zeplin-sync/test/parse-url.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScreenUrl } from "../lib/parse-url.js";

test("parses project + screen id", () => {
  const r = parseScreenUrl("https://app.zeplin.io/project/abc123/screen/def456");
  assert.deepEqual(r, { projectId: "abc123", screenId: "def456", versionId: null });
});

test("parses optional version id", () => {
  const r = parseScreenUrl("https://app.zeplin.io/project/abc123/screen/def456/version/v789");
  assert.deepEqual(r, { projectId: "abc123", screenId: "def456", versionId: "v789" });
});

test("ignores query and hash", () => {
  const r = parseScreenUrl("https://app.zeplin.io/project/abc/screen/xyz?foo=1#bar");
  assert.deepEqual(r, { projectId: "abc", screenId: "xyz", versionId: null });
});

test("throws on unrecognized url", () => {
  assert.throws(() => parseScreenUrl("https://app.zeplin.io/project/abc"), /Could not parse/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd skills/zeplin-sync && node --test test/parse-url.test.js`
Expected: FAIL — cannot find module `../lib/parse-url.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/parse-url.js
const RE = /\/project\/([^/]+)\/screen\/([^/?#]+)(?:\/version\/([^/?#]+))?/;

export function parseScreenUrl(url) {
  const m = RE.exec(String(url));
  if (!m) {
    throw new Error(
      `Could not parse Zeplin screen URL: ${url}\n` +
        `Expected form: https://app.zeplin.io/project/<projectId>/screen/<screenId>`
    );
  }
  return { projectId: m[1], screenId: m[2], versionId: m[3] ?? null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd skills/zeplin-sync && node --test test/parse-url.test.js`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add skills/zeplin-sync/lib/parse-url.js skills/zeplin-sync/test/parse-url.test.js
git commit -m "feat(zeplin-sync): parse screen URL into ids"
```

---

## Task 3: Color → hex (pure)

**Files:**
- Create: `skills/zeplin-sync/lib/color.js`
- Test: `skills/zeplin-sync/test/color.test.js`

> Assumption to verify in Task 7: Zeplin encodes `r,g,b` as 0–255 integers and `a` as 0–1 float. If the real API uses 0–1 for r/g/b, adjust `rgbaToHex` and its tests then.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { rgbaToHex } from "../lib/color.js";

test("opaque color → #rrggbb", () => {
  assert.equal(rgbaToHex({ r: 255, g: 0, b: 128, a: 1 }), "#ff0080");
});

test("missing alpha treated as opaque", () => {
  assert.equal(rgbaToHex({ r: 0, g: 0, b: 0 }), "#000000");
});

test("partial alpha → #rrggbbaa", () => {
  assert.equal(rgbaToHex({ r: 16, g: 32, b: 48, a: 0.5 }), "#10203080");
});

test("rounds fractional channels", () => {
  assert.equal(rgbaToHex({ r: 254.6, g: 0.4, b: 127.5, a: 1 }), "#ff0080");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd skills/zeplin-sync && node --test test/color.test.js`
Expected: FAIL — cannot find module `../lib/color.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/color.js
const to2 = (n) => Math.round(n).toString(16).padStart(2, "0");

export function rgbaToHex({ r, g, b, a = 1 }) {
  const base = `#${to2(r)}${to2(g)}${to2(b)}`;
  return a < 1 ? `${base}${to2(a * 255)}` : base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd skills/zeplin-sync && node --test test/color.test.js`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add skills/zeplin-sync/lib/color.js skills/zeplin-sync/test/color.test.js
git commit -m "feat(zeplin-sync): rgba to hex conversion"
```

---

## Task 4: Spec normalization (pure)

**Files:**
- Create: `skills/zeplin-sync/lib/normalize.js`
- Test: `skills/zeplin-sync/test/normalize.test.js`

This turns raw `screen` + `version` + project `colors` into the flat spec the agent consumes. Layers are flattened (depth-first) so text/shape leaves are easy to scan. Each fill color is mapped to a named token when it matches the project palette.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { flattenLayers, normalize } from "../lib/normalize.js";

test("flattenLayers walks nested groups depth-first", () => {
  const tree = [
    { id: "g", type: "group", layers: [{ id: "a", type: "text" }, { id: "b", type: "shape" }] },
    { id: "c", type: "text" },
  ];
  assert.deepEqual(flattenLayers(tree).map((l) => l.id), ["g", "a", "b", "c"]);
});

test("normalize builds screen meta, tokens, and flat layers", () => {
  const screen = { name: "Login", image: { width: 375, height: 812, originalUrl: "https://img/x.png" } };
  const colors = [{ name: "primary", r: 0, g: 122, b: 255, a: 1 }];
  const version = {
    layers: [
      {
        id: "title",
        type: "text",
        name: "Title",
        rect: { x: 16, y: 40, width: 200, height: 28 },
        content: "Welcome",
        fills: [{ type: "color", color: { r: 0, g: 0, b: 0, a: 1 } }],
        textStyles: [{ style: { fontFamily: "Inter", fontSize: 24, fontWeight: 600, lineHeight: 28, letterSpacing: 0, color: { r: 0, g: 0, b: 0, a: 1 } } }],
        borderRadius: 0,
      },
      {
        id: "cta",
        type: "shape",
        name: "Button",
        rect: { x: 16, y: 700, width: 343, height: 48 },
        fills: [{ type: "color", color: { r: 0, g: 122, b: 255, a: 1 } }],
        borderRadius: 8,
      },
    ],
  };

  const spec = normalize({ screen, version, colors });

  assert.deepEqual(spec.screen, { name: "Login", width: 375, height: 812 });
  assert.deepEqual(spec.tokens.colors, { primary: "#007aff" });

  assert.deepEqual(spec.layers[0], {
    id: "title",
    type: "text",
    name: "Title",
    rect: { x: 16, y: 40, width: 200, height: 28 },
    borderRadius: 0,
    content: "Welcome",
    fills: [{ hex: "#000000", token: null }],
    textStyle: {
      fontFamily: "Inter",
      fontSize: 24,
      fontWeight: 600,
      lineHeight: 28,
      letterSpacing: 0,
      color: "#000000",
    },
  });

  assert.deepEqual(spec.layers[1].fills, [{ hex: "#007aff", token: "primary" }]);
  assert.equal(spec.layers[1].textStyle, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd skills/zeplin-sync && node --test test/normalize.test.js`
Expected: FAIL — cannot find module `../lib/normalize.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/normalize.js
import { rgbaToHex } from "./color.js";

export function flattenLayers(layers = [], acc = []) {
  for (const layer of layers) {
    acc.push(layer);
    if (layer.layers?.length) flattenLayers(layer.layers, acc);
  }
  return acc;
}

function normalizeFills(fills = [], tokenByHex) {
  return fills
    .filter((f) => f.type === "color" && f.color)
    .map((f) => {
      const hex = rgbaToHex(f.color);
      return { hex, token: tokenByHex.get(hex) ?? null };
    });
}

function normalizeTextStyle(layer) {
  const style = layer.textStyles?.[0]?.style;
  if (!style) return null;
  return {
    fontFamily: style.fontFamily ?? null,
    fontSize: style.fontSize ?? null,
    fontWeight: style.fontWeight ?? null,
    lineHeight: style.lineHeight ?? null,
    letterSpacing: style.letterSpacing ?? null,
    color: style.color ? rgbaToHex(style.color) : null,
  };
}

export function normalize({ screen, version, colors = [] }) {
  const tokenByHex = new Map();
  const tokenColors = {};
  for (const c of colors) {
    const hex = rgbaToHex(c);
    tokenByHex.set(hex, c.name);
    tokenColors[c.name] = hex;
  }

  const layers = flattenLayers(version.layers).map((l) => ({
    id: l.id,
    type: l.type,
    name: l.name ?? null,
    rect: {
      x: l.rect?.x,
      y: l.rect?.y,
      width: l.rect?.width,
      height: l.rect?.height,
    },
    borderRadius: l.borderRadius ?? 0,
    content: l.content ?? null,
    fills: normalizeFills(l.fills, tokenByHex),
    textStyle: normalizeTextStyle(l),
  }));

  return {
    screen: { name: screen.name, width: screen.image?.width, height: screen.image?.height },
    tokens: { colors: tokenColors },
    layers,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd skills/zeplin-sync && node --test test/normalize.test.js`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add skills/zeplin-sync/lib/normalize.js skills/zeplin-sync/test/normalize.test.js
git commit -m "feat(zeplin-sync): normalize screen spec"
```

---

## Task 5: Zeplin API client (network I/O)

**Files:**
- Create: `skills/zeplin-sync/lib/zeplin-api.js`

No unit test (pure network glue); it is exercised by the smoke run in Task 7. Keep it dependency-free using global `fetch`.

- [ ] **Step 1: Write the client**

```js
// lib/zeplin-api.js
import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://api.zeplin.dev/v1";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function getJson(url, token) {
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zeplin API ${res.status} ${res.statusText} for ${url}\n${body.slice(0, 500)}`);
  }
  return res.json();
}

export function getScreen(token, projectId, screenId) {
  return getJson(`${BASE}/projects/${projectId}/screens/${screenId}`, token);
}

export function getScreenVersion(token, projectId, screenId, versionId) {
  const v = versionId ?? "latest";
  return getJson(`${BASE}/projects/${projectId}/screens/${screenId}/versions/${v}`, token);
}

export function getProjectColors(token, projectId) {
  return getJson(`${BASE}/projects/${projectId}/colors`, token);
}

export async function downloadImage(url, screenId) {
  const dir = join(tmpdir(), "zeplin-sync");
  await mkdir(dir, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download reference image: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = join(dir, `${screenId}.png`);
  await writeFile(path, buf);
  return path;
}
```

- [ ] **Step 2: Verify it imports cleanly**

Run: `cd skills/zeplin-sync && node -e "import('./lib/zeplin-api.js').then(m => console.log(Object.keys(m)))"`
Expected: prints `[ 'getScreen', 'getScreenVersion', 'getProjectColors', 'downloadImage' ]`

- [ ] **Step 3: Commit**

```bash
git add skills/zeplin-sync/lib/zeplin-api.js
git commit -m "feat(zeplin-sync): zeplin REST api client"
```

---

## Task 6: CLI entry (`zeplin.js`)

**Files:**
- Create: `skills/zeplin-sync/zeplin.js`

- [ ] **Step 1: Write the CLI**

```js
// zeplin.js
import { parseScreenUrl } from "./lib/parse-url.js";
import { normalize } from "./lib/normalize.js";
import { getScreen, getScreenVersion, getProjectColors, downloadImage } from "./lib/zeplin-api.js";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: node zeplin.js <zeplin-screen-url>");
    process.exit(2);
  }
  const token = process.env.ZEPLIN_TOKEN;
  if (!token) {
    console.error(
      "ZEPLIN_TOKEN is not set.\n" +
        "Create one at Zeplin web → Profile → Developer → Create new token, then:\n" +
        "  export ZEPLIN_TOKEN=<your token>"
    );
    process.exit(2);
  }

  const { projectId, screenId, versionId } = parseScreenUrl(url);
  const [screen, version, colorsResp] = await Promise.all([
    getScreen(token, projectId, screenId),
    getScreenVersion(token, projectId, screenId, versionId),
    getProjectColors(token, projectId).catch(() => []),
  ]);

  const colors = Array.isArray(colorsResp) ? colorsResp : colorsResp.colors ?? [];
  const spec = normalize({ screen, version, colors });

  const imageUrl = screen.image?.originalUrl ?? screen.image?.original_url;
  spec.referenceImage = imageUrl ? await downloadImage(imageUrl, screenId) : null;

  console.log(JSON.stringify(spec, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Verify missing-token guard**

Run: `cd skills/zeplin-sync && env -u ZEPLIN_TOKEN node zeplin.js "https://app.zeplin.io/project/a/screen/b"`
Expected: prints the ZEPLIN_TOKEN guidance and exits non-zero.

- [ ] **Step 3: Verify missing-arg guard**

Run: `cd skills/zeplin-sync && node zeplin.js`
Expected: prints "Usage: node zeplin.js <zeplin-screen-url>" and exits non-zero.

- [ ] **Step 4: Commit**

```bash
git add skills/zeplin-sync/zeplin.js
git commit -m "feat(zeplin-sync): cli entry wiring"
```

---

## Task 7: Calibrate against the real API (record fixtures)

This is a **manual reconciliation** task: confirm real field names/casing match the assumptions in Tasks 3–6, since the live REST API casing was not verifiable from docs at plan time.

**Files:**
- Create: `skills/zeplin-sync/test/fixtures/screen.raw.json`
- Create: `skills/zeplin-sync/test/fixtures/version.raw.json`
- Possibly modify: `lib/normalize.js`, `lib/color.js`, `zeplin.js`

- [ ] **Step 1: Record a real screen + version response**

Run (substitute a real screen URL you have access to):
```bash
cd skills/zeplin-sync
export ZEPLIN_TOKEN=<token>
PID=<projectId>; SID=<screenId>
curl -s -H "Authorization: Bearer $ZEPLIN_TOKEN" \
  "https://api.zeplin.dev/v1/projects/$PID/screens/$SID" > test/fixtures/screen.raw.json
curl -s -H "Authorization: Bearer $ZEPLIN_TOKEN" \
  "https://api.zeplin.dev/v1/projects/$PID/screens/$SID/versions/latest" > test/fixtures/version.raw.json
```
Expected: two JSON files with real data.

- [ ] **Step 2: Verify field-name assumptions**

Read both fixtures and confirm:
- `screen.image.width/height/originalUrl` exist (note exact casing of the image URL field).
- A layer has `rect.{x,y,width,height}`, `fills[].color.{r,g,b,a}`, `borderRadius`, `content`, `textStyles[].style.{fontFamily,fontSize,...}`.
- The numeric range of `r,g,b` (0–255 vs 0–1) and `a` (0–1).

If any name/casing/range differs, update `lib/normalize.js` / `lib/color.js` / the `imageUrl` line in `zeplin.js` accordingly, and adjust the affected unit tests so they still encode the real shape.

- [ ] **Step 3: Run the full unit suite**

Run: `cd skills/zeplin-sync && node --test`
Expected: PASS — all parse-url, color, normalize tests green.

- [ ] **Step 4: Smoke-run the CLI end to end**

Run: `cd skills/zeplin-sync && node zeplin.js "<real screen url>" | head -40`
Expected: prints normalized spec JSON with non-empty `layers` and a `referenceImage` path under the temp dir; confirm the PNG exists and opens.

- [ ] **Step 5: Commit**

```bash
git add skills/zeplin-sync/test/fixtures skills/zeplin-sync/lib skills/zeplin-sync/zeplin.js skills/zeplin-sync/test
git commit -m "test(zeplin-sync): calibrate normalization against real API fixtures"
```

---

## Task 8: Author SKILL.md

**Files:**
- Create: `skills/zeplin-sync/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

````markdown
---
name: zeplin-sync
description: Use when the user wants to align or refactor a component's styling to match a Zeplin design — e.g. "把这个组件 sync 到 Zeplin 设计稿", "按设计稿对齐样式", "match this page to the Zeplin screen". Reads the Zeplin spec, edits the code, and verifies via a render/screenshot/compare loop.
---

# zeplin-sync

Align a single component/page's code to one Zeplin screen, verified by rendering and comparing against the design reference image.

## Prerequisites (check first, stop if missing)

1. `ZEPLIN_TOKEN` is set in the environment. If not: tell the user to create one at Zeplin web → Profile → Developer → Create new token, then `export ZEPLIN_TOKEN=<token>`.
2. The **Playwright MCP** is available (tools prefixed `browser_*`). If not, tell the user to enable it.
3. The project's **dev server is already running**. Ask the user for the **route/URL** of the component if not provided.
4. A **target code file**. If not provided, locate it from the route before editing.

## Inputs

- A Zeplin **screen URL** (required).
- The **route/URL** where the component renders on the running dev server (required).
- The **target code file** (optional — locate it if omitted).

## Procedure

1. **Fetch the design spec.** Run:
   `node <skill-dir>/zeplin.js "<screen-url>"`
   Parse the printed JSON: `screen`, `tokens`, `layers`, `referenceImage`.
   Read `referenceImage` with the Read tool so you can see the design.

2. **Establish the baseline.** Use the Playwright MCP to navigate to the route (`browser_navigate`) and screenshot it (`browser_take_screenshot`). Read the screenshot. Compare it to the reference image and the spec, and write a TodoWrite checklist of every discrepancy across three categories:
   - **Visual style values** — colors, padding/margin, font size/weight/line-height, border-radius, borders, shadows (use exact values from `layers[].fills/textStyle/rect/borderRadius`).
   - **Layout structure** — flex/grid arrangement, alignment, order.
   - **Copy** — text content (from `layers[].content`).

3. **Edit the code.** First detect the project's styling convention (Tailwind / CSS Modules / styled-components / plain CSS) by reading the target file and its neighbors. Apply changes using the spec's exact values, and **prefer existing design tokens/variables** in the codebase (and the `tokens.colors` names from the spec) over hardcoded values.

4. **Re-render and verify.** Re-navigate and re-screenshot. Compare against the reference image and tick off checklist items.

5. **Iterate** at most **3 rounds** (more only if the user asks). Stop when aligned or no longer improving.

6. **Report.** Summarize what changed, any residual differences, and items needing a human decision (out-of-scope asset/icon mismatches, ambiguous screen↔component mapping).

## Scope (v1)

In scope: visual style values, layout structure, copy. **Out of scope:** exporting/wiring icons or image assets — report these as residual items rather than attempting them.

## Errors

- Zeplin `403` / not-a-member → a permissions issue (the user must be a member of the project); not a token-format problem.
- URL parse failure → `zeplin.js` prints the expected URL form.
- Route blank/404 → confirm the dev server is running and the route is correct.
- Can't confidently map the screen to a component → ask the user instead of guessing.
````

- [ ] **Step 2: Verify the skill is discoverable**

Run: `ls skills/zeplin-sync/SKILL.md && head -4 skills/zeplin-sync/SKILL.md`
Expected: file exists; frontmatter shows `name: zeplin-sync`.

- [ ] **Step 3: Commit**

```bash
git add skills/zeplin-sync/SKILL.md
git commit -m "feat(zeplin-sync): add skill orchestration instructions"
```

---

## Task 9: End-to-end verification (manual)

- [ ] **Step 1: Pick a real target**

Choose a real Zeplin screen you can access and a component on your running dev server that is intentionally off-spec (or a freshly vibe-coded one).

- [ ] **Step 2: Run the skill**

In a Claude Code session: ask to "sync <component> to <zeplin screen url>, route <url>". Confirm the agent:
- runs `zeplin.js` and reads the reference image,
- screenshots the baseline and builds a discrepancy checklist,
- edits code and iterates,
- ends with a final screenshot visibly matching the reference and a residual-diff report.

- [ ] **Step 3: Record result**

If gaps appear (e.g., the loop misreads a value, or a styling convention isn't handled), note them for a follow-up iteration of `SKILL.md`. No code commit unless SKILL.md needs adjustment.

---

## Self-Review (completed)

- **Spec coverage:** data source (Task 5/6), normalized spec output incl. tokens (Task 4), reference image download (Task 5/6), URL contract (Task 2), render/compare loop + 3-round cap + Playwright MCP + dev-server reuse (Task 8), scope = style/layout/copy and asset exclusion (Task 8), error handling (Task 6 token guard, Task 8 table), verification (unit Tasks 2–4, e2e Task 9). All spec sections map to a task.
- **Placeholder scan:** none — every code step shows complete code; Task 7/9 manual steps use real commands with `<...>` standing only for the user's own token/ids.
- **Type consistency:** `parseScreenUrl` → `{projectId, screenId, versionId}` consumed in Task 6; `rgbaToHex` signature matches Task 4 usage; `normalize({screen, version, colors})` return shape (`screen/tokens/layers` + `referenceImage` added in Task 6) matches what SKILL.md Task 8 reads; api client export names match Task 6 imports.
