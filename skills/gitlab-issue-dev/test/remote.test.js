import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRemote, resolveContext } from "../lib/remote.js";

test("parses https remote with .git suffix and subgroup", () => {
  assert.deepEqual(parseRemote("https://gitlab.example.com/group/sub/repo.git"), {
    host: "gitlab.example.com",
    projectPath: "group/sub/repo",
  });
});

test("parses https remote without .git and with credentials", () => {
  assert.deepEqual(parseRemote("https://oauth2@gitlab.com/group/repo"), {
    host: "gitlab.com",
    projectPath: "group/repo",
  });
});

test("parses scp-style ssh remote", () => {
  assert.deepEqual(parseRemote("git@gitlab.example.com:group/repo.git"), {
    host: "gitlab.example.com",
    projectPath: "group/repo",
  });
});

test("parses ssh:// remote with port", () => {
  assert.deepEqual(parseRemote("ssh://git@gitlab.example.com:2222/group/repo.git"), {
    host: "gitlab.example.com",
    projectPath: "group/repo",
  });
});

test("returns null for unparseable url", () => {
  assert.equal(parseRemote("not a url"), null);
  assert.equal(parseRemote(null), null);
});

test("resolveContext throws without GITLAB_TOKEN", () => {
  assert.throws(
    () => resolveContext({ env: {}, remoteUrl: "git@gitlab.com:g/r.git" }),
    /GITLAB_TOKEN/
  );
});

test("resolveContext resolves from remote url", () => {
  const ctx = resolveContext({
    env: { GITLAB_TOKEN: "tok" },
    remoteUrl: "git@gitlab.example.com:group/repo.git",
  });
  assert.deepEqual(ctx, { token: "tok", host: "gitlab.example.com", projectPath: "group/repo" });
});

test("env overrides beat the parsed remote", () => {
  const ctx = resolveContext({
    env: { GITLAB_TOKEN: "tok", GITLAB_HOST: "gl.corp.com", GITLAB_PROJECT: "team/app" },
    remoteUrl: "https://github.com/other/repo.git",
  });
  assert.deepEqual(ctx, { token: "tok", host: "gl.corp.com", projectPath: "team/app" });
});

test("resolveContext throws when remote unresolvable and no overrides", () => {
  assert.throws(
    () => resolveContext({ env: { GITLAB_TOKEN: "tok" }, remoteUrl: null }),
    /GITLAB_HOST/
  );
});

test("resolveContext throws for github.com remote (not a GitLab host)", () => {
  assert.throws(
    () =>
      resolveContext({
        env: { GITLAB_TOKEN: "tok" },
        remoteUrl: "git@github.com:g/r.git",
      }),
    /not a GitLab host/
  );
});

test("resolveContext succeeds when GITLAB_HOST override points elsewhere", () => {
  const ctx = resolveContext({
    env: { GITLAB_TOKEN: "tok", GITLAB_HOST: "gitlab.corp.com", GITLAB_PROJECT: "team/app" },
    remoteUrl: "https://github.com/g/r.git",
  });
  assert.deepEqual(ctx, { token: "tok", host: "gitlab.corp.com", projectPath: "team/app" });
});
