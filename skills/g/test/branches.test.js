import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TYPES,
  isJiraKey,
  isValidSlug,
  buildBranchName,
  parseBranch,
  computeMergedBranches,
} from "../lib/branches.js";

test("TYPES is the fixed team list", () => {
  assert.deepEqual(TYPES, ["feat", "fix", "chore", "refactor", "docs", "test"]);
});

test("isJiraKey accepts PROJ-123 in any case, rejects others", () => {
  assert.equal(isJiraKey("demo-111"), true);
  assert.equal(isJiraKey("DEMO-111"), true);
  assert.equal(isJiraKey("spar111"), false);
  assert.equal(isJiraKey("demo-"), false);
  assert.equal(isJiraKey("login-page"), false);
  assert.equal(isJiraKey(""), false);
});

test("isValidSlug enforces kebab-case ascii", () => {
  assert.equal(isValidSlug("login-remember-me"), true);
  assert.equal(isValidSlug("upgrade-vite6"), true);
  assert.equal(isValidSlug("Login-Page"), false);
  assert.equal(isValidSlug("login--page"), false);
  assert.equal(isValidSlug("-login"), false);
  assert.equal(isValidSlug("登录"), false);
});

test("buildBranchName prefers jira (lowercased) over slug", () => {
  assert.equal(buildBranchName({ type: "fix", jira: "DEMO-111", slug: null }), "fix/demo-111");
  assert.equal(buildBranchName({ type: "feat", jira: null, slug: "login-remember-me" }), "feat/login-remember-me");
  assert.equal(buildBranchName({ type: "feat", jira: "demo-2", slug: "ignored" }), "feat/demo-2");
});

test("parseBranch splits type and detects jira", () => {
  assert.deepEqual(parseBranch("fix/demo-111"), { type: "fix", jira: "demo-111", slug: "demo-111" });
  assert.deepEqual(parseBranch("feat/login-page"), { type: "feat", jira: null, slug: "login-page" });
  assert.equal(parseBranch("main"), null);
  assert.equal(parseBranch("feature/x"), null);
  assert.equal(parseBranch("feat/"), null);
});

test("computeMergedBranches unions merged and gone, excludes base and current", () => {
  const out = computeMergedBranches({
    merged: ["main", "feat/a", "fix/b"],
    tracked: [
      { name: "main", track: "" },
      { name: "feat/a", track: "[gone]" },
      { name: "fix/b", track: "" },
      { name: "chore/c", track: "[gone]" },
      { name: "feat/wip", track: "[ahead 2]" },
    ],
    base: "main",
    current: "fix/b",
  });
  assert.deepEqual(out, [
    { name: "feat/a", reason: "merged" },
    { name: "chore/c", reason: "gone" },
  ]);
});
