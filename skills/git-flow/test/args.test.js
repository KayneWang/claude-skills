import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  USAGE,
  parseBranchNameArgs,
  parseStartArgs,
  parseMrCreateArgs,
  parseDeleteArgs,
} from "../lib/args.js";

test("USAGE lists every subcommand", () => {
  for (const cmd of ["status", "base", "branch-name", "start", "push", "mr-find", "mr-create", "merged-branches", "delete-branches"]) {
    assert.match(USAGE, new RegExp(`\\b${cmd}\\b`));
  }
});

test("parseBranchNameArgs: type + jira", () => {
  assert.deepEqual(parseBranchNameArgs(["fix", "SPAR-111"]), { type: "fix", jira: "spar-111", slug: null });
});

test("parseBranchNameArgs: type + slug", () => {
  assert.deepEqual(parseBranchNameArgs(["feat", "login-remember-me"]), { type: "feat", jira: null, slug: "login-remember-me" });
});

test("parseBranchNameArgs: type + jira + slug keeps both", () => {
  assert.deepEqual(parseBranchNameArgs(["feat", "spar-2", "login-page"]), { type: "feat", jira: "spar-2", slug: "login-page" });
});

test("parseBranchNameArgs rejects unknown type with the allowed list", () => {
  assert.throws(() => parseBranchNameArgs(["feature", "x"]), /Unknown type "feature".*feat, fix, chore, refactor, docs, test/);
});

test("parseBranchNameArgs rejects bad slug and missing args", () => {
  assert.throws(() => parseBranchNameArgs(["feat", "Login Page"]), /slug/);
  assert.throws(() => parseBranchNameArgs(["feat"]), /jira key or a slug/);
  assert.throws(() => parseBranchNameArgs([]), /Usage: g\.js/);
});

test("parseStartArgs: name with optional --description", () => {
  assert.deepEqual(parseStartArgs(["feat/spar-1"]), { name: "feat/spar-1", description: null });
  assert.deepEqual(parseStartArgs(["feat/spar-1", "--description", "登录记住我"]), { name: "feat/spar-1", description: "登录记住我" });
  assert.throws(() => parseStartArgs([]), /Usage: g\.js/);
  assert.throws(() => parseStartArgs(["feat/x", "--description"]), /Missing value for --description/);
  assert.throws(() => parseStartArgs(["feat/x", "--nope", "1"]), /Unknown flag: --nope/);
});

test("parseStartArgs rejects names that don't follow <type>/<jira-or-slug>", () => {
  assert.throws(() => parseStartArgs(["feature/x"]), /Branch name "feature\/x" does not follow <type>\/<jira-or-slug>.*feat, fix, chore, refactor, docs, test/);
  assert.throws(() => parseStartArgs(["main"]), /Branch name "main" does not follow <type>\/<jira-or-slug>/);
});

test("parseMrCreateArgs: required title/description, optional assignee/target", () => {
  assert.deepEqual(
    parseMrCreateArgs(["--title", "fix: spar-1 x", "--description", "d", "--assignee", "kayne.wang", "--target", "alpha"]),
    { title: "fix: spar-1 x", description: "d", assignee: "kayne.wang", target: "alpha" }
  );
  assert.deepEqual(parseMrCreateArgs(["--title", "t", "--description", ""]), { title: "t", description: "", assignee: null, target: null });
  assert.throws(() => parseMrCreateArgs(["--description", "d"]), /--title is required/);
  assert.throws(() => parseMrCreateArgs(["--title", "t"]), /--description or --description-file is required/);
  assert.throws(() => parseMrCreateArgs(["--title", "t", "--title", "u", "--description", "d"]), /Duplicate flag: --title/);
});

test("parseMrCreateArgs: --description-file reads file content; both flags conflict", () => {
  const file = path.join(tmpdir(), `g-mr-description-test-${process.pid}.md`);
  writeFileSync(file, "line one\nline two\n");
  try {
    assert.deepEqual(parseMrCreateArgs(["--title", "t", "--description-file", file]), {
      title: "t",
      description: "line one\nline two\n",
      assignee: null,
      target: null,
    });
    assert.throws(
      () => parseMrCreateArgs(["--title", "t", "--description", "d", "--description-file", file]),
      /Use either --description or --description-file, not both/
    );
  } finally {
    rmSync(file, { force: true });
  }
});

test("parseDeleteArgs requires at least one name", () => {
  assert.deepEqual(parseDeleteArgs(["feat/a", "fix/b"]), ["feat/a", "fix/b"]);
  assert.throws(() => parseDeleteArgs([]), /at least one branch/);
});
