// Parse a git remote URL into { protocol, host, projectPath }.
// Supports https(+credentials), scp-style ssh, and ssh:// (with port).
// protocol is the API protocol: "http" only for http:// remotes, else "https"
// (ssh remotes still talk to the API over https).
export function parseRemote(url) {
  if (!url) return null;
  let m;
  if ((m = url.match(/^(https?):\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/))) {
    return { protocol: m[1], host: m[2], projectPath: m[3] };
  }
  if ((m = url.match(/^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/))) {
    return { protocol: "https", host: m[1], projectPath: m[2] };
  }
  if ((m = url.match(/^[^@/]+@([^:/]+):(.+?)(?:\.git)?$/))) {
    return { protocol: "https", host: m[1], projectPath: m[2] };
  }
  return null;
}

// Hosts that are never GitLab instances. Matched exactly or as a subdomain
// (e.g. "www.github.com") so we never send a GitLab PAT to them.
const NON_GITLAB_HOSTS = ["github.com", "bitbucket.org", "dev.azure.com", "codeberg.org"];

function isNonGitlabHost(host) {
  const bare = host.split(":")[0].toLowerCase();
  return NON_GITLAB_HOSTS.some((blocked) => bare === blocked || bare.endsWith(`.${blocked}`));
}

export function resolveContext({ env = process.env, remoteUrl } = {}) {
  const token = env.GITLAB_TOKEN;
  if (!token) {
    throw new Error(
      "GITLAB_TOKEN is not set. Create a personal access token with `api` scope at GitLab → Preferences → Access Tokens, then `export GITLAB_TOKEN=<token>`."
    );
  }
  const parsed = parseRemote(remoteUrl);
  // GITLAB_HOST may carry an explicit scheme (http://gl.corp.com); otherwise
  // the override defaults to https regardless of what the remote used.
  let hostOverride = env.GITLAB_HOST;
  let protocol = hostOverride ? "https" : parsed?.protocol ?? "https";
  const schemed = hostOverride?.match(/^(https?):\/\/(.+?)\/?$/);
  if (schemed) {
    protocol = schemed[1];
    hostOverride = schemed[2];
  }
  const host = hostOverride || parsed?.host;
  const projectPath = env.GITLAB_PROJECT || parsed?.projectPath;
  if (!host || !projectPath) {
    throw new Error(
      `Cannot resolve a GitLab project from remote "${remoteUrl ?? "(none)"}". Set GITLAB_HOST and GITLAB_PROJECT to override.`
    );
  }
  if (isNonGitlabHost(host)) {
    throw new Error(
      `Remote host "${host}" is not a GitLab host. Set GITLAB_HOST and GITLAB_PROJECT to point at your GitLab instance.`
    );
  }
  return { token, protocol, host, projectPath };
}
