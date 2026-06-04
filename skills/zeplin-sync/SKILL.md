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
