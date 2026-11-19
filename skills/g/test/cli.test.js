import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import path from "node:path";

const run = promisify(execFile);
const script = fileURLToPath(new URL("../g.js", import.meta.url));
const env = { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull };
delete env.GITLAB_TOKEN;
delete env.GITLAB_HOST;
delete env.GITLAB_PROJECT;

async function g(args, cwd) {
  const { stdout } = await run(process.execPath, [script, ...args], { env, cwd });
  return JSON.parse(stdout);
}

async function gFails(args, cwd) {
  try {
    await run(process.execPath, [script, ...args], { env, cwd });
    throw new Error("expected non-zero exit");
  } catch (err) {
    assert.equal(err.code, 1);
    return err.stderr;
  }
}

test("no command / unknown command print usage, not a GITLAB_TOKEN error", async () => {
  for (const args of [[], ["--help"], ["nope"]]) {
    const stderr = await gFails(args);
    assert.match(stderr, /Usage: g\.js/);
    assert.doesNotMatch(stderr, /GITLAB_TOKEN/);
  }
});

test("argument errors surface before context resolution", async () => {
  assert.match(await gFails(["branch-name", "feature", "x"]), /Unknown type "feature"/);
  assert.match(await gFails(["start"]), /Usage: g\.js/);
  assert.match(await gFails(["mr-create", "--title", "t"]), /--description or --description-file is required/);
  assert.match(await gFails(["delete-branches"]), /at least one branch/);
});

// ---- end-to-end in git mode (no token) against a temp bare origin ----

