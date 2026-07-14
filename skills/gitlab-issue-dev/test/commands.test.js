import { test } from "node:test";
import assert from "node:assert/strict";
import { listMyIssues, getIssue } from "../lib/commands.js";

// Fake client: route → canned response, records requested paths.
function fakeClient(routes) {
  const seen = [];
  const lookup = (path) => {
    seen.push(path);
    if (!(path in routes)) throw new Error(`unexpected path: ${path}`);
    return routes[path];
  };
  return {
    seen,
    get: async (path, params) => lookup(path, params),
    getAll: async (path, params) => lookup(path, params),
    post: async (path, body) => lookup(path, body),
  };
}

test("listMyIssues filters by the token owner's id and trims descriptions", async () => {
  const client = fakeClient({
    "/user": { id: 42 },
    "/projects/group%2Frepo/issues": [
      { iid: 5, title: "Add login", labels: ["feature"], description: "x".repeat(300), web_url: "https://gl/5" },
      { iid: 6, title: "No description", labels: [], description: null, web_url: "https://gl/6" },
    ],
  });
  const out = await listMyIssues(client, "group/repo");
  assert.equal(out.length, 2);
  assert.equal(out[0].summary.length, 200);
  assert.equal(out[1].summary, "");
  assert.deepEqual(out[0], {
    iid: 5, title: "Add login", labels: ["feature"], summary: "x".repeat(200), web_url: "https://gl/5",
  });
});

test("getIssue merges detail, non-system notes, and related MRs", async () => {
  const client = fakeClient({
    "/projects/g%2Fr/issues/5": {
      iid: 5, title: "T", description: "D", labels: ["bug"], web_url: "https://gl/5",
    },
    "/projects/g%2Fr/issues/5/notes": [
      { system: true, body: "changed milestone", author: { username: "bot" } },
      { system: false, body: "please also handle X", author: { username: "pm" } },
    ],
    "/projects/g%2Fr/issues/5/related_merge_requests": [
      { iid: 9, title: "old attempt", state: "closed", web_url: "https://gl/mr/9" },
    ],
  });
  const out = await getIssue(client, "g/r", 5);
  assert.deepEqual(out.comments, [{ author: "pm", body: "please also handle X" }]);
  assert.deepEqual(out.relatedMrs, [{ iid: 9, title: "old attempt", state: "closed", web_url: "https://gl/mr/9" }]);
  assert.equal(out.labels[0], "bug");
});
