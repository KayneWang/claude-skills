import { rgbaToHex } from "./color.js";

export function flattenLayers(layers = [], acc = []) {
  for (const layer of layers) {
    acc.push(layer);
    if (layer.layers?.length) flattenLayers(layer.layers, acc);
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

function normalizeTextStyle(layer) {
  const style = layer.textStyles?.[0]?.style;
  if (!style) return null;
  return {
    fontFamily: style.fontFamily ?? null,
    fontSize: style.fontSize ?? null,
    fontWeight: style.fontWeight ?? null,
    lineHeight: style.lineHeight ?? null,
    letterSpacing: style.letterSpacing ?? null,
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

  const layers = flattenLayers(version.layers).map((l) => ({
    id: l.id,
    type: l.type,
    name: l.name ?? null,
    rect: { x: l.rect?.x, y: l.rect?.y, width: l.rect?.width, height: l.rect?.height },
    borderRadius: l.borderRadius ?? 0,
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
