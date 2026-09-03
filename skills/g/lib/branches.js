export const TYPES = ["feat", "fix", "chore", "refactor", "docs", "test"];

const JIRA_RE = /^[a-z]+-\d+$/i;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isJiraKey(s) {
  return typeof s === "string" && JIRA_RE.test(s);
}

export function isValidSlug(s) {
  return typeof s === "string" && SLUG_RE.test(s);
}

export function buildBranchName({ type, jira, slug }) {
  return `${type}/${jira ? jira.toLowerCase() : slug}`;
}

// "fix/demo-111" → { type, jira, slug }; null when the name is not type/<something>.
export function parseBranch(name) {
  const m = typeof name === "string" ? name.match(/^([a-z]+)\/(.+)$/) : null;
  if (!m || !TYPES.includes(m[1])) return null;
  const rest = m[2];
  return { type: m[1], jira: isJiraKey(rest) ? rest.toLowerCase() : null, slug: rest };
}

// merged: names from `git branch --merged origin/<base>`; tracked: from for-each-ref
// with %(upstream:track) — "[gone]" means the upstream was deleted.
export function computeMergedBranches({ merged, tracked, base, current }) {
  const skip = new Set([base, current]);
  const out = [];
  const seen = new Set();
  for (const name of merged) {
    if (skip.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, reason: "merged" });
  }
  for (const { name, track } of tracked) {
    if (skip.has(name) || seen.has(name) || track !== "[gone]") continue;
    seen.add(name);
    out.push({ name, reason: "gone" });
  }
  return out;
}
