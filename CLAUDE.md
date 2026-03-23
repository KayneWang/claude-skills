# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Claude Code plugin (`kayne-skills`) that packages reusable skills for team sharing. Installed via `/plugin install kayne-skills`. Plugin manifest is at `.claude-plugin/plugin.json`.

## Architecture

```
.claude-plugin/plugin.json   # Plugin manifest — registers skills by path
skills/
  <skill-name>/
    SKILL.md                  # Skill definition (frontmatter: name, description, trigger conditions)
    [supporting files]        # Optional runtime code (e.g., fetch.js, package.json)
```

Each skill is a directory under `skills/` containing a `SKILL.md` with YAML frontmatter (`name`, `description`) and markdown body defining when/how to use it. The `description` field in frontmatter controls when Claude Code triggers the skill.

## Current Skills

- **spec-interview** — Pure-prompt skill. Interviews users via `AskUserQuestion` to produce specs in `specs/`. No runtime code.
- **headless-web-fetch** — Has runtime code (`fetch.js`). Uses Playwright to fetch JS-rendered pages. Auto-installs dependencies on first run. Called via `node <skill-dir>/fetch.js <url>`.

## Adding a New Skill

1. Create `skills/<skill-name>/SKILL.md` with frontmatter and instructions
2. Add the path `skills/<skill-name>` to the `skills` array in `.claude-plugin/plugin.json`
3. If the skill needs runtime code, add it alongside SKILL.md with its own `package.json`
