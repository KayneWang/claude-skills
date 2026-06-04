import { test } from "node:test";
import assert from "node:assert/strict";
import { hashFile } from "../lib/detect.js";

test("same bytes -> same hash", () => {
  assert.equal(hashFile(Buffer.from("abc")), hashFile(Buffer.from("abc")));
});

test("different bytes -> different hash", () => {
  assert.notEqual(hashFile(Buffer.from("abc")), hashFile(Buffer.from("abd")));
});

test("returns 64-char hex sha256", () => {
  const h = hashFile(Buffer.from("abc"));
  assert.match(h, /^[0-9a-f]{64}$/);
});
