// Choose the single best content for an asset.
// Priority: SVG (vector) first; otherwise web raster by density 2 > 3 > 1, then closest to 2.
// Non-web export formats (pdf, eps, …) are ignored — they can't be used on the web.
const RASTER_FORMATS = new Set(["png", "jpg", "jpeg", "webp"]);

function rasterRank(density) {
  if (density === 2) return 0;
  if (density === 3) return 1;
  if (density === 1) return 2;
  return 3 + Math.abs((density ?? 0) - 2);
}

export function pickBestContent(contents = []) {
  const usable = contents.filter((c) => c && c.format && c.url);
  if (!usable.length) return null;

  const svg = usable.find((c) => c.format === "svg");
  if (svg) return svg;

  const raster = usable.filter((c) => RASTER_FORMATS.has(c.format));
  if (!raster.length) return null;

  return raster
    .slice()
    .sort((a, b) => rasterRank(a.density) - rasterRank(b.density))[0];
}
