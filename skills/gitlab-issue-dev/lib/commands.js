const proj = (p) => `/projects/${encodeURIComponent(p)}`;

export async function listMyIssues(client, projectPath) {
  const me = await client.get("/user");
  const issues = await client.getAll(`${proj(projectPath)}/issues`, {
    assignee_id: me.id,
    state: "opened",
  });
  return issues.map((i) => ({
    iid: i.iid,
    title: i.title,
    labels: i.labels,
    summary: (i.description ?? "").slice(0, 200),
    web_url: i.web_url,
  }));
}

export async function getIssue(client, projectPath, iid) {
  const p = proj(projectPath);
  const [issue, notes, relatedMrs] = await Promise.all([
    client.get(`${p}/issues/${iid}`),
    client.getAll(`${p}/issues/${iid}/notes`, { sort: "asc" }),
    client.get(`${p}/issues/${iid}/related_merge_requests`),
  ]);
  return {
    iid: issue.iid,
    title: issue.title,
    description: issue.description,
    labels: issue.labels,
    web_url: issue.web_url,
    comments: notes
      .filter((n) => !n.system)
      .map((n) => ({ author: n.author?.username, body: n.body })),
    relatedMrs: relatedMrs.map((mr) => ({
      iid: mr.iid,
      title: mr.title,
      state: mr.state,
      web_url: mr.web_url,
    })),
  };
}
