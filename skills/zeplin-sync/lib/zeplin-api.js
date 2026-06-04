import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://api.zeplin.dev/v1";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function getJson(url, token) {
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zeplin API ${res.status} ${res.statusText} for ${url}\n${body.slice(0, 500)}`);
  }
  return res.json();
}

export function getScreen(token, projectId, screenId) {
  return getJson(`${BASE}/projects/${projectId}/screens/${screenId}`, token);
}

export function getScreenVersion(token, projectId, screenId, versionId) {
  const v = versionId ?? "latest";
  return getJson(`${BASE}/projects/${projectId}/screens/${screenId}/versions/${v}`, token);
}

export function getProjectColors(token, projectId) {
  return getJson(`${BASE}/projects/${projectId}/colors`, token);
}

export function getAnnotations(token, projectId, screenId) {
  return getJson(`${BASE}/projects/${projectId}/screens/${screenId}/annotations`, token);
}

export async function downloadImage(url, screenId) {
  const dir = join(tmpdir(), "zeplin-sync");
  await mkdir(dir, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download reference image: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = join(dir, `${screenId}.png`);
  await writeFile(path, buf);
  return path;
}

export async function downloadAsset(url, filename) {
  const dir = join(tmpdir(), "zeplin-sync", "assets");
  await mkdir(dir, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download asset ${filename}: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = join(dir, filename);
  await writeFile(path, buf);
  return path;
}
