export function buildMrTitle({ type, jira, description }) {
  return jira ? `${type}: ${jira} ${description}` : `${type}: ${description}`;
}

export function projectId(projectPath) {
  return encodeURIComponent(projectPath);
}

export async function getDefaultBranch(client, projectPath) {
  const project = await client.get(`/projects/${projectId(projectPath)}`);
  return project.default_branch;
}

function pick(mr) {
  return { iid: mr.iid, web_url: mr.web_url, state: mr.state, target_branch: mr.target_branch };
}

export async function findMr(client, projectPath, sourceBranch) {
  const list = await client.get(`/projects/${projectId(projectPath)}/merge_requests`, {
    source_branch: sourceBranch,
    state: "all",
    order_by: "updated_at",
    sort: "desc",
    per_page: 20,
  });
  const opened = list.find((mr) => mr.state === "opened");
  if (opened) return pick(opened);
  const merged = list.find((mr) => mr.state === "merged");
  return merged ? pick(merged) : null;
}

export async function resolveUserId(client, username) {
  const users = await client.get("/users", { username });
  const user = users.find((u) => u.username === username) ?? users[0];
  if (!user) throw new Error(`GitLab user "${username}" not found. Check the username (not display name).`);
  return user.id;
}

export async function createMr(client, projectPath, { sourceBranch, targetBranch, title, description, assigneeId }) {
  const body = {
    source_branch: sourceBranch,
    target_branch: targetBranch,
    title,
    description,
    remove_source_branch: true,
  };
  if (assigneeId !== undefined && assigneeId !== null) body.assignee_ids = [assigneeId];
  const mr = await client.post(`/projects/${projectId(projectPath)}/merge_requests`, body);
  return { iid: mr.iid, web_url: mr.web_url };
}
