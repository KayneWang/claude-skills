import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBase, collectStatus } from "../lib/status.js";

function fakeGit(over = {}) {
  return {
    fetchPrune() {},
    originHead: () => "main",
    currentBranch: () => "fix/demo-1",
    statusPorcelain: () => ({ clean: true, staged: 0, unstaged: 0, untracked: 0 }),
    aheadBehind: () => ({ ahead: 2, behind: 0 }),
    unpushed: () => 2,
    listMerged: () => ["main", "feat/old"],
    listTracked: () => [
      { name: "main", track: "" },
      { name: "feat/old", track: "[gone]" },
      { name: "fix/demo-1", track: "[ahead 2]" },
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
    mrs: [{ iid: 7, web_url: "u7", state: "opened", target_branch: "main", source_branch: "fix/demo-1" }],
  });
  const s = await collectStatus({ git: fakeGit(), gitlab });
  assert.deepEqual(s.base, { base: "main", source: "gitlab" });
  assert.equal(s.branch, "fix/demo-1");
  assert.equal(s.onBase, false);
  assert.equal(s.branchValid, true);
  assert.equal(s.type, "fix");
  assert.equal(s.jira, "demo-1");
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

// ---- advice: the deterministic "建议" lines of the /g panel ----

import { computeAdvice } from "../lib/status.js";

const clean = { clean: true, staged: 0, unstaged: 0, untracked: 0 };
const dirty = { clean: false, staged: 1, unstaged: 0, untracked: 0 };
const baseline = { base: { base: "main" }, onBase: false, branchValid: true, status: clean, ahead: 0, hasUpstream: true, unpushed: 0, mr: { state: "unknown" }, cleanup: [] };

test("computeAdvice: nothing applies → 一切就绪", () => {
  assert.deepEqual(computeAdvice(baseline), ["一切就绪"]);
});

test("computeAdvice: dirty tree on base → start first, then commit", () => {
  assert.deepEqual(computeAdvice({ ...baseline, onBase: true, branchValid: false, status: dirty }), [
    "先 /g start <type> ... 开分支，不要在 main 上直接提交",
    "/g commit 提交并推送",
  ]);
});

test("computeAdvice: invalid branch name off base", () => {
  assert.deepEqual(computeAdvice({ ...baseline, branchValid: false }), [
    "分支名不符合 type/xxx 规范，建议 /g start 新开分支后 cherry-pick",
  ]);
});

test("computeAdvice: clean with unpushed commits → ship or push depending on MR", () => {
  assert.deepEqual(computeAdvice({ ...baseline, unpushed: 2, mr: { state: "none" } }), ["/g ship <assignee> 创建 MR"]);
  assert.deepEqual(computeAdvice({ ...baseline, unpushed: 2, mr: { state: "opened" } }), ["/g commit 推送本地 commit"]);
  // no upstream yet but ahead of base counts as unpushed
  assert.deepEqual(computeAdvice({ ...baseline, hasUpstream: false, unpushed: null, ahead: 1, mr: { state: "none" } }), ["/g ship <assignee> 创建 MR"]);
  // unknown MR state (no token): still nudge to ship
  assert.deepEqual(computeAdvice({ ...baseline, unpushed: 2 }), ["/g ship <assignee> 创建 MR"]);
});

test("computeAdvice: unpushed commits on base never suggest ship (ship refuses on base)", () => {
  assert.deepEqual(computeAdvice({ ...baseline, onBase: true, branchValid: false, unpushed: 2 }), ["一切就绪"]);
});

test("computeAdvice: merged MR and cleanup list → sync", () => {
  assert.deepEqual(computeAdvice({ ...baseline, mr: { state: "merged" }, cleanup: [{ name: "feat/old", reason: "merged" }] }), [
    "/g sync 回到 main 并清理",
    "/g sync 会自动删除上面的待清理分支",
  ]);
});

test("collectStatus includes advice", async () => {
  const s = await collectStatus({ git: fakeGit(), gitlab: null });
  assert.ok(Array.isArray(s.advice) && s.advice.length > 0);
});
