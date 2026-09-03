---
name: git-flow
description: "Use when the user runs `/g` or asks for the team git workflow — e.g. \"/g start fix spar-111\", \"/g commit\", \"/g ship kayne.wang\", \"/g sync\", \"开个分支\", \"提交并推送\", \"建个 MR 给 xxx\", \"同步基准分支\", \"清理已合并的分支\", \"我现在在流程哪一步\". Encodes the team standard: typed branches from the base branch, `type: 描述` commits that auto-push, non-Draft MRs with an assignee, and a sync that returns to base and prunes merged branches."
---

# git-flow (`/g`)

One entry point for the team git standard. Every deterministic git / GitLab step runs through `node <skill-dir>/g.js <command>` (prints JSON; non-zero exit + one stderr line on failure). You do the judgment, the gates, and the wording.

## Verbs

| Verb | Args | What it does |
| --- | --- | --- |
| `/g` | — | status panel: where the user is in the flow, what to do next |
| `/g start` | `<type> [jira] [描述]` | branch off the up-to-date base branch |
| `/g commit` | `[描述]` | commit `type: 描述` **and push**; push-only when the tree is clean |
| `/g ship` | `[assignee] [target]` | push, then create a non-Draft MR (assignee = GitLab username; target defaults to base) |
| `/g sync` | — | return to base, ff-only pull, auto-delete merged local branches |

