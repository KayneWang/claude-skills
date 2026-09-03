#!/usr/bin/env node
import { createGit } from "./lib/git.js";
import { resolveContext, createClient } from "./lib/gitlab-api.js";
import { USAGE, parseBranchNameArgs, parseStartArgs, parseMrCreateArgs, parseDeleteArgs } from "./lib/args.js";
import { buildBranchName, computeMergedBranches } from "./lib/branches.js";
import { resolveBase, collectStatus } from "./lib/status.js";
import { findMr, resolveUserId, createMr } from "./lib/mr.js";

const COMMANDS = ["status", "base", "branch-name", "start", "push", "mr-find", "mr-create", "merged-branches", "delete-branches"];

// GitLab context is optional for git-mode commands: null when no token / unresolvable remote.
function tryGitlab(git) {
  try {
    return requireGitlab(git);
  } catch {
    return null;
  }
}

function requireGitlab(git) {
  const ctx = resolveContext({ remoteUrl: git.remoteUrl() });
  return { client: createClient(ctx), projectPath: ctx.projectPath };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!COMMANDS.includes(cmd)) throw new Error(USAGE);

  // Parse arguments before touching git/GitLab so usage errors never depend on context.
  const parsed =
    cmd === "branch-name" ? parseBranchNameArgs(rest)
    : cmd === "start" ? parseStartArgs(rest)
    : cmd === "mr-create" ? parseMrCreateArgs(rest)
    : cmd === "delete-branches" ? parseDeleteArgs(rest)
    : null;

  const git = createGit();
  let result;

  if (cmd === "status") {
    result = await collectStatus({ git, gitlab: tryGitlab(git) });
  } else if (cmd === "base") {
    result = await resolveBase({ git, gitlab: tryGitlab(git) });
  } else if (cmd === "branch-name") {
    const name = buildBranchName(parsed);
    result = { name, existsLocal: git.localBranchExists(name), existsRemote: git.remoteBranchExists(name) };
  } else if (cmd === "start") {
    const { name, description } = parsed;
    if (git.localBranchExists(name)) throw new Error(`Branch "${name}" already exists locally. Reuse it (git switch ${name}) or pick another name.`);
    const { base } = await resolveBase({ git, gitlab: tryGitlab(git) });
    git.fetchBranch(base);
    git.switchCreate(name, `origin/${base}`);
    if (description) git.setDescription(name, description);
    result = { name, base, description };
  } else if (cmd === "push") {
    const branch = git.currentBranch();
    if (!branch) throw new Error("Detached HEAD: switch to a branch first.");
    const { base } = await resolveBase({ git, gitlab: tryGitlab(git) });
    if (branch === base) throw new Error(`Refusing to push: you are on the base branch "${base}". Start a branch with /g start first.`);
    const before = git.unpushed() ?? git.revCount(`origin/${base}..HEAD`);
    git.push(branch);
    result = { branch, pushed: before };
  } else if (cmd === "mr-find") {
    const gitlab = requireGitlab(git);
    result = { mr: await findMr(gitlab.client, gitlab.projectPath, git.currentBranch()) };
  } else if (cmd === "mr-create") {
    const gitlab = requireGitlab(git);
    const branch = git.currentBranch();
    const { base } = await resolveBase({ git, gitlab });
    if (branch === base) throw new Error(`Refusing to create an MR from the base branch "${base}".`);
    const target = parsed.target ?? base;
    if (!git.remoteBranchExists(branch)) throw new Error(`origin/${branch} does not exist yet — push first.`);
    if (!git.remoteBranchExists(target)) throw new Error(`Target branch "${target}" does not exist on origin.`);
    const existing = await findMr(gitlab.client, gitlab.projectPath, branch);
    if (existing?.state === "opened") {
      result = { iid: existing.iid, web_url: existing.web_url, existing: true };
    } else {
      const assigneeId = parsed.assignee ? await resolveUserId(gitlab.client, parsed.assignee) : null;
      const mr = await createMr(gitlab.client, gitlab.projectPath, {
        sourceBranch: branch,
        targetBranch: target,
        title: parsed.title,
        description: parsed.description,
        assigneeId,
      });
      result = { ...mr, existing: false };
    }
  } else if (cmd === "merged-branches") {
    const { base } = await resolveBase({ git, gitlab: tryGitlab(git) });
    git.fetchPrune();
    result = {
      base,
      branches: computeMergedBranches({ merged: git.listMerged(base), tracked: git.listTracked(), base, current: git.currentBranch() }),
    };
  } else if (cmd === "delete-branches") {
    const deleted = [];
    const failed = [];
    for (const name of parsed) {
      try {
        git.deleteBranch(name);
        deleted.push(name);
      } catch (err) {
        failed.push({ name, reason: err.message.replace(/^git branch -d \S+ failed: /, "").replace(/^error: /, "") });
      }
    }
    result = { deleted, failed };
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