function sh(cwd, args) {
  return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function setupRepo() {
  const root = mkdtempSync(path.join(tmpdir(), "g-"));
  const origin = path.join(root, "origin.git");
  const work = path.join(root, "work");
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--bare", origin], { env, stdio: "ignore" });
  execFileSync("git", ["-c", "init.defaultBranch=main", "clone", origin, work], { env, stdio: "ignore" });
  sh(work, ["config", "user.email", "t@example.com"]);
  sh(work, ["config", "user.name", "t"]);
  writeFileSync(path.join(work, "README.md"), "hi\n");
  sh(work, ["add", "."]);
  sh(work, ["commit", "-m", "init"]);
  sh(work, ["push", "-u", "origin", "main"]);
  sh(work, ["remote", "set-head", "origin", "-a"]);
  return { root, work };
}

test("start --from branches off origin/<from> instead of the base branch", async (t) => {
  const { root, work } = setupRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  sh(work, ["switch", "-c", "develop"]);
  writeFileSync(path.join(work, "dev.txt"), "dev\n");
  sh(work, ["add", "."]);
  sh(work, ["commit", "-m", "chore: dev only"]);
  sh(work, ["push", "-u", "origin", "develop"]);
  sh(work, ["switch", "main"]);

  assert.deepEqual(await g(["start", "feat/demo-2", "--from", "develop"], work), { name: "feat/demo-2", base: "develop", description: null });
  assert.equal(sh(work, ["branch", "--show-current"]), "feat/demo-2");
  assert.equal(sh(work, ["rev-parse", "HEAD"]), sh(work, ["rev-parse", "origin/develop"]));

  assert.match(await gFails(["start", "feat/demo-3", "--from", "nope"], work), /Source branch "nope" does not exist on origin/);
  assert.equal(sh(work, ["branch", "--show-current"]), "feat/demo-2");

  // The source branch is recorded and becomes this branch's base for base / push / status.
  assert.equal(sh(work, ["config", "--get", "branch.feat/demo-2.g-base"]), "develop");
  assert.deepEqual(await g(["base"], work), { base: "develop", source: "branch" });
  writeFileSync(path.join(work, "b.txt"), "b\n");
  sh(work, ["add", "."]);
  sh(work, ["commit", "-m", "feat: add b"]);
  assert.deepEqual(await g(["push"], work), { branch: "feat/demo-2", pushed: 1 });
  const status = await g(["status"], work);
  assert.deepEqual(status.base, { base: "develop", source: "branch" });
  assert.equal(status.ahead, 1);
  assert.equal(status.behind, 0);

  // Merged into develop (not main): sync's cleanup still finds it, and keeps develop itself.
  sh(work, ["switch", "develop"]);
  sh(work, ["merge", "--no-ff", "feat/demo-2", "-m", "Merge feat/demo-2"]);
  sh(work, ["push", "origin", "develop"]);
  assert.deepEqual(await g(["base"], work), { base: "main", source: "origin-head" });
  assert.deepEqual(await g(["merged-branches"], work), { base: "main", branches: [{ name: "feat/demo-2", reason: "merged" }] });
  assert.deepEqual((await g(["delete-branches", "feat/demo-2"], work)).deleted, ["feat/demo-2"]);
  // `git branch -d` drops the recorded base with the branch (get-regexp exits 1 on no match).
  assert.throws(() => sh(work, ["config", "--get-regexp", "^branch\\..*\\.g-base$"]));
});

test("git-mode lifecycle: base → branch-name → start → push → merged-branches → delete-branches", async (t) => {
  const { root, work } = setupRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.deepEqual(await g(["base"], work), { base: "main", source: "origin-head" });

  assert.deepEqual(await g(["branch-name", "feat", "DEMO-1"], work), { name: "feat/demo-1", existsLocal: false, existsRemote: false });

  assert.deepEqual(await g(["start", "feat/demo-1", "--description", "登录记住我"], work), { name: "feat/demo-1", base: "main", description: "登录记住我" });
  assert.equal(sh(work, ["branch", "--show-current"]), "feat/demo-1");
  assert.equal(sh(work, ["config", "--get", "branch.feat/demo-1.description"]), "登录记住我");

  assert.match(await gFails(["start", "feat/demo-1"], work), /already exists/);

  writeFileSync(path.join(work, "a.txt"), "a\n");
  sh(work, ["add", "."]);
  sh(work, ["commit", "-m", "feat: add a"]);
  assert.deepEqual(await g(["push"], work), { branch: "feat/demo-1", pushed: 1 });
  assert.deepEqual(await g(["branch-name", "feat", "demo-1"], work), { name: "feat/demo-1", existsLocal: true, existsRemote: true });

  const status = await g(["status"], work);
  assert.equal(status.branch, "feat/demo-1");
  assert.equal(status.type, "feat");
  assert.equal(status.jira, "demo-1");
  assert.equal(status.ahead, 1);
  assert.equal(status.unpushed, 0);
  assert.equal(status.mr.state, "unknown");

  // Simulate "merged on GitLab with source branch deleted".
  sh(work, ["switch", "main"]);
  sh(work, ["merge", "--no-ff", "feat/demo-1", "-m", "Merge feat/demo-1"]);
  sh(work, ["push", "origin", "main"]);
  sh(work, ["push", "origin", "--delete", "feat/demo-1"]);

  assert.deepEqual(await g(["merged-branches"], work), { base: "main", branches: [{ name: "feat/demo-1", reason: "merged" }] });
  const del = await g(["delete-branches", "feat/demo-1", "nope"], work);
  assert.deepEqual(del.deleted, ["feat/demo-1"]);
  assert.equal(del.failed.length, 1);
  assert.equal(del.failed[0].name, "nope");
  assert.match(del.failed[0].reason, /branch 'nope' not found/);
});

test("push refuses to run on the base branch; mr commands require a token", async (t) => {
  const { root, work } = setupRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.match(await gFails(["push"], work), /on the base branch "main"/);
  assert.match(await gFails(["mr-find"], work), /GITLAB_TOKEN is not set/);
  assert.match(await gFails(["mr-create", "--title", "t", "--description", "d"], work), /GITLAB_TOKEN is not set/);
});

test("push does not abort when origin/<base> is not a local ref", async (t) => {
  const { root, work } = setupRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  sh(work, ["switch", "-c", "feat/demo-1"]);
  writeFileSync(path.join(work, "a.txt"), "a\n");
  sh(work, ["add", "."]);
  sh(work, ["commit", "-m", "feat: add a"]);
  // Drop the local remote-tracking ref for the base branch, as if it had never been fetched.
  sh(work, ["update-ref", "-d", "refs/remotes/origin/main"]);
  assert.deepEqual(await g(["push"], work), { branch: "feat/demo-1", pushed: null });
});

test("mr-find / mr-create refuse a detached HEAD", async (t) => {
  const { root, work } = setupRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  sh(work, ["checkout", "--detach", "HEAD"]);
  assert.match(await gFails(["mr-find"], work), /Detached HEAD: switch to a branch first\./);
  assert.match(await gFails(["mr-create", "--title", "t", "--description", "d"], work), /Detached HEAD: switch to a branch first\./);
});

// ---- conflicts: merge origin/<target> into the current branch, uncommitted ----

function commitFile(work, file, content, msg) {
  writeFileSync(path.join(work, file), content);
  sh(work, ["add", "."]);
  sh(work, ["commit", "-m", msg]);
}

test("conflicts: argument errors and refusals", async (t) => {
  const { root, work } = setupRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.match(await gFails(["conflicts", "a", "b"]), /Unexpected argument: b/);
  assert.match(await gFails(["conflicts", "--rebase"]), /Unknown flag: --rebase/);

  assert.match(await gFails(["conflicts"], work), /Refusing to merge on the base branch "main"/);

  sh(work, ["switch", "-c", "feat/demo-1"]);
  assert.match(await gFails(["conflicts", "feat/demo-1"], work), /into itself/);
  assert.match(await gFails(["conflicts", "nope"], work), /"nope" does not exist on origin/);
  writeFileSync(path.join(work, "dirty.txt"), "x\n");
  assert.match(await gFails(["conflicts"], work), /uncommitted changes/);
});

test("conflicts: up to date, clean merge, then conflicts tagged by kind / binary / lockfile", async (t) => {
  const { root, work } = setupRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  commitFile(work, "shared.txt", "base\n", "chore: shared");
  commitFile(work, "gone.txt", "keep\n", "chore: gone");
  commitFile(work, "package-lock.json", "{}\n", "chore: lock");
  commitFile(work, "logo.bin", Buffer.from([0, 1, 2, 3]), "chore: bin");
  sh(work, ["push", "origin", "main"]);
  assert.equal((await g(["start", "feat/demo-1"], work)).base, "main");

  assert.deepEqual(await g(["conflicts"], work), { target: "main", resumed: false, merged: 0, upToDate: true, conflicts: [] });

  // Clean: main gains an unrelated file → merge staged, not committed.
  sh(work, ["switch", "main"]);
  commitFile(work, "other.txt", "o\n", "chore: other");
  sh(work, ["push", "origin", "main"]);
  sh(work, ["switch", "feat/demo-1"]);
  commitFile(work, "mine.txt", "m\n", "feat: mine");
  assert.deepEqual(await g(["conflicts"], work), { target: "main", resumed: false, merged: 1, upToDate: false, conflicts: [] });
  assert.equal(sh(work, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]), sh(work, ["rev-parse", "origin/main"]));
  sh(work, ["commit", "--no-edit"]);

  // Conflicting: both sides edit shared / lock / bin; main deletes gone.txt while the branch edits it.
  sh(work, ["switch", "main"]);
  writeFileSync(path.join(work, "shared.txt"), "theirs\n");
  writeFileSync(path.join(work, "package-lock.json"), '{"a":1}\n');
  writeFileSync(path.join(work, "logo.bin"), Buffer.from([0, 9, 9, 9]));
  sh(work, ["rm", "-q", "gone.txt"]);
  sh(work, ["add", "."]);
  sh(work, ["commit", "-m", "chore: theirs"]);
  sh(work, ["push", "origin", "main"]);
  sh(work, ["switch", "feat/demo-1"]);
  writeFileSync(path.join(work, "shared.txt"), "ours\n");
  writeFileSync(path.join(work, "package-lock.json"), '{"b":2}\n');
  writeFileSync(path.join(work, "logo.bin"), Buffer.from([0, 7, 7, 7]));
  writeFileSync(path.join(work, "gone.txt"), "edited\n");
  sh(work, ["add", "."]);
  sh(work, ["commit", "-m", "feat: ours"]);

  const res = await g(["conflicts"], work);
  assert.equal(res.merged, 1);
  const byPath = Object.fromEntries(res.conflicts.map((c) => [c.path, c]));
  assert.deepEqual(byPath["shared.txt"], { path: "shared.txt", kind: "both-modified", binary: false, lockfile: false });
  assert.deepEqual(byPath["package-lock.json"], { path: "package-lock.json", kind: "both-modified", binary: false, lockfile: true });
  assert.deepEqual(byPath["logo.bin"], { path: "logo.bin", kind: "both-modified", binary: true, lockfile: false });
  assert.deepEqual(byPath["gone.txt"], { path: "gone.txt", kind: "deleted-by-them", binary: false, lockfile: false });

  // Re-running mid-merge resumes instead of refusing the dirty tree.
  const again = await g(["conflicts"], work);
  assert.equal(again.resumed, true);
  assert.equal(again.conflicts.length, 4);
});
