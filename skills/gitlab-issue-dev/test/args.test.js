import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMrArgs } from "../lib/args.js";

test("parses full mr invocation", () => {
  assert.deepEqual(
    parseMrArgs(["feature/5-add-login", "--issue", "5", "--title", "Add login", "--description", "Adds login form"]),
    { sourceBranch: "feature/5-add-login", issueIid: 5, title: "Add login", description: "Adds login form" }
  );
});

test("rejects missing source branch", () => {
  assert.throws(() => parseMrArgs(["--issue", "5"]), /Usage/);
});

test("rejects missing --issue / --title / --description", () => {
  assert.throws(() => parseMrArgs(["b", "--title", "t", "--description", "d"]), /--issue/);
  assert.throws(() => parseMrArgs(["b", "--issue", "5", "--description", "d"]), /--title/);
  assert.throws(() => parseMrArgs(["b", "--issue", "5", "--title", "t"]), /--description/);
});

test("rejects unknown flags and dangling values", () => {
  assert.throws(() => parseMrArgs(["b", "--nope", "x"]), /Unknown flag/);
  assert.throws(() => parseMrArgs(["b", "--issue"]), /Missing value/);
});

test("rejects a repeated flag instead of silently overwriting", () => {
  assert.throws(
    () => parseMrArgs(["b", "--issue", "5", "--issue", "6", "--title", "t", "--description", "d"]),
    /Duplicate flag: --issue/
  );
});

test("rejects a non-integer --issue", () => {
  assert.throws(
    () => parseMrArgs(["b", "--issue", "5.5", "--title", "t", "--description", "d"]),
    /--issue/
  );
});
