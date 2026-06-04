import { rgbaToHex } from "./color.js";

// Walk nested layer groups depth-first, tracking nesting depth.
// Returns { layer, depth } pairs so the flat output can still convey hierarchy.
export function flattenLayers(layers = [], depth = 0, acc = []) {
  for (const layer of layers) {
    acc.push({ layer, depth });
    if (layer.layers?.length) flattenLayers(layer.layers, depth + 1, acc);
  }
  return acc;
}

function normalizeFills(fills = [], tokenByHex) {
  return fills
    .filter((f) => f.type === "color" && f.color)
    .map((f) => {
      const hex = rgbaToHex(f.color);
      return { hex, token: tokenByHex.get(hex) ?? null };
    });
}

// The Zeplin REST API returns snake_case fields. We read those and expose a
// clean camelCase shape to the agent. line_height / letter_spacing are only
// present when explicitly set in the design, so they default to null.
function normalizeTextStyle(layer) {
  const style = layer.text_styles?.[0]?.style;
  if (!style) return null;
  return {
    fontFamily: style.font_family ?? null,
    fontSize: style.font_size ?? null,
    fontWeight: style.font_weight ?? null,
    lineHeight: style.line_height ?? null,
    letterSpacing: style.letter_spacing ?? null,
    textAlign: style.text_align ?? null,
    color: style.color ? rgbaToHex(style.color) : null,
  };
}

export function normalize({ screen, version, colors = [] }) {
  const tokenByHex = new Map();
  const tokenColors = {};
  for (const c of colors) {
    const hex = rgbaToHex(c);
    tokenByHex.set(hex, c.name);
    tokenColors[c.name] = hex;
  }

  const layers = flattenLayers(version.layers).map(({ layer: l }) => ({
    id: l.id,
    type: l.type,
    name: l.name ?? null,
    rect: { x: l.rect?.x, y: l.rect?.y, width: l.rect?.width, height: l.rect?.height },
    borderRadius: l.border_radius ?? 0,
    content: l.content ?? null,
    fills: normalizeFills(l.fills, tokenByHex),
    textStyle: normalizeTextStyle(l),
  }));

  return {
    screen: { name: screen.name, width: screen.image?.width, height: screen.image?.height },
    tokens: { colors: tokenColors },
    layers,
  };
}
