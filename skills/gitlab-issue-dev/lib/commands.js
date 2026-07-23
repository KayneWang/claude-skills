const proj = (p) => `/projects/${encodeURIComponent(p)}`;

export async function listMyIssues(client, projectPath) {
  const issues = await client.getAll(`${proj(projectPath)}/issues`, {
    scope: "assigned_to_me",
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
  const [project, issue, notes, relatedMrs] = await Promise.all([
    client.get(p),
    client.get(`${p}/issues/${iid}`),
    client.getAll(`${p}/issues/${iid}/notes`, { sort: "asc" }),
    client.getAll(`${p}/issues/${iid}/related_merge_requests`),
  ]);
  return {
    iid: issue.iid,
    title: issue.title,
    description: issue.description,
    labels: issue.labels,
    web_url: issue.web_url,
    default_branch: project.default_branch,
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

export function buildMrPayload({ sourceBranch, targetBranch, issueIid, title, description }) {
  return {
    source_branch: sourceBranch,
    target_branch: targetBranch,
    title: /^draft:/i.test(title) ? title : `Draft: ${title}`,
    description: `${description}\n\nCloses #${issueIid}`,
  };
}

export async function createMr(client, projectPath, { sourceBranch, issueIid, title, description }) {
  const p = proj(projectPath);
  const project = await client.get(p);
  const payload = buildMrPayload({
    sourceBranch,
    targetBranch: project.default_branch,
    issueIid,
    title,
    description,
  });
  const mr = await client.post(`${p}/merge_requests`, payload);
  return { iid: mr.iid, title: mr.title, web_url: mr.web_url, target_branch: mr.target_branch };
}
