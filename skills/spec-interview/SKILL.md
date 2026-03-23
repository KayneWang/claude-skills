---
name: spec-interview
description: Use when the user asks to build a new feature, create a new page, or add significant functionality - interview them with AskUserQuestion to clarify requirements before writing any code
---

# Spec Interview

## Overview

Before implementing any significant feature, interview the user using `AskUserQuestion` to gather requirements, then output a structured spec document. Implementation happens in a separate session.

## When to Use

- User asks to build a new feature or page
- User describes a vague or high-level requirement
- Task involves multiple components or design decisions

**When NOT to use:** Bug fixes, small tweaks, or tasks where the user already provided a detailed spec.

## Workflow

1. **Explore existing code** — Use the Explore agent to understand what already exists in the codebase related to the feature
2. **Interview** — Ask 2-4 rounds of questions using `AskUserQuestion` (2-4 questions per round), covering:
   - Feature scope and type
   - Technical constraints (backend readiness, existing infra)
   - UI/UX preferences and layout
   - Priority of sub-features for V1
3. **Generate spec** — Synthesize answers into a structured spec in markdown
4. **Save spec** — Write to `specs/<feature-name>.md` in the project root
5. **Stop** — Do NOT start implementation. Tell the user to open a new session to execute the spec

## Question Design Tips

- Provide concrete options with descriptions, not open-ended questions
- Use `multiSelect: true` when choices are not mutually exclusive
- Start broad (what type of feature?) then narrow (specific UI details)
- Reference existing code/patterns found in step 1 as options when relevant
