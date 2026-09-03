import { execFileSync } from "node:child_process";

// Default exec: run git with argv (no shell), return stdout; throw with stderr on failure.
export function defaultExec(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const stderr = (err.stderr ?? "").toString().trim();
    throw new Error(`git ${args.join(" ")} failed: ${stderr || err.message}`);
  }
}

export function createGit({ exec = defaultExec } = {}) {
  const run = (args) => exec(args).trim();
  const tryRun = (args) => {
    try {
      return run(args);
    } catch {
      return null;
    }
  };
  const lines = (s) => (s ? s.split("\n").map((l) => l.trim()).filter(Boolean) : []);

  return {
    run,
    tryRun,

    remoteUrl: () => tryRun(["remote", "get-url", "origin"]),

    currentBranch: () => run(["branch", "--show-current"]),

    statusPorcelain() {
      const out = exec(["status", "--porcelain"]);
      let staged = 0;
      let unstaged = 0;
      let untracked = 0;
      for (const line of out.split("\n")) {
        if (!line) continue;
        const x = line[0];
        const y = line[1];
        if (x === "?" && y === "?") {
          untracked += 1;
          continue;
        }
        if (x !== " ") staged += 1;
        if (y !== " ") unstaged += 1;
      }
      return { clean: staged + unstaged + untracked === 0, staged, unstaged, untracked };
    },

    fetchPrune() {
      tryRun(["fetch", "--prune", "origin"]);
    },

    fetchBranch(base) {
      run(["fetch", "origin", base]);
    },

    originHead() {
      const ref = tryRun(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
      return ref ? ref.replace(/^origin\//, "") : null;
    },

    aheadBehind(base) {
      const out = tryRun(["rev-list", "--left-right", "--count", `origin/${base}...HEAD`]);
      if (out === null) return null;
      const [behind, ahead] = out.split(/\s+/).map(Number);
      return { behind, ahead };
    },

    unpushed() {
      const out = tryRun(["rev-list", "--count", "@{u}..HEAD"]);
      return out === null ? null : Number(out);
    },

    localBranchExists: (name) => tryRun(["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]) !== null,

    remoteBranchExists: (name) => run(["ls-remote", "--heads", "origin", name]) !== "",

    switchCreate(name, startPoint) {
      run(["switch", "-c", name, startPoint]);
    },

    switchTo(name) {
      run(["switch", name]);
    },

    setDescription(name, text) {
      run(["config", `branch.${name}.description`, text]);
    },

    getDescription: (name) => tryRun(["config", "--get", `branch.${name}.description`]),

    push(branch) {
      try {
        run(["push", "-u", "origin", branch]);
      } catch (err) {
        if (/\[rejected\]|non-fast-forward|fetch first/.test(err.message)) {
          throw new Error(
            `Push rejected: origin/${branch} has commits you don't have locally. Run \`git pull\` on this branch, then retry.`
          );
        }
        throw err;
      }
    },

    pullFfOnly(base) {
      try {
        run(["pull", "--ff-only", "origin", base]);
      } catch (err) {
        if (/Not possible to fast-forward|diverg/i.test(err.message)) {
          throw new Error(
            `Local ${base} has diverged from origin/${base}. Inspect local commits on ${base} (git log origin/${base}..${base}); sync will not merge or rebase automatically.`
          );
        }
        throw err;
      }
    },

    revCount: (range) => Number(run(["rev-list", "--count", range])),

    listMerged: (base) => lines(run(["branch", "--merged", `origin/${base}`, "--format=%(refname:short)"])),

    // Split on \t BEFORE trimming: an empty %(upstream:track) leaves a trailing tab.
    listTracked() {
      return exec(["for-each-ref", "--format=%(refname:short)\t%(upstream:track)", "refs/heads"])
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          const [name, track = ""] = l.split("\t");
          return { name: name.trim(), track: track.trim() };
        });
    },

    deleteBranch(name) {
      run(["branch", "-d", name]);
    },

    lastCommitSubject: () => run(["log", "-1", "--format=%s"]),
  };
}
