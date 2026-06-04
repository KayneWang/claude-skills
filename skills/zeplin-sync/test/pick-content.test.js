import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBestContent } from "../lib/pick-content.js";

test("prefers svg when present", () => {
  const r = pickBestContent([
    { format: "png", density: 2, url: "p2" },
    { format: "svg", density: 1, url: "svg" },
  ]);
  assert.deepEqual(r, { format: "svg", density: 1, url: "svg" });
});

test("no svg: picks @2x over @1x and @3x", () => {
  const r = pickBestContent([
    { format: "png", density: 1, url: "p1" },
    { format: "png", density: 3, url: "p3" },
    { format: "png", density: 2, url: "p2" },
  ]);
  assert.equal(r.density, 2);
});

test("no svg, no @2x: prefers @3x over @1x", () => {
  const r = pickBestContent([
    { format: "png", density: 1, url: "p1" },
    { format: "png", density: 3, url: "p3" },
  ]);
  assert.equal(r.density, 3);
});

test("only @1x available", () => {
  const r = pickBestContent([{ format: "png", density: 1, url: "p1" }]);
  assert.equal(r.density, 1);
});

test("empty contents -> null", () => {
  assert.equal(pickBestContent([]), null);
});

test("ignores items without a url", () => {
  assert.equal(pickBestContent([{ format: "png", density: 2 }]), null);
});
