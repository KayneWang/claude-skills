---
name: gitlab-issue-dev
description: Use when the user wants to pick up and develop a GitLab issue end-to-end — e.g. "开发一个分配给我的 issue", "做一下 GitLab 上的 issue", "从 issue 开分支开发", "pick up my GitLab issue". Lists open issues assigned to the user, confirms an implementation plan, creates a branch, develops with tests, and opens a Draft MR that closes the issue.
---

# gitlab-issue-dev

Drive one GitLab issue from selection to a Draft merge request: list the user's assigned issues → confirm a plan → branch → develop → push → Draft MR.

## Prerequisites (check first, stop if missing)

1. `GITLAB_TOKEN` is set (personal access token, `api` scope). If not: tell the user to create one at GitLab → Preferences → Access Tokens, then `export GITLAB_TOKEN=<token>`.
2. The current directory is a git repository whose `origin` remote is a GitLab project. Self-hosted GitLab works — the host is parsed from the remote URL. If the remote can't be parsed, the user can override with `GITLAB_HOST` (e.g. `gitlab.mycorp.com`) and `GITLAB_PROJECT` (e.g. `team/app`).
3. The working tree is clean. If not, ask the user how to proceed (stash / commit first / abort) — never silently discard changes.

## Procedure

1. **List the user's issues.** Run:
   `node <skill-dir>/gitlab.js issues`
   Parse the JSON array (`iid`, `title`, `labels`, `summary`, `web_url`). If empty, tell the user no open issues are assigned to them and stop. Otherwise present the list (iid, title, labels) and ask which one to work on.

2. **Fetch the full issue.** Run:
   `node <skill-dir>/gitlab.js issue <iid>`
   Read `description`, `labels`, `comments` (discussion often carries extra requirements — treat them as part of the spec), and `relatedMrs` (if an open related MR exists, flag it to the user before continuing — someone may already be working on this).

3. **Confirm the plan (gate 1 — do not write code before this).** Digest the issue into an implementation plan: which files to touch, the approach, and acceptance criteria derived from the issue text. Present it to the user and get explicit approval. Adjust until approved.

4. **Create the branch** from the up-to-date default branch:
   ```bash
   git fetch origin
   git switch -c <type>/<iid>-<slug> origin/<default-branch>
   ```
   - `<type>`: `fix` if the issue labels contain a bug-like label (`bug`, `fix`, `defect`, `hotfix` — case-insensitive), else `feature`.
   - `<slug>`: an English kebab-case phrase from the issue title, ≤5 words (translate non-English titles; e.g. "登录页新增记住我" → `login-remember-me`).
   - `<default-branch>`: from `git remote show origin`; when in doubt use the branch `origin/HEAD` points to.
   - If the branch name already exists locally or remotely, ask the user: reuse it or pick a new name.

5. **Develop.** Implement the approved plan following the normal development workflow (write tests first where the project has a test setup; run the project's tests and linter). Stay scoped to the issue — don't fix unrelated things.

6. **Confirm before pushing (gate 2).** Show the user a summary of what changed plus `git diff --stat`. Only proceed on explicit approval.

7. **Ship.** Commit (message references the issue, e.g. `feat: add remember-me to login (#123)`), push the branch, then create the Draft MR:
   ```bash
   git push -u origin <branch>
   node <skill-dir>/gitlab.js mr <branch> --issue <iid> --title "<issue title or better>" --description "<what & why, testing notes>"
   ```
   The MR is created as **Draft** targeting the project default branch, and its description ends with `Closes #<iid>` so merging auto-closes the issue. Report the MR URL and remind the user to review and mark it ready themselves.

## Errors

- `401` → token invalid/expired; regenerate the PAT (`api` scope).
- Empty `issues` output → nothing assigned to the user; stop.
- Remote host is a known non-GitLab host (e.g. GitHub) → rejected outright with an error; an unrecognized but wrong host instead surfaces as a GitLab API 404. Either way, stop and suggest `GITLAB_HOST` + `GITLAB_PROJECT`.
- MR creation `409` (an open MR already exists for the branch) → surface the API message and the existing MR link; don't retry.
- Branch already exists → ask the user (reuse vs rename); never force-delete.

## Scope

In scope: one issue → one branch → one Draft MR. Out of scope: changing issue state/labels/assignee (the `Closes #` footer handles closing on merge), assigning reviewers, marking the MR ready, handling multiple issues at once, monorepo sub-project mapping.
