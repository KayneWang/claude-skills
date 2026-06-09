import { requireContext } from "./lib/cli.js";
import { normalize } from "./lib/normalize.js";
import { getScreen, getScreenVersion, getProjectColors, getAnnotations, downloadImage } from "./lib/zeplin-api.js";

async function main() {
  const { token, projectId, screenId, versionId } = requireContext("zeplin.js");
  const [screen, version, colorsResp, annotationsResp] = await Promise.all([
    getScreen(token, projectId, screenId),
    getScreenVersion(token, projectId, screenId, versionId),
    getProjectColors(token, projectId).catch(() => []),
    getAnnotations(token, projectId, screenId).catch(() => []),
  ]);

  // Both endpoints may return a bare array, a wrapped object, or (on a 200 with
  // an empty body) null; unwrap defensively with optional chaining.
  const colors = Array.isArray(colorsResp) ? colorsResp : colorsResp?.colors ?? [];
  const annotations = Array.isArray(annotationsResp) ? annotationsResp : annotationsResp?.annotations ?? [];
  const spec = normalize({ screen, version, colors, annotations });

  // REST API uses snake_case (original_url); keep camelCase as a defensive fallback.
  const imageUrl = screen.image?.original_url ?? screen.image?.originalUrl;
  spec.referenceImage = imageUrl ? await downloadImage(imageUrl, screenId) : null;

  console.log(JSON.stringify(spec, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
