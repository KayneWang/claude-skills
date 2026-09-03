// Parse a git remote URL into { protocol, host, projectPath }.
// Supports https(+credentials), scp-style ssh, and ssh:// (with port).
// protocol is the API protocol: "http" only for http:// remotes, else "https".
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

export function createClient({ host, token, protocol = "https", fetchImpl = fetch }) {
  const base = `${protocol}://${host}/api/v4`;

  async function request(method, path, { params, body } = {}) {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
    async function attempt() {
      try {
        return await fetchImpl(url, {
          method,
          headers: { "PRIVATE-TOKEN": token, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (err) {
        const cause = err.cause?.message ?? err.cause?.code;
        throw new Error(
          `Request to ${url.origin} failed: ${err.message}${cause ? ` (${cause})` : ""}. Check the host and network, or override with GITLAB_HOST.`
        );
      }
    }

    let res = await attempt();
    if (res.status === 429) {
      const wait = Math.min(Number(res.headers.get("retry-after")) || 1, 30);
      await new Promise((r) => setTimeout(r, wait * 1000));
      res = await attempt();
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // non-JSON body (e.g. HTML error page from a proxy)
    }
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(
          "GitLab API 401: token is invalid or expired — regenerate a PAT with `api` scope and re-export GITLAB_TOKEN."
        );
      }
      const detail = data?.message ?? data?.error ?? text;
      const err = new Error(
        `GitLab API ${res.status} on ${method} ${path}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
      );
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    get: (path, params) => request("GET", path, { params }),
    post: (path, body) => request("POST", path, { body }),
  };
}
