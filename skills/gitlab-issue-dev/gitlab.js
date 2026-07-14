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
  const { token, host, projectPath } = resolveContext({ remoteUrl: originUrl() });
  const client = createClient({ host, token });

  let result;
  if (cmd === "issues") {
    result = await listMyIssues(client, projectPath);
  } else if (cmd === "issue") {
    const iid = Number(rest[0]);
    if (!iid) throw new Error("Usage: gitlab.js issue <iid>");
    result = await getIssue(client, projectPath, iid);
  } else if (cmd === "mr") {
    result = await createMr(client, projectPath, parseMrArgs(rest));
  } else {
    throw new Error(
      "Usage: gitlab.js <command>\n  issues\n  issue <iid>\n  mr <source-branch> --issue <iid> --title <t> --description <d>"
    );
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
