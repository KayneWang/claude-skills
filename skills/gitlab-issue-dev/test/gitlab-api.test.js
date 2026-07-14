import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "../lib/gitlab-api.js";

// Minimal fetch stub: script an array of responses, record calls.
function stubFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const r = responses.shift();
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => (r.body === undefined ? "" : JSON.stringify(r.body)),
      headers: { get: (k) => r.headers?.[k.toLowerCase()] ?? null },
    };
  };
  fn.calls = calls;
  return fn;
}

test("get builds v4 url with PRIVATE-TOKEN header and params", async () => {
  const f = stubFetch([{ status: 200, body: { id: 7 } }]);
  const client = createClient({ host: "gitlab.example.com", token: "tok", fetchImpl: f });
  const me = await client.get("/user", { a: "b" });
  assert.deepEqual(me, { id: 7 });
  assert.equal(f.calls[0].url, "https://gitlab.example.com/api/v4/user?a=b");
  assert.equal(f.calls[0].init.headers["PRIVATE-TOKEN"], "tok");
});

test("post sends JSON body", async () => {
  const f = stubFetch([{ status: 201, body: { iid: 1 } }]);
  const client = createClient({ host: "h.com", token: "t", fetchImpl: f });
  const out = await client.post("/projects/1/merge_requests", { title: "x" });
  assert.deepEqual(out, { iid: 1 });
  assert.equal(f.calls[0].init.method, "POST");
  assert.equal(f.calls[0].init.body, JSON.stringify({ title: "x" }));
});

test("getAll follows x-next-page", async () => {
  const f = stubFetch([
    { status: 200, body: [1, 2], headers: { "x-next-page": "2" } },
    { status: 200, body: [3], headers: { "x-next-page": "" } },
  ]);
  const client = createClient({ host: "h.com", token: "t", fetchImpl: f });
  assert.deepEqual(await client.getAll("/items"), [1, 2, 3]);
  assert.match(f.calls[0].url, /per_page=100/);
  assert.match(f.calls[1].url, /page=2/);
});

test("401 throws a token-specific error", async () => {
  const f = stubFetch([{ status: 401, body: { message: "401 Unauthorized" } }]);
  const client = createClient({ host: "h.com", token: "bad", fetchImpl: f });
  await assert.rejects(() => client.get("/user"), /token is invalid or expired/);
});

test("other errors surface status and API message", async () => {
  const f = stubFetch([{ status: 409, body: { message: ["Another open merge request already exists"] } }]);
  const client = createClient({ host: "h.com", token: "t", fetchImpl: f });
  await assert.rejects(() => client.post("/x", {}), /409.*Another open merge request/);
});
