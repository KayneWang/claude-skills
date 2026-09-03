import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRemote, resolveContext, createClient } from "../lib/gitlab-api.js";

function stubFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const r = responses.shift();
    if (r.throw) throw r.throw;
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

test("parseRemote handles https, scp ssh, ssh://, and rejects junk", () => {
  assert.deepEqual(parseRemote("https://gitlab.com/team/app.git"), { protocol: "https", host: "gitlab.com", projectPath: "team/app" });
  assert.deepEqual(parseRemote("http://gitlab.internal/team/app"), { protocol: "http", host: "gitlab.internal", projectPath: "team/app" });
  assert.deepEqual(parseRemote("git@gitlab.corp.com:team/sub/app.git"), { protocol: "https", host: "gitlab.corp.com", projectPath: "team/sub/app" });
  assert.deepEqual(parseRemote("ssh://git@gitlab.corp.com:2222/team/app.git"), { protocol: "https", host: "gitlab.corp.com", projectPath: "team/app" });
  assert.equal(parseRemote("not a url"), null);
  assert.equal(parseRemote(null), null);
});

test("resolveContext requires GITLAB_TOKEN", () => {
  assert.throws(() => resolveContext({ env: {}, remoteUrl: "https://gitlab.com/t/a.git" }), /GITLAB_TOKEN is not set/);
});

test("resolveContext parses remote and honors overrides", () => {
  assert.deepEqual(resolveContext({ env: { GITLAB_TOKEN: "t" }, remoteUrl: "git@gitlab.com:t/a.git" }), { token: "t", protocol: "https", host: "gitlab.com", projectPath: "t/a" });
  assert.deepEqual(
    resolveContext({ env: { GITLAB_TOKEN: "t", GITLAB_HOST: "http://gl.internal", GITLAB_PROJECT: "x/y" }, remoteUrl: null }),
    { token: "t", protocol: "http", host: "gl.internal", projectPath: "x/y" }
  );
});

test("resolveContext rejects non-GitLab hosts and unresolvable remotes", () => {
  assert.throws(() => resolveContext({ env: { GITLAB_TOKEN: "t" }, remoteUrl: "git@github.com:a/b.git" }), /not a GitLab host/);
  assert.throws(() => resolveContext({ env: { GITLAB_TOKEN: "t" }, remoteUrl: null }), /Cannot resolve a GitLab project/);
});

test("get builds v4 url with PRIVATE-TOKEN header and params", async () => {
  const f = stubFetch([{ status: 200, body: { id: 7 } }]);
  const client = createClient({ host: "gitlab.example.com", token: "tok", fetchImpl: f });
  assert.deepEqual(await client.get("/user", { a: "b" }), { id: 7 });
  assert.equal(f.calls[0].url, "https://gitlab.example.com/api/v4/user?a=b");
  assert.equal(f.calls[0].init.headers["PRIVATE-TOKEN"], "tok");
});

test("post sends JSON body over the chosen protocol", async () => {
  const f = stubFetch([{ status: 201, body: { iid: 1 } }]);
  const client = createClient({ host: "gl.internal", token: "t", protocol: "http", fetchImpl: f });
  assert.deepEqual(await client.post("/projects/1/merge_requests", { title: "x" }), { iid: 1 });
  assert.equal(f.calls[0].url, "http://gl.internal/api/v4/projects/1/merge_requests");
  assert.equal(f.calls[0].init.method, "POST");
  assert.equal(f.calls[0].init.body, JSON.stringify({ title: "x" }));
});

test("401 maps to a token error; other statuses include method/path/detail", async () => {
  const f = stubFetch([{ status: 401, body: { message: "401 Unauthorized" } }, { status: 409, body: { message: ["Another open merge request already exists"] } }]);
  const client = createClient({ host: "h", token: "t", fetchImpl: f });
  await assert.rejects(client.get("/user"), /GitLab API 401: token is invalid or expired/);
  await assert.rejects(client.post("/p", {}), /GitLab API 409 on POST \/p: .*Another open merge request/);
});

test("network failure surfaces the cause and a hint", async () => {
  const err = new TypeError("fetch failed");
  err.cause = { code: "ENOTFOUND" };
  const f = stubFetch([{ throw: err }]);
  const client = createClient({ host: "nope.internal", token: "t", fetchImpl: f });
  await assert.rejects(client.get("/user"), /Request to https:\/\/nope\.internal failed: fetch failed \(ENOTFOUND\).*GITLAB_HOST/);
});

test("429 is retried once after retry-after", async () => {
  const f = stubFetch([{ status: 429, headers: { "retry-after": "0" } }, { status: 200, body: { ok: true } }]);
  const client = createClient({ host: "h", token: "t", fetchImpl: f });
  assert.deepEqual(await client.get("/x"), { ok: true });
  assert.equal(f.calls.length, 2);
});
