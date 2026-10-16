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

// The base a branch belongs to: the one `start --from` recorded, else the repo base.
export async function resolveBranchBase({ git, gitlab, branch }) {
  const recorded = branch ? git.getBranchBase(branch) : null;
  if (recorded) return { base: recorded, source: "branch" };
  return resolveBase({ git, gitlab });
}

// Merged / gone local branches, each judged against its own base. Branches that others were
// started from (e.g. develop) are never listed.
export function collectCleanup({ git, repoBase, current }) {
  const bases = git.listBranchBases();
  const baseOf = (name) => bases[name] ?? repoBase;
  const merged = [];
  for (const b of new Set([repoBase, ...Object.values(bases)])) {
    // A recorded base may have been deleted on origin; skip it rather than fail the whole list.
    let list;
    try {
      list = git.listMerged(b);
    } catch (err) {
      if (b === repoBase) throw err;
      continue;
    }
    merged.push(...list.filter((name) => baseOf(name) === b));
  }
  return computeMergedBranches({ merged, tracked: git.listTracked(), base: repoBase, current, keep: Object.values(bases) });
}

export async function collectStatus({ git, gitlab }) {
  git.fetchPrune();
  const repoBase = await resolveBase({ git, gitlab });
  const branch = git.currentBranch();
  const recorded = branch ? git.getBranchBase(branch) : null;
  const base = recorded ? { base: recorded, source: "branch" } : repoBase;
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

  const cleanup = collectCleanup({ git, repoBase: repoBase.base, current: branch });

  const result = {
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
  result.advice = computeAdvice(result);
  return result;
}

// The "建议" lines of the /g panel, in priority order. Every rule that applies is listed.
export function computeAdvice(s) {
  const base = s.base.base;
  const out = [];
  const needsPush = (s.unpushed ?? 0) > 0 || (!s.hasUpstream && (s.ahead ?? 0) > 0);
  if (s.onBase && !s.status.clean) out.push(`先 /g start <type> ... 开分支，不要在 ${base} 上直接提交`);
  if (!s.branchValid && !s.onBase) out.push("分支名不符合 type/xxx 规范，建议 /g start 新开分支后 cherry-pick");
  if (!s.status.clean) out.push("/g commit 提交并推送");
  if (s.status.clean && needsPush && !s.onBase) out.push(s.mr.state === "opened" ? "/g commit 推送本地 commit" : "/g ship <assignee> 创建 MR");
  if (s.mr.state === "merged") out.push(`/g sync 回到 ${base} 并清理`);
  if (s.cleanup.length) out.push("/g sync 会自动删除上面的待清理分支");
  return out.length ? out : ["一切就绪"];
}
