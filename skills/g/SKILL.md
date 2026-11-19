---
name: g
description: "Use when the user runs `/g` or asks for the team git workflow — e.g. \"/g start fix demo-111\", \"/g commit\", \"/g ship jane.doe\", \"/g sync\", \"/g conflicts\", \"开个分支\", \"提交并推送\", \"建个 MR 给 xxx\", \"同步基准分支\", \"合入 main 解决冲突\", \"处理代码冲突\", \"清理已合并的分支\"."
---

# g (`/g`)

One entry point for the team git standard. Every deterministic git / GitLab step runs through `node <skill-dir>/g.js <command>` (one-line JSON on success; non-zero exit + a stderr line on failure). You do the judgment, the gates, and the wording.

## Verbs

| Verb | Args | What it does |
| --- | --- | --- |
| `/g` | — | status panel: where the user is in the flow, what to do next |
| `/g start` | `<type> [jira] [描述] [--from <分支>]` | branch off the up-to-date base branch, or off `origin/<分支>` when `--from` is given (that branch then becomes this branch's base) |
| `/g commit` | `[描述]` | commit `type: 描述` **and push**; push-only when the tree is clean |
| `/g ship` | `[assignee] [target]` | push, then create a non-Draft MR (assignee = GitLab username; target defaults to base) |
| `/g sync` | — | return to base, ff-only pull, auto-delete merged local branches |
| `/g conflicts` | `[branch]` | merge `origin/<branch>` (default = this branch's base) into the current branch, resolve conflicts, commit, push |

Synonyms (accept silently, never mention them): `gst` → `/g`, `gcb` → `start`, `gc` / `gcmsg` / `gp` / `gpsup` → `commit`, `gl` → `sync`, `gm` → `conflicts`. Anything else after `/g` → show the verb table.

Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`. Jira key looks like `demo-111` (any case; always lowercased).

## Shared rules

- Needs a git repo with an `origin` remote; otherwise stop.
- `GITLAB_TOKEN` (PAT, `api` scope) is required for `ship` and for MR info in the panel. `status` / `start` / `sync` work without it (base = `origin/HEAD`). Self-hosted: host/project come from the remote URL; `GITLAB_HOST` / `GITLAB_PROJECT` override.
- **Base is per branch:** `g.js base` / `status` / `push` / `mr-create` use the base `start --from` recorded for the current branch, else the repo base. Always ask `g.js` — never assume the repo default.
- **On base is refused** for `commit`, `ship` and `conflicts`: if `git branch --show-current` equals `g.js base`, stop and point to `/g start`.
- **Dirty tree** (`git status --porcelain` non-empty) blocks `start`, `sync` and `conflicts`: ask stash / commit first / abort. Never discard changes.
- **Errors:** relay the stderr line verbatim — it already contains the fix (token setup, `GITLAB_HOST`, reuse-vs-rename, ...). Any `Refusing to ...` → point to `/g start`. Never force-push, never `branch -D`.
- **Context budget:** read `--stat` / `--oneline` output, not full diffs, unless a specific file needs a look.

## `/g` — status panel

Run `node <skill-dir>/g.js status` and render, in the user's language:

```
分支 <branch> ← <base>（领先 <ahead>，落后 <behind>）
工作区 <干净 | N 处改动（M 已暂存，K 未跟踪）>，<无上游 | N 个 commit 未推送>
MR：<无 | !iid (opened → target) url | !iid 已合并 url | 未知（原因）>
待清理分支：<列表 (reason) | 无>
建议：<each `advice` entry verbatim, one per line; translate only if the user is not writing Chinese>
```

## `/g start <type> [jira] [描述] [--from <分支>]`

1. Tree must be clean (`status.clean` from `g.js status`, or `git status --porcelain`).
2. Parse: pull out `--from <分支>` first if present (the token right after `--from` is the source branch; it is not part of the description). Then the first token is the type (reject anything outside the six). If the next token matches a jira key, it is the key; everything remaining is the description.
3. Without a jira key, build the slug: translate the description into 3–5 English words, kebab-case, ascii (`登录记住我` → `login-remember-me`). **Gate:** show the proposed branch name and wait for approval. With a jira key the name is `type/<key>` — no gate.
4. `node <skill-dir>/g.js branch-name <type> [jira] [slug]`. If `existsLocal` or `existsRemote`, ask: reuse (`git switch <name>`) or choose another name.
5. `node <skill-dir>/g.js start <name> [--description "<描述>"] [--from <分支>]` — pass `--description` only when both a jira key and a description were given (kept for the MR title). Pass `--from` only when the user gave it: the branch is cut from `origin/<分支>` and `<分支>` is recorded as its base, so `/g`, `/g ship` (default target) and `/g sync` follow it. Without it, behaviour is unchanged (base branch).
6. Report: branch, base (the `--from` branch when given), stored description.

## `/g commit [描述]`

1. Base check (shared rules). If the branch is not `type/xxx` with a known type → ask which type to use (don't guess).
2. Clean tree → skip to step 4.
3. `git status --porcelain` + `git diff --stat`. Untracked files: list them and ask which to include. `git add -u` plus the approved untracked files. Message is one line, `type: 描述`, and nothing else — type from the branch, description from the user's argument or your one-line summary of the staged changes (user's language). No body, no trailers (`Co-Authored-By`, `Claude-Session`, `Generated with ...`): the harness's default commit attribution does not apply to `/g`. Show it, then `git commit -m "<message>"` — no gate.
4. `node <skill-dir>/g.js push`. On `Push rejected` do **not** force: origin has commits this branch lacks; suggest `git pull` on this branch, then retry. The commit stays.
5. Report: commit hash + message (if any), commits pushed.

## `/g ship [assignee] [target]`

1. Base check (shared rules). Uncommitted changes → run the full `/g commit` first; otherwise `node <skill-dir>/g.js push`.
2. `node <skill-dir>/g.js mr-find`. `mr.state === "opened"` → report its URL and stop.
3. Title = `type: <jira> <描述>` (or `type: <描述>` without a key), from the branch name. Description priority: `git config --get branch.<name>.description` → last commit subject with its `type: ` prefix stripped → ask.
4. Body — exactly this shape, in the user's language, nothing before or after it:

   ```
   ## 改动
   - <one line per commit: subject with its `type: ` prefix stripped>

   ## 验证
   - <one line: how a reviewer checks it works>
   ```

   Commits come from `git log origin/<target>..HEAD --oneline`; drop the hashes, fold fixup/wip-style commits into the line they belong to. One verification bullet, two at most. The body ends at the last bullet: no `--stat` block, no summary paragraph, no `Co-Authored-By` / `Generated with Claude Code` / session-link trailer — the harness's default PR attribution does not apply to `/g` output.
5. **Gate:** show title, target (default = `g.js base` — the branch's recorded base when it has one), assignee (or "none") and wait for approval.
6. Write the body to a temp file with the Write tool (e.g. `<os tmpdir>/g-mr-description.md`), then `node <skill-dir>/g.js mr-create --title "<t>" --description-file <path> [--assignee <username>] [--target <branch>]`. Never pass the body inline (shell quoting mangles backticks / `$`); keep the title free of backticks / `$`.
   - `existing: true` → an MR already existed (or was created meanwhile); report that URL.
   - `GitLab user "..." not found` → nothing was created; ask for the username (not display name).
7. Report the MR URL. Without an assignee, remind the user to set one on the MR page (that triggers the review notification).

## `/g sync`

Back on the current branch's base (its `--from` branch, else the repo base), fast-forwarded, merged branches gone.

1. Tree must be clean (shared rules). `node <skill-dir>/g.js base` → `<base>` (run it **before** switching — it depends on the current branch).
2. `git fetch --prune origin`; if not on `<base>`, `git switch <base>`.
3. `git pull --ff-only origin <base>`. If git refuses → stop, show `git log origin/<base>..<base> --oneline`, explain local `<base>` has commits origin lacks, do **not** merge/rebase, skip cleanup.
4. `node <skill-dir>/g.js merged-branches` (each branch is judged against its own base; branches others were started from are never listed) → without asking, `node <skill-dir>/g.js delete-branches <name...>` for every listed name. Empty → skip.
5. Report: commits `<base>` advanced, deleted branches with reason (merged / gone), and `failed` entries with git's reason — those are the user's call.

## `/g conflicts [branch]`

Merge (never rebase, never force-push) `origin/<branch>` into the current branch; `<branch>` defaults to `g.js base`.

1. `node <skill-dir>/g.js conflicts [branch]` — refuses on base, on a dirty tree, for a branch missing on origin, or for the current branch itself; relay the stderr line. It fetches and runs `git merge --no-ff --no-commit`, returning `{target, resumed, merged, upToDate, conflicts: [{path, kind, binary, lockfile}]}`. `resumed: true` means a merge was already under way — carry on with its conflicts.
2. `upToDate` → report "已包含 `<target>` 的全部提交" and stop.
3. Resolve each entry of `conflicts`:
   - **Ask the user, one by one**, for: `kind` other than `both-modified` / `both-added` (modify/delete etc.), `binary: true`, `lockfile: true` (suggest taking `<target>`'s side with `git checkout --theirs <path>` and re-running the package install afterwards), and any hunk where the two sides conflict in intent and picking needs business judgment.
   - Everything else: read the file's conflict hunks and write a merged version that keeps both sides' intent. Read only the conflicted files, not the whole diff.
   - `git add <path>` (or `git rm <path>`) for each resolved path.
4. Verify: `git diff --cached --check` passes and `git grep -nE '^(<<<<<<<|>>>>>>>)( |$)' -- <resolved paths>` finds nothing. Otherwise fix before going on.
5. **Gate:** one line per file — `path — N 处冲突 — 处理方式（保留本分支 / 保留 <target> / 两边合并 / 用户决定）`, plus the merged commit count. Show a file's resolved hunks only when asked. On rejection or any failure: `git merge --abort` (the branch is back as before) and stop.
6. `git commit --no-edit` (git's default `Merge remote-tracking branch ...` message; no trailers), then `node <skill-dir>/g.js push`. On `Push rejected` follow `/g commit` step 4.
7. Report: target, commits merged, files resolved (and how), pushed. Remind the user to run the project's tests locally.

## Scope

In: start / commit / ship / sync / conflicts / status for one repo, with one base branch per feature branch. Out: rebase, MR merge or reviewer fields, multiple repos, Jira API, notifications.
