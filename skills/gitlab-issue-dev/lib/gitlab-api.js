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
        // Node's fetch says only "fetch failed"; the useful part (ENOTFOUND, ECONNREFUSED…) is in cause.
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
      // non-JSON body (e.g., HTML error page from proxy)
    }
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(
          "GitLab API 401: token is invalid or expired — regenerate a PAT with `api` scope and re-export GITLAB_TOKEN."
        );
      }
      const detail = data?.message ?? data?.error ?? text;
      throw new Error(
        `GitLab API ${res.status} on ${method} ${path}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
      );
    }
    return { data, headers: res.headers };
  }

  return {
    async get(path, params) {
      return (await request("GET", path, { params })).data;
    },
    async post(path, body) {
      return (await request("POST", path, { body })).data;
    },
    async getAll(path, params = {}) {
      const out = [];
      let page = 1;
      while (page) {
        const { data, headers } = await request("GET", path, {
          params: { ...params, per_page: 100, page },
        });
        out.push(...data);
        const next = headers.get("x-next-page");
        page = next ? Number(next) : 0;
      }
      return out;
    },
  };
}
