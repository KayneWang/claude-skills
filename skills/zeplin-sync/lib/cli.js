import { parseScreenUrl } from "./parse-url.js";

const TOKEN_HELP =
  "ZEPLIN_TOKEN is not set.\n" +
  "Create one at Zeplin web → Profile → Developer → Create new token, then:\n" +
  "  export ZEPLIN_TOKEN=<your token>";

// Shared preamble for the CLI entrypoints (zeplin.js, assets.js): validate the
// argv URL and ZEPLIN_TOKEN, then parse the screen URL. Exits with code 2 on a
// user error (missing arg/token). A malformed URL throws from parseScreenUrl —
// callers let it propagate to their top-level catch (exit 1).
export function requireContext(scriptName) {
  const url = process.argv[2];
  if (!url) {
    console.error(`Usage: node ${scriptName} <zeplin-screen-url>`);
    process.exit(2);
  }
  const token = process.env.ZEPLIN_TOKEN;
  if (!token) {
    console.error(TOKEN_HELP);
    process.exit(2);
  }
  return { url, token, ...parseScreenUrl(url) };
}
