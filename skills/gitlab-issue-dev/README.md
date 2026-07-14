# gitlab-issue-dev

Claude Code skill: pick a GitLab issue assigned to you and drive it to a Draft MR — list issues → confirm plan → branch (`feature/<iid>-<slug>` / `fix/<iid>-<slug>`) → develop → push → Draft MR with `Closes #<iid>`.

## Setup

- `export GITLAB_TOKEN=<personal access token with api scope>`
- Run inside a git repo whose `origin` is a GitLab project (self-hosted OK). Override detection with `GITLAB_HOST` / `GITLAB_PROJECT` if needed.

## CLI

Run from the target GitLab repo (`<skill-dir>` = this directory, e.g. `~/.claude/skills/gitlab-issue-dev`):

```
node <skill-dir>/gitlab.js issues                     # open issues assigned to you (JSON)
node <skill-dir>/gitlab.js issue <iid>                # full issue: description, comments, related MRs
node <skill-dir>/gitlab.js mr <branch> --issue <iid> --title <t> --description <d>   # create Draft MR
```

Requires Node 18+. No npm dependencies. Tests: `npm test`.
