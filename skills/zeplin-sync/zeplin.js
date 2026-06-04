import { parseScreenUrl } from "./lib/parse-url.js";
import { normalize } from "./lib/normalize.js";
import { getScreen, getScreenVersion, getProjectColors, getAnnotations, downloadImage } from "./lib/zeplin-api.js";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: node zeplin.js <zeplin-screen-url>");
    process.exit(2);
  }
  const token = process.env.ZEPLIN_TOKEN;
  if (!token) {
    console.error(
      "ZEPLIN_TOKEN is not set.\n" +
        "Create one at Zeplin web → Profile → Developer → Create new token, then:\n" +
        "  export ZEPLIN_TOKEN=<your token>"
    );
    process.exit(2);
  }

  const { projectId, screenId, versionId } = parseScreenUrl(url);
  const [screen, version, colorsResp, annotationsResp] = await Promise.all([
    getScreen(token, projectId, screenId),
    getScreenVersion(token, projectId, screenId, versionId),
    getProjectColors(token, projectId).catch(() => []),
    getAnnotations(token, projectId, screenId).catch(() => []),
  ]);

  // Both endpoints may return a bare array or a wrapped object; unwrap defensively.
  const colors = Array.isArray(colorsResp) ? colorsResp : colorsResp.colors ?? [];
  const annotations = Array.isArray(annotationsResp) ? annotationsResp : annotationsResp.annotations ?? [];
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
