import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";

const BASE = "https://api.zeplin.dev/v1";

// Without a timeout a hung request stalls the whole render/compare loop. JSON
// calls are quick; binary downloads can legitimately take longer.
const API_TIMEOUT_MS = 15000;
const DOWNLOAD_TIMEOUT_MS = 30000;

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function getJson(url, token) {
  const res = await fetch(url, { headers: authHeaders(token), signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zeplin API ${res.status} ${res.statusText} for ${url}\n${body.slice(0, 500)}`);
  }
  return res.json();
}

// Fetch `url` and write its bytes to `destPath`, creating parent dirs. `label`
// names the resource in error messages.
async function download(url, destPath, label) {
  await mkdir(dirname(destPath), { recursive: true });
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Failed to download ${label}: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  return destPath;
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

// Keep the original raster extension (Zeplin originals may be jpg/webp, not png)
// so the saved file isn't mislabeled. The source URL may be signed (`?...`), so
// read the extension from the parsed pathname; fall back to png.
function rasterExt(url) {
  try {
    const ext = extname(new URL(url).pathname).slice(1).toLowerCase();
    return /^(png|jpg|jpeg|webp|gif)$/.test(ext) ? ext : "png";
  } catch {
    return "png";
  }
}

export function downloadImage(url, screenId) {
  return download(url, join(tmpdir(), "zeplin-sync", `${screenId}.${rasterExt(url)}`), "reference image");
}

export function downloadAsset(url, filename) {
  return download(url, join(tmpdir(), "zeplin-sync", "assets", filename), `asset ${filename}`);
}
