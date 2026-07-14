// Parse a git remote URL into { host, projectPath }.
// Supports https(+credentials), scp-style ssh, and ssh:// (with port).
export function parseRemote(url) {
  if (!url) return null;
  let m;
  if ((m = url.match(/^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/))) {
    return { host: m[1], projectPath: m[2] };
  }
  if ((m = url.match(/^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/))) {
    return { host: m[1], projectPath: m[2] };
  }
  if ((m = url.match(/^[^@/]+@([^:/]+):(.+?)(?:\.git)?$/))) {
    return { host: m[1], projectPath: m[2] };
  }
  return null;
}

export function resolveContext({ env = process.env, remoteUrl } = {}) {
  const token = env.GITLAB_TOKEN;
  if (!token) {
    throw new Error(
      "GITLAB_TOKEN is not set. Create a personal access token with `api` scope at GitLab → Preferences → Access Tokens, then `export GITLAB_TOKEN=<token>`."
    );
  }
  const parsed = parseRemote(remoteUrl);
  const host = env.GITLAB_HOST || parsed?.host;
  const projectPath = env.GITLAB_PROJECT || parsed?.projectPath;
  if (!host || !projectPath) {
    throw new Error(
      `Cannot resolve a GitLab project from remote "${remoteUrl ?? "(none)"}". Set GITLAB_HOST and GITLAB_PROJECT to override.`
    );
  }
  return { token, host, projectPath };
}
