import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBase, collectStatus } from "../lib/status.js";

function fakeGit(over = {}) {
  return {
    fetchPrune() {},
    originHead: () => "main",
    currentBranch: () => "fix/spar-1",
    statusPorcelain: () => ({ clean: true, staged: 0, unstaged: 0, untracked: 0 }),
    aheadBehind: () => ({ ahead: 2, behind: 0 }),
    unpushed: () => 2,
    listMerged: () => ["main", "feat/old"],
    listTracked: () => [
      { name: "main", track: "" },
      { name: "feat/old", track: "[gone]" },
      { name: "fix/spar-1", track: "[ahead 2]" },
    ],
    ...over,
  };
}

function fakeGitlab({ defaultBranch = "develop", mrs = [], fail = null } = {}) {
  return {
    projectPath: "t/a",
    client: {
      async get(path, params) {
        if (fail) throw fail;
        if (path === "/projects/t%2Fa") return { default_branch: defaultBranch };
        if (path.endsWith("/merge_requests")) return mrs.filter((m) => m.source_branch === params.source_branch);
        throw new Error(`unexpected ${path}`);
      },
    },
  };
}

test("resolveBase uses GitLab default_branch when available", async () => {
  assert.deepEqual(await resolveBase({ git: fakeGit(), gitlab: fakeGitlab() }), { base: "develop", source: "gitlab" });
});

test("resolveBase falls back to origin/HEAD without gitlab or on API error", async () => {
  assert.deepEqual(await resolveBase({ git: fakeGit(), gitlab: null }), { base: "main", source: "origin-head" });
  assert.deepEqual(await resolveBase({ git: fakeGit(), gitlab: fakeGitlab({ fail: new Error("boom") }) }), { base: "main", source: "origin-head" });
});

test("resolveBase throws with a hint when nothing works", async () => {
  await assert.rejects(resolveBase({ git: fakeGit({ originHead: () => null }), gitlab: null }), /git remote set-head origin -a|GITLAB_TOKEN/);
});

test("collectStatus composes git + MR + cleanup", async () => {
  const gitlab = fakeGitlab({
    defaultBranch: "main",
    mrs: [{ iid: 7, web_url: "u7", state: "opened", target_branch: "main", source_branch: "fix/spar-1" }],
  });
  const s = await collectStatus({ git: fakeGit(), gitlab });
  assert.deepEqual(s.base, { base: "main", source: "gitlab" });
  assert.equal(s.branch, "fix/spar-1");
  assert.equal(s.onBase, false);
  assert.equal(s.branchValid, true);
  assert.equal(s.type, "fix");
  assert.equal(s.jira, "spar-1");
  assert.equal(s.ahead, 2);
  assert.equal(s.behind, 0);
  assert.equal(s.hasUpstream, true);
  assert.equal(s.unpushed, 2);
  assert.deepEqual(s.mr, { state: "opened", iid: 7, web_url: "u7", target_branch: "main" });
  assert.deepEqual(s.cleanup, [{ name: "feat/old", reason: "merged" }]);
});

test("collectStatus marks MR unknown without gitlab and flags invalid branch on base", async () => {
  const s = await collectStatus({ git: fakeGit({ currentBranch: () => "main", unpushed: () => null }), gitlab: null });
  assert.equal(s.onBase, true);
  assert.equal(s.branchValid, false);
  assert.equal(s.type, null);
  assert.equal(s.hasUpstream, false);
  assert.equal(s.mr.state, "unknown");
  assert.deepEqual(s.cleanup, [{ name: "feat/old", reason: "merged" }]);
});

test("collectStatus reports MR lookup errors instead of throwing", async () => {
  const gitlab = fakeGitlab();
  gitlab.client.get = async (path) => {
    if (path === "/projects/t%2Fa") return { default_branch: "main" };
    throw new Error("GitLab API 500 on GET x");
  };
  const s = await collectStatus({ git: fakeGit(), gitlab });
  assert.equal(s.mr.state, "unknown");
  assert.match(s.mr.error, /500/);
});
