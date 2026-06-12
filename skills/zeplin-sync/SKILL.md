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
- The **design scale factor** (optional — e.g. "设计稿是 2 倍图" / "the mockup is 2x" / "1x"). When given, use it as-is for all px conversion; only infer it yourself (step 1 heuristic) when the user didn't specify.

## Procedure

1. **Fetch the design spec.** Run:
   `node <skill-dir>/zeplin.js "<screen-url>"`
   Parse the printed JSON: `screen`, `tokens`, `annotations`, `layers`, `referenceImage`. Each layer may also carry `componentName` (marks a reusable component instance — prefer the existing codebase component over restyling), `shadows`, `borders`, per-range `textStyles`, and `sourceId`.
   Read `referenceImage` with the Read tool so you can see the design.

   **How to read the spec — coordinates and scale:**
   - `layers[].rect.x/y` are **relative to the parent layer**; `rect.absolute.x/y` is the position **within the screen**. For layout work (positions, alignment, column widths) use `absolute`; use relative x/y only for offsets inside a known parent (e.g. text inset within a card).
   - All values (rects, font sizes) are in the design's coordinate space: `screen.width` × `screen.height`. **Before writing any CSS value, decide the scale factor.** If the user specified one (see Inputs), use it — don't second-guess it. Otherwise infer by matching `screen.width` against mainstream **1x logical viewport widths** (CSS px):
     - mobile: 320, 360, 375, 390, 393, 412, 414, 428, 430 · tablet: 768, 810, 820, 834, 1024 · desktop: 1280, 1366, 1440, 1536, 1600, 1728, 1920
     - `screen.width` itself matches (±2px) → **1x**. `screen.width ÷ 2` matches → **2x** (750→375, 2560→1280, 2880→1440). `screen.width ÷ 3` matches → **3x** (1125→375, 1179→393, 1290→430).
     - Multiple interpretations match (e.g. 1536 = 1x desktop or 2x tablet), or none do → tie-break with `screen.densityScale` and a text sanity check: pick the factor that lands body text in the 14–18px range; if still ambiguous, state the candidates and ask the user.
     Apply the factor to **every** px value (a 40px font in a 2x design is 20px CSS).
   - `layers[].shadows` map by layer type: on a `text` layer → CSS `text-shadow`; on shape/group layers → `box-shadow` (`type: "inner"` → `inset`). Don't drop text shadows — overlay titles usually depend on them for contrast.
   - `layers[].fills` may contain gradients (`{ gradient: { type, stops } }`) — render them as CSS gradients (e.g. card scrims behind overlay text). The stop order runs along the gradient axis; infer the direction from the `referenceImage`.

2. **Establish the baseline.** Use the Playwright MCP to navigate to the route (`browser_navigate`) and **size the viewport for a like-for-like comparison** (`browser_resize`): set the viewport width to the design's logical width (`screen.width` ÷ the scale factor from step 1, e.g. 2560 → 1280) so screenshots and the reference image are at the same scale — otherwise font-size and spacing errors are invisible in the comparison. Then screenshot (`browser_take_screenshot`). **Keep track of the file path each screenshot is saved to** (the tool reports it) — you'll delete them in the cleanup step. Read the screenshot. Compare it to the reference image and the spec, and write a TodoWrite checklist of every discrepancy across three categories:
   - **Visual style values** — colors, padding/margin, font size/weight/line-height, border-radius, borders, shadows (use exact values from `layers[].fills/textStyles/borders/shadows/rect/borderRadius`).
   - **Layout structure** — flex/grid arrangement, alignment, order.
   - **Copy** — text content (from `layers[].content`).
   - **Implementation hints** — if `annotations[]` is non-empty, read each `annotation.content` for designer notes on behavior/spacing/component reuse and fold them into the checklist.

