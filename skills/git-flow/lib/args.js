import { readFileSync } from "node:fs";
import { TYPES, isJiraKey, isValidSlug, parseBranch } from "./branches.js";

export const USAGE = `Usage: g.js <command>
  status
  base
  branch-name <type> [jira] [slug]
  start <name> [--description <d>]
  push
  mr-find
  mr-create --title <t> (--description <d> | --description-file <path>) [--assignee <username>] [--target <branch>]
  merged-branches
  delete-branches <name...>`;

// Generic "--flag value" parser. allowed: list of flag names (with dashes).
function parseFlags(argv, allowed) {
  const opts = {};
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!allowed.includes(flag)) throw new Error(`Unknown flag: ${flag}\n${USAGE}`);
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (seen.has(flag)) throw new Error(`Duplicate flag: ${flag}\n${USAGE}`);
    seen.add(flag);
    opts[flag.slice(2)] = value;
  }
  return opts;
}

export function parseBranchNameArgs(argv) {
  const [type, ...rest] = argv;
  if (!type) throw new Error(USAGE);
  if (!TYPES.includes(type)) {
    throw new Error(`Unknown type "${type}". Allowed: ${TYPES.join(", ")}`);
  }
  let jira = null;
  let slug = null;
  if (rest.length && isJiraKey(rest[0])) jira = rest.shift().toLowerCase();
  if (rest.length) {
    slug = rest.shift();
    if (!isValidSlug(slug)) {
      throw new Error(`Invalid slug "${slug}": must be ascii kebab-case like login-remember-me`);
    }
  }
  if (rest.length) throw new Error(`Unexpected argument: ${rest[0]}\n${USAGE}`);
  if (!jira && !slug) throw new Error(`branch-name needs a jira key or a slug\n${USAGE}`);
  return { type, jira, slug };
}

export function parseStartArgs(argv) {
  const [name, ...rest] = argv;
  if (!name || name.startsWith("--")) throw new Error(USAGE);
  if (parseBranch(name) === null) {
    throw new Error(`Branch name "${name}" does not follow <type>/<jira-or-slug> (types: ${TYPES.join(", ")})`);
  }
  const opts = parseFlags(rest, ["--description"]);
  return { name, description: opts.description ?? null };
}

export function parseMrCreateArgs(argv) {
  const opts = parseFlags(argv, ["--title", "--description", "--description-file", "--assignee", "--target"]);
  if (!opts.title) throw new Error(`--title is required\n${USAGE}`);
  if (opts.description !== undefined && opts["description-file"] !== undefined) {
    throw new Error(`Use either --description or --description-file, not both`);
  }
  if (opts.description === undefined && opts["description-file"] === undefined) {
    throw new Error(`--description or --description-file is required\n${USAGE}`);
  }
  const description = opts["description-file"] !== undefined ? readFileSync(opts["description-file"], "utf8") : opts.description;
  return {
    title: opts.title,
    description,
    assignee: opts.assignee ?? null,
    target: opts.target ?? null,
  };
}

export function parseDeleteArgs(argv) {
  if (!argv.length) throw new Error(`delete-branches needs at least one branch name\n${USAGE}`);
  return argv;
}
