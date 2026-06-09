import { requireContext } from "./lib/cli.js";
import { getScreen, getScreenVersion, downloadAsset } from "./lib/zeplin-api.js";
import { pickBestContent } from "./lib/pick-content.js";
import { hashFile } from "./lib/detect.js";

function sanitize(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function uniqueName(base, ext, used) {
  let name = `${base}.${ext}`;
  let i = 1;
  while (used.has(name)) {
    name = `${base}-${i}.${ext}`;
    i++;
  }
  used.add(name);
  return name;
}

async function main() {
  const { token, projectId, screenId, versionId } = requireContext("assets.js");
  const [screen, version] = await Promise.all([
    getScreen(token, projectId, screenId),
    getScreenVersion(token, projectId, screenId, versionId),
  ]);

  const rawAssets = Array.isArray(version.assets) ? version.assets : [];
  const assets = [];
  const usedNames = new Set();
  for (const a of rawAssets) {
    const contents = (a.contents ?? []).map((c) => ({
      format: c.format,
      density: typeof c.density === "string" ? Number(c.density) : c.density,
      url: c.url,
    }));
    const best = pickBestContent(contents);
    if (!best) continue;

    const layerName = a.layer_name ?? a.display_name ?? a.name ?? "asset";
    const filename = uniqueName(sanitize(layerName), best.format, usedNames);
    try {
      const file = await downloadAsset(best.url, filename);
      assets.push({
        layerName,
        sourceId: a.layer_source_id ?? a.source_id ?? null,
        file,
        format: best.format,
        density: best.density ?? null,
        width: a.width ?? null,
        height: a.height ?? null,
        hash: hashFile(file),
      });
    } catch (err) {
      console.error(`skip asset "${layerName}": ${err.message}`);
    }
  }

  console.log(JSON.stringify({ screen: { name: screen.name }, assets }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
