import { execSync } from "node:child_process";
import { resolveContext } from "./lib/remote.js";
import { createClient } from "./lib/gitlab-api.js";
import { parseMrArgs } from "./lib/args.js";
import { listMyIssues, getIssue, createMr } from "./lib/commands.js";

function originUrl() {
  try {
    return execSync("git remote get-url origin", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  // Validate the command (and its args) before touching token/remote context,
  // so `gitlab.js` / `gitlab.js --help` print usage instead of a setup error.
  if (!["issues", "issue", "mr"].includes(cmd)) {
    throw new Error(
      "Usage: gitlab.js <command>\n  issues\n  issue <iid>\n  mr <source-branch> --issue <iid> --title <t> --description <d>"
    );
  }
  const iid = cmd === "issue" ? Number(rest[0]) : null;
  if (cmd === "issue" && !iid) throw new Error("Usage: gitlab.js issue <iid>");
  const mrArgs = cmd === "mr" ? parseMrArgs(rest) : null;

  const { token, protocol, host, projectPath } = resolveContext({ remoteUrl: originUrl() });
  const client = createClient({ host, token, protocol });

  let result;
  if (cmd === "issues") {
    result = await listMyIssues(client, projectPath);
  } else if (cmd === "issue") {
    result = await getIssue(client, projectPath, iid);
  } else {
    result = await createMr(client, projectPath, mrArgs);
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
