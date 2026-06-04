import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScreenUrl } from "../lib/parse-url.js";

test("parses project + screen id", () => {
  const r = parseScreenUrl("https://app.zeplin.io/project/abc123/screen/def456");
  assert.deepEqual(r, { projectId: "abc123", screenId: "def456", versionId: null });
});
test("parses optional version id", () => {
  const r = parseScreenUrl("https://app.zeplin.io/project/abc123/screen/def456/version/v789");
  assert.deepEqual(r, { projectId: "abc123", screenId: "def456", versionId: "v789" });
});
test("ignores query and hash", () => {
  const r = parseScreenUrl("https://app.zeplin.io/project/abc/screen/xyz?foo=1#bar");
  assert.deepEqual(r, { projectId: "abc", screenId: "xyz", versionId: null });
});
test("throws on unrecognized url", () => {
  assert.throws(() => parseScreenUrl("https://app.zeplin.io/project/abc"), /Could not parse/);
});
