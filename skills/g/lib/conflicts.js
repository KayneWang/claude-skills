import { resolveBranchBase } from "./status.js";

const KINDS = {
  UU: "both-modified",
  AA: "both-added",
  DU: "deleted-by-us",
  UD: "deleted-by-them",
  AU: "added-by-us",
  UA: "added-by-them",
  DD: "both-deleted",
};

const LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Gemfile.lock",
  "Cargo.lock",
  "poetry.lock",
  "composer.lock",
  "go.sum",
]);

// Each conflicted path, tagged so the agent knows which ones must go to the user
// (modify/delete, binary, lockfile) instead of being resolved automatically.
export function describeConflicts(git) {
  return git.unmergedFiles().map(({ code, path }) => {
    const kind = KINDS[code];
    const both = code === "UU" || code === "AA";
    return {
      path,
      kind,
      binary: both ? git.isBinaryInMerge(path) : false,
      lockfile: LOCKFILES.has(path.split("/").pop()),
    };
  });
}

// Merge origin/<target> (default: this branch's base) into the current branch, uncommitted.
// The agent resolves any conflicts, then commits with `git commit --no-edit` and pushes.
export async function startConflicts({ git, gitlab, branch, target: requested }) {
  const { base } = await resolveBranchBase({ git, gitlab, branch });
  if (branch === base) {
    throw new Error(`Refusing to merge on the base branch "${base}". Start a branch with /g start first.`);
  }

  // A merge already under way (ours from an earlier run, or one the user started): resume it.
  if (git.mergeInProgress()) {
    return { target: null, resumed: true, merged: null, upToDate: false, conflicts: describeConflicts(git) };
  }

  const target = requested ?? base;
  if (target === branch) throw new Error(`Cannot merge "${branch}" into itself.`);
  if (!git.statusPorcelain().clean) {
    throw new Error("Working tree has uncommitted changes: commit (/g commit) or stash them first.");
  }
  if (!git.remoteBranchExists(target)) throw new Error(`Branch "${target}" does not exist on origin.`);

  git.fetchBranch(target);
  const ref = `origin/${target}`;
  const merged = git.revCount(`HEAD..${ref}`);
  if (merged === 0) return { target, resumed: false, merged: 0, upToDate: true, conflicts: [] };

  try {
    git.mergeNoCommit(ref);
  } catch (err) {
    // Conflicts leave MERGE_HEAD behind; anything else is a real failure.
    if (!git.mergeInProgress()) throw err;
  }
  return { target, resumed: false, merged, upToDate: false, conflicts: describeConflicts(git) };
}