Synonyms (accept silently, never mention them in output): `gst` → `/g`, `gcb` → `start`, `gc` / `gcmsg` / `gp` / `gpsup` → `commit`, `gl` → `sync`. Anything else after `/g` → show the verb table.

Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`. Jira key looks like `spar-111` (any case; always lowercased).

## Prerequisites

1. Inside a git repo with an `origin` remote. If `origin` is missing, stop.
2. `GITLAB_TOKEN` (PAT, `api` scope) is needed for `ship` and for MR info in the panel. Without it, `status` / `start` / `sync` still work in git mode (base = `origin/HEAD`). If `g.js` says the base cannot be determined, tell the user to run `git remote set-head origin -a` or set the token.
3. Self-hosted GitLab: host/project come from the remote URL; `GITLAB_HOST` / `GITLAB_PROJECT` override.

## `/g` — status panel

Run `node <skill-dir>/g.js status`. Render, in the user's language:

```
分支 <branch> ← <base>（领先 <ahead>，落后 <behind>）
工作区 <干净 | N 处改动（M 已暂存，K 未跟踪）>，<无上游 | N 个 commit 未推送>
MR：<无 | !iid (opened → target) url | !iid 已合并 url | 未知（原因）>
待清理分支：<列表 (reason) | 无>
建议：<one or more lines below>
```

Advice, in this order, list every line that applies:

1. `onBase` and tree not clean → `先 /g start <type> ... 开分支，不要在 <base> 上直接提交`
2. `!branchValid` and not on base → `分支名不符合 type/xxx 规范，建议 /g start 新开分支后 cherry-pick`
3. tree not clean → `/g commit 提交并推送`
4. tree clean, `unpushed > 0` or `!hasUpstream` with `ahead > 0`: `mr.state === "none"` → `/g ship <assignee> 创建 MR`; `mr.state === "opened"` → `/g commit 推送`
5. `mr.state === "merged"` → `/g sync 回到 <base> 并清理`
6. `cleanup` non-empty → `/g sync 会自动删除上面的待清理分支`
7. nothing applies → `一切就绪`

## `/g start <type> [jira] [描述]`

1. Tree must be clean (the `status.clean` field of the `g.js status` output, or `git status --porcelain`). If not, ask: stash / commit first / abort. Never discard changes.
2. Parse: first token is the type (reject anything outside the six). If the next token matches a jira key, it is the key; everything remaining is the description.
3. Build the slug only when there is no jira key: translate the description into 3–5 English words, kebab-case, ascii (`登录记住我` → `login-remember-me`). **Gate:** show the proposed branch name and wait for approval. With a jira key the name is `type/<key>` — no gate.
4. Run `node <skill-dir>/g.js branch-name <type> [jira] [slug]`. If `existsLocal` or `existsRemote`, ask: reuse (`git switch <name>`) or choose another name. Never delete.
5. Run `node <skill-dir>/g.js start <name> [--description "<描述>"]` — pass `--description` only when both a jira key and a description were given (the description is kept for the MR title).
6. Report: branch, base, stored description.

## `/g commit [描述]`

Commit and push in one go. With a clean tree and unpushed commits, it only pushes.

1. `git branch --show-current`; if it equals the base (`g.js base`) → refuse, point to `/g start`.
2. If the branch is not `type/xxx` with a known type → ask which type to use for the message (don't guess).
3. Clean tree (`git status --porcelain` empty) → skip to step 6.
4. `git status --porcelain` + `git diff --stat`. Untracked files: list them and ask which to include. Stage everything tracked that changed (`git add -u`) plus the approved untracked files (`git add <file>`).
5. Message: `type: 描述` — type from the branch, description from the user's argument or your own one-line summary of the staged diff (same language the user writes in). Show the message, then `git commit -m "<message>"` — no gate (amend is cheap).
6. `node <skill-dir>/g.js push`. On `Push rejected` do **not** force; explain that origin has commits this branch lacks and suggest `git pull` on this branch, then retry. The commit itself stays.
7. Report: commit hash + message (if any), commits pushed.

## `/g ship [assignee] [target]`

1. `git branch --show-current`; if it equals the base (`g.js base`) → refuse, point to `/g start`.
2. Uncommitted changes → run the full `/g commit` procedure first. Otherwise `node <skill-dir>/g.js push` so origin matches local.
3. `node <skill-dir>/g.js mr-find`. If `mr.state === "opened"` → report its URL and stop (never create a second one).
4. Title = `type: <jira> <描述>` (or `type: <描述>` without a jira key). Type and key come from the branch name. Description priority: `git config --get branch.<name>.description` → subject of the last commit with its `type: ` prefix stripped → ask the user.
5. Description body: two short sections — what changed (from `git log origin/<target>..HEAD --oneline` and the diff) and how to verify.
6. **Gate:** show title, target (default = base), assignee (or "none") and wait for approval.
7. `node <skill-dir>/g.js mr-create --title "<t>" --description "<d>" [--assignee <username>] [--target <branch>]`.
   - `existing: true` in the output → someone created one meanwhile; report that URL.
   - `GitLab user "..." not found` → report; nothing was created. Ask for the correct username (not display name).
   - `Target branch ... does not exist on origin` → report; nothing was created.
8. Report the MR URL. Without an assignee, remind the user to set one on the MR page (that is what triggers the review notification).

## `/g sync`

Always the same result regardless of the current branch: back on base, fast-forwarded, merged branches gone.

1. Tree must be clean; otherwise ask stash / commit first / abort.
2. `node <skill-dir>/g.js base` → `<base>`.
3. `git fetch --prune origin`.
4. If not on `<base>`: `git switch <base>`.
5. `git pull --ff-only origin <base>`. If git refuses (not possible to fast-forward) → stop, explain that local `<base>` has commits origin doesn't have, show `git log origin/<base>..<base> --oneline`, and do **not** merge or rebase. Skip cleanup in that case.
6. `node <skill-dir>/g.js merged-branches` → then, without asking, `node <skill-dir>/g.js delete-branches <name...>` for every listed name. Empty list → skip.
7. Report: how many commits `<base>` advanced, deleted branches with their reason (merged / gone), and any `failed` entries with git's reason. A `failed` entry usually means the remote branch was deleted without merging — leave it to the user (`git branch -D` is their call, never yours).

## Errors

- `GITLAB_TOKEN is not set` from `mr-find` / `mr-create` → give the PAT instructions (GitLab → Preferences → Access Tokens, `api` scope, `export GITLAB_TOKEN=...`). Other verbs keep working without it.
- `GitLab API 401` → token invalid/expired; regenerate.
- `Request to ... failed` → host/network problem; mention `GITLAB_HOST` (`http://` prefix for http-only instances).
- `not a GitLab host` → origin points at GitHub etc.; suggest `GITLAB_HOST` + `GITLAB_PROJECT`.
- `GitLab API 409` on `mr-create` → an MR already exists; run `mr-find` and report it.
- `already exists locally` from `start` → ask reuse vs rename.
- Any `Refusing to ...` message → relay it verbatim and point to `/g start`.

## Scope

In: start / commit / ship / sync / status for one repo with one base branch. Out: rebase, merging base into a feature branch, MR merge or reviewer fields, multiple repos, Jira API, notifications (an external service watches GitLab assignee events).
