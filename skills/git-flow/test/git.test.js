import { test } from "node:test";
import assert from "node:assert/strict";
import { createGit } from "../lib/git.js";

// script: array of { out } or { fail: "stderr text" }; calls records argv arrays.
function fakeExec(script) {
  const calls = [];
  const exec = (args) => {
    calls.push(args);
    const r = script.shift() ?? { out: "" };
    if (r.fail !== undefined) throw new Error(`git ${args.join(" ")} failed: ${r.fail}`);
    return r.out;
  };
  exec.calls = calls;
  return exec;
}

test("currentBranch and remoteUrl", () => {
  const exec = fakeExec([{ out: "feat/spar-1\n" }, { out: "git@gitlab.com:t/a.git\n" }]);
  const git = createGit({ exec });
  assert.equal(git.currentBranch(), "feat/spar-1");
  assert.equal(git.remoteUrl(), "git@gitlab.com:t/a.git");
  assert.deepEqual(exec.calls[0], ["branch", "--show-current"]);
  assert.deepEqual(exec.calls[1], ["remote", "get-url", "origin"]);
});

test("remoteUrl returns null when there is no origin", () => {
  const git = createGit({ exec: fakeExec([{ fail: "No such remote 'origin'" }]) });
  assert.equal(git.remoteUrl(), null);
});

test("statusPorcelain counts staged/unstaged/untracked", () => {
  const out = "M  a.js\n M b.js\nMM c.js\n?? new.txt\nA  d.js\n";
  const git = createGit({ exec: fakeExec([{ out }]) });
  assert.deepEqual(git.statusPorcelain(), { clean: false, staged: 3, unstaged: 2, untracked: 1 });
  assert.deepEqual(createGit({ exec: fakeExec([{ out: "" }]) }).statusPorcelain(), { clean: true, staged: 0, unstaged: 0, untracked: 0 });
});

test("originHead strips the origin/ prefix and returns null when unset", () => {
  assert.equal(createGit({ exec: fakeExec([{ out: "origin/main\n" }]) }).originHead(), "main");
  assert.equal(createGit({ exec: fakeExec([{ fail: "ref refs/remotes/origin/HEAD is not a symbolic ref" }]) }).originHead(), null);
});

test("aheadBehind parses left-right count against origin/<base>", () => {
  const exec = fakeExec([{ out: "2\t5\n" }]);
  const git = createGit({ exec });
  assert.deepEqual(git.aheadBehind("main"), { behind: 2, ahead: 5 });
  assert.deepEqual(exec.calls[0], ["rev-list", "--left-right", "--count", "origin/main...HEAD"]);
  assert.equal(createGit({ exec: fakeExec([{ fail: "unknown revision" }]) }).aheadBehind("main"), null);
});

test("unpushed is null without upstream", () => {
  assert.equal(createGit({ exec: fakeExec([{ out: "3\n" }]) }).unpushed(), 3);
  assert.equal(createGit({ exec: fakeExec([{ fail: "no upstream configured" }]) }).unpushed(), null);
});

test("branch existence checks", () => {
  const exec = fakeExec([{ out: "abc123\n" }, { fail: "" }, { out: "abc\trefs/heads/feat/x\n" }, { out: "" }]);
  const git = createGit({ exec });
  assert.equal(git.localBranchExists("feat/x"), true);
  assert.equal(git.localBranchExists("feat/y"), false);
  assert.equal(git.remoteBranchExists("feat/x"), true);
  assert.equal(git.remoteBranchExists("feat/y"), false);
  assert.deepEqual(exec.calls[0], ["rev-parse", "--verify", "--quiet", "refs/heads/feat/x"]);
  assert.deepEqual(exec.calls[2], ["ls-remote", "--heads", "origin", "feat/x"]);
});

test("switchCreate, setDescription", () => {
  const exec = fakeExec([{ out: "" }, { out: "" }]);
  const git = createGit({ exec });
  git.switchCreate("feat/spar-1", "origin/main");
  git.setDescription("feat/spar-1", "登录记住我");
  assert.deepEqual(exec.calls[0], ["switch", "-c", "feat/spar-1", "origin/main"]);
  assert.deepEqual(exec.calls[1], ["config", "branch.feat/spar-1.description", "登录记住我"]);
});

test("push rewraps non-fast-forward rejection", () => {
  const exec = fakeExec([{ fail: "! [rejected] feat/x -> feat/x (fetch first)\nerror: failed to push some refs" }]);
  const git = createGit({ exec });
  assert.throws(() => git.push("feat/x"), /Push rejected: origin\/feat\/x has commits you don't have locally/);
  assert.deepEqual(exec.calls[0], ["push", "-u", "origin", "feat/x"]);
});

test("listMerged and listTracked parse for-each-ref style output", () => {
  const exec = fakeExec([{ out: "main\nfeat/a\n" }, { out: "main\t\nfeat/a\t[gone]\nfeat/b\t[ahead 1]\n" }]);
  const git = createGit({ exec });
  assert.deepEqual(git.listMerged("main"), ["main", "feat/a"]);
  assert.deepEqual(git.listTracked(), [
    { name: "main", track: "" },
    { name: "feat/a", track: "[gone]" },
    { name: "feat/b", track: "[ahead 1]" },
  ]);
  assert.deepEqual(exec.calls[0], ["branch", "--merged", "origin/main", "--format=%(refname:short)"]);
  assert.deepEqual(exec.calls[1], ["for-each-ref", "--format=%(refname:short)\t%(upstream:track)", "refs/heads"]);
});

test("deleteBranch surfaces git's reason", () => {
  const git = createGit({ exec: fakeExec([{ fail: "error: The branch 'feat/x' is not fully merged." }]) });
  assert.throws(() => git.deleteBranch("feat/x"), /not fully merged/);
});

test("fetchPrune swallows failures, fetchBranch does not", () => {
  const git = createGit({ exec: fakeExec([{ fail: "Could not resolve host" }, { fail: "Could not resolve host" }]) });
  assert.doesNotThrow(() => git.fetchPrune());
  assert.throws(() => git.fetchBranch("main"), /Could not resolve host/);
});
