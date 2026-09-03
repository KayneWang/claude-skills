import { parseBranch, computeMergedBranches } from "./branches.js";
import { getDefaultBranch, findMr } from "./mr.js";

export async function resolveBase({ git, gitlab }) {
  let apiError = null;
  if (gitlab) {
    try {
      const base = await getDefaultBranch(gitlab.client, gitlab.projectPath);
      if (base) return { base, source: "gitlab" };
    } catch (err) {
      apiError = err;
    }
  }
  const head = git.originHead();
  if (head) return { base: head, source: "origin-head" };
  const why = apiError ? ` (GitLab lookup failed: ${apiError.message})` : "";
  throw new Error(
    `Cannot determine the base branch${why}. Either set GITLAB_TOKEN so it can be read from GitLab, or run \`git remote set-head origin -a\`.`
  );
}

export async function collectStatus({ git, gitlab }) {
  git.fetchPrune();
  const base = await resolveBase({ git, gitlab });
  const branch = git.currentBranch();
  const parsed = parseBranch(branch);
  const status = git.statusPorcelain();
  const ab = git.aheadBehind(base.base);
  const unpushed = git.unpushed();

  let mr = { state: "unknown" };
  if (gitlab && branch) {
    try {
      const found = await findMr(gitlab.client, gitlab.projectPath, branch);
      mr = found ? { state: found.state, iid: found.iid, web_url: found.web_url, target_branch: found.target_branch } : { state: "none" };
    } catch (err) {
      mr = { state: "unknown", error: err.message };
    }
  }

  const cleanup = computeMergedBranches({
    merged: git.listMerged(base.base),
    tracked: git.listTracked(),
    base: base.base,
    current: branch,
  });

  return {
    base,
    branch,
    onBase: branch === base.base,
    branchValid: parsed !== null,
    type: parsed?.type ?? null,
    jira: parsed?.jira ?? null,
    status,
    ahead: ab?.ahead ?? null,
    behind: ab?.behind ?? null,
    hasUpstream: unpushed !== null,
    unpushed,
    mr,
    cleanup,
  };
}
