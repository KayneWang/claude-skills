import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const script = fileURLToPath(new URL("../gitlab.js", import.meta.url));
// No GITLAB_TOKEN in env: usage errors must not depend on context resolution.
const env = { ...process.env };
delete env.GITLAB_TOKEN;

async function stderrOf(args) {
  try {
    await run(process.execPath, [script, ...args], { env });
    throw new Error("expected non-zero exit");
  } catch (err) {
    assert.equal(err.code, 1);
    return err.stderr;
  }
}

test("no command prints usage, not a GITLAB_TOKEN error", async () => {
  const stderr = await stderrOf([]);
  assert.match(stderr, /Usage: gitlab\.js/);
  assert.doesNotMatch(stderr, /GITLAB_TOKEN/);
});

test("unknown command prints usage, not a GITLAB_TOKEN error", async () => {
  const stderr = await stderrOf(["--help"]);
  assert.match(stderr, /Usage: gitlab\.js/);
  assert.doesNotMatch(stderr, /GITLAB_TOKEN/);
});
