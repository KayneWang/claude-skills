import { test } from "node:test";
import assert from "node:assert/strict";
import { rgbaToHex } from "../lib/color.js";

test("opaque color → #rrggbb", () => {
  assert.equal(rgbaToHex({ r: 255, g: 0, b: 128, a: 1 }), "#ff0080");
});
test("missing alpha treated as opaque", () => {
  assert.equal(rgbaToHex({ r: 0, g: 0, b: 0 }), "#000000");
});
test("partial alpha → #rrggbbaa", () => {
  assert.equal(rgbaToHex({ r: 16, g: 32, b: 48, a: 0.5 }), "#10203080");
});
test("rounds fractional channels", () => {
  assert.equal(rgbaToHex({ r: 254.6, g: 0.4, b: 127.5, a: 1 }), "#ff0080");
});
