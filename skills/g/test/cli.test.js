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
