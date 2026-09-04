import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMrTitle, projectId, getDefaultBranch, findMr, resolveUserId, createMr, ensureMr } from "../lib/mr.js";

function stubClient(gets = [], posts = []) {
  const calls = { get: [], post: [] };
  return {
    calls,
    async get(path, params) {
      calls.get.push({ path, params });
      return gets.shift();
    },
    async post(path, body) {
      calls.post.push({ path, body });
      return posts.shift();
    },
  };
}

test("buildMrTitle with and without jira", () => {
  assert.equal(buildMrTitle({ type: "fix", jira: "demo-111", description: "修复登录" }), "fix: demo-111 修复登录");
  assert.equal(buildMrTitle({ type: "chore", jira: null, description: "升级 vite 到 6" }), "chore: 升级 vite 到 6");
});

test("projectId url-encodes the path", () => {
  assert.equal(projectId("team/sub/app"), "team%2Fsub%2Fapp");
});

test("getDefaultBranch reads the project", async () => {
  const c = stubClient([{ default_branch: "develop" }]);
  assert.equal(await getDefaultBranch(c, "t/a"), "develop");
  assert.equal(c.calls.get[0].path, "/projects/t%2Fa");
});

test("findMr prefers opened over merged, returns null when none", async () => {
  const c = stubClient([
    [
      { iid: 3, web_url: "u3", state: "merged", target_branch: "main" },
      { iid: 5, web_url: "u5", state: "opened", target_branch: "alpha" },
    ],
    [{ iid: 3, web_url: "u3", state: "merged", target_branch: "main" }],
    [],
  ]);
  assert.deepEqual(await findMr(c, "t/a", "fix/x"), { iid: 5, web_url: "u5", state: "opened", target_branch: "alpha" });
  assert.deepEqual(await findMr(c, "t/a", "fix/x"), { iid: 3, web_url: "u3", state: "merged", target_branch: "main" });
  assert.equal(await findMr(c, "t/a", "fix/x"), null);
  assert.equal(c.calls.get[0].path, "/projects/t%2Fa/merge_requests");
  assert.deepEqual(c.calls.get[0].params, { source_branch: "fix/x", state: "all", order_by: "updated_at", sort: "desc", per_page: 20 });
});

test("resolveUserId returns the id or throws not found", async () => {
  const c = stubClient([[{ id: 42, username: "jane.doe" }], []]);
  assert.equal(await resolveUserId(c, "jane.doe"), 42);
  assert.equal(c.calls.get[0].path, "/users");
  assert.deepEqual(c.calls.get[0].params, { username: "jane.doe" });
  await assert.rejects(resolveUserId(c, "ghost"), /GitLab user "ghost" not found/);
});

test("createMr posts the full payload and returns iid + url", async () => {
  const c = stubClient([], [{ iid: 9, web_url: "https://gl/mr/9", state: "opened" }]);
  const out = await createMr(c, "t/a", {
    sourceBranch: "fix/demo-1",
    targetBranch: "main",
    title: "fix: demo-1 x",
    description: "desc",
    assigneeId: 42,
  });
  assert.deepEqual(out, { iid: 9, web_url: "https://gl/mr/9" });
  assert.equal(c.calls.post[0].path, "/projects/t%2Fa/merge_requests");
  assert.deepEqual(c.calls.post[0].body, {
    source_branch: "fix/demo-1",
    target_branch: "main",
    title: "fix: demo-1 x",
    description: "desc",
    remove_source_branch: true,
    assignee_ids: [42],
  });
});

test("createMr omits assignee_ids when no assignee", async () => {
  const c = stubClient([], [{ iid: 1, web_url: "u" }]);
  await createMr(c, "t/a", { sourceBranch: "s", targetBranch: "main", title: "t", description: "" });
  assert.equal("assignee_ids" in c.calls.post[0].body, false);
});

test("ensureMr returns the opened MR instead of creating a second one", async () => {
  const c = stubClient([[{ iid: 5, web_url: "u5", state: "opened", target_branch: "main" }]]);
  const r = await ensureMr(c, "t/a", { sourceBranch: "fix/x", targetBranch: "main", title: "t", description: "d", assigneeId: null });
  assert.deepEqual(r, { iid: 5, web_url: "u5", existing: true });
  assert.equal(c.calls.post.length, 0);
});

test("ensureMr creates when none is open", async () => {
  const c = stubClient([[]], [{ iid: 9, web_url: "u9" }]);
  const r = await ensureMr(c, "t/a", { sourceBranch: "fix/x", targetBranch: "main", title: "t", description: "d", assigneeId: 3 });
  assert.deepEqual(r, { iid: 9, web_url: "u9", existing: false });
  assert.deepEqual(c.calls.post[0].body.assignee_ids, [3]);
});

test("ensureMr recovers from a 409 race by re-finding the MR", async () => {
  const c = stubClient([[], [{ iid: 6, web_url: "u6", state: "opened", target_branch: "main" }]]);
  c.post = async () => {
    const err = new Error("GitLab API 409 on POST x: Another open merge request already exists");
    err.status = 409;
    throw err;
  };
  const r = await ensureMr(c, "t/a", { sourceBranch: "fix/x", targetBranch: "main", title: "t", description: "d", assigneeId: null });
  assert.deepEqual(r, { iid: 6, web_url: "u6", existing: true });
});