3. **Edit the code.** First detect the project's styling convention (Tailwind / CSS Modules / styled-components / plain CSS) by reading the target file and its neighbors. Apply changes using the spec's exact values (scaled per step 1), and **prefer existing design tokens/variables** in the codebase (and the `tokens.colors` names from the spec) over hardcoded values.

   **Building from scratch (route is empty / no existing component):** don't free-hand the layout from the reference image. First derive a **layout skeleton** from the `rect.absolute` of the shallow (depth 0–2) group layers: the content column width and centering (e.g. groups at x=580, width=1400 in a 2560 screen → a 54.7%-wide centered container), the vertical order of sections, and which layers overlap (overlay text/scrims on images). Write that skeleton as containers first, then fill each section's styles and copy from its child layers.

   **If the project uses Tailwind**, express the design values the Tailwind way — don't just inline raw CSS:
   - **Read `tailwind.config.{js,ts,cjs,mjs}`** (incl. `theme.extend`) first to learn the configured `colors`, `spacing`, `fontSize`, `fontFamily`, `borderRadius` tokens.
   - **Match a theme token when the value matches it** → use the semantic class (`text-primary`, `text-sm`, `rounded-lg`, `p-4`). Only fall back to **arbitrary values** when nothing matches: `text-[#ff6b8b]`, `text-[14px]`, `leading-[20px]`, `tracking-[0.5px]`, `rounded-[16px]`.
   - **font-family — be careful.** Zeplin's `textStyles[].fontFamily` is often a platform/system font (e.g. `PingFang`, `SF Pro`) with no meaning on the web. Only set/change font-family if that family is actually configured in `tailwind.config` `fontFamily` (or loaded as a web font in the project). Otherwise **leave the project's existing font-family alone** — don't hardcode the design's font name.
   - Same principle for color/size: reuse the configured token if it matches; never invent a class name that isn't in the config.

4. **Sync static assets (only if the design has images/icons to wire).**
   1. **Export:** run `node <skill-dir>/assets.js "<screen-url>"`, read the manifest (`assets[]` with `file`, `hash`, `layerName`, `format`). Read key asset images so you can see them.
   2. **List the page's in-use assets — from component source first.** Read the target component (and its imported children as needed) and collect every asset reference (`import x from '...'`, `<img src>`, CSS `url(...)`); resolve each to its **source file path** in the project (this is the "recorded location"). Use the rendered page only to confirm they actually display.
   3. **Decide per asset** by correlating each manifest asset to an in-use asset via `layerName` + the layer `rect` (position/size from step 1's spec) + the reference image, then act:
      - **Matches an in-use asset, hashes equal** (hash the existing source file with the same sha256 as `lib/detect.js`) → **skip** (already up to date).
      - **Matches an in-use asset, hashes differ** → **replace in place**: copy the manifest `file` over the recorded source file path.
      - **No in-use match (new asset)** → copy `file` into the project's asset dir (detect convention: `public/`, `src/assets/`, `assets/`) and wire the reference. **If the mapping is ambiguous, ask the user.**
      - **In-use asset with no matching Zeplin asset** → leave it alone.

5. **Re-render and verify.** Re-navigate and re-screenshot (track these paths too). Compare against the reference image and tick off checklist items. Keep the browser open across iterations — don't close it between rounds.

6. **Iterate** at most **3 rounds** (more only if the user asks). Stop when aligned or no longer improving.

7. **Report.** Summarize what changed (styles + assets: skipped / replaced / added), any residual differences, and items needing a human decision (ambiguous asset mapping, unresolved alias paths, screen↔component mapping).

8. **Clean up (ALWAYS — even if you stopped early or hit an error).**
   - **Close the browser:** call `browser_close` so no Playwright session is left running.
   - **Delete the temp images:** `rm` every screenshot you took (the paths tracked in steps 2 & 5), the downloaded reference image (use the actual `referenceImage` path printed by `zeplin.js` — it lives under `os.tmpdir()`, which is **not** `/tmp` on macOS), and the exported assets dir (`<tmpdir>/zeplin-sync/assets/`).

## Scope

In scope: visual style values, layout structure, copy, and static assets (export + page-scoped incremental wiring: skip unchanged, replace changed in place, add new). **Out of scope:** automatic asset↔code mapping heuristics and multi-density `srcset` — for ambiguous mappings, ask the user. **Solid-color and gradient fills are normalized** — image fills are not in `layers[].fills`; eyeball those from the `referenceImage`.

## Errors

- Zeplin `403` / not-a-member → a permissions issue (the user must be a member of the project); not a token-format problem.
- URL parse failure → `zeplin.js` prints the expected URL form.
- Route blank/404 → confirm the dev server is running and the route is correct.
- Can't confidently map the screen to a component → ask the user instead of guessing.
- `assets.js` prints an empty `assets: []` → the screen has no exportable assets; skip the asset step.
- Can't resolve an in-use asset reference to a real file (build alias like `@/assets`, bundled output) → treat the mapping as ambiguous and ask the user which file to replace.
