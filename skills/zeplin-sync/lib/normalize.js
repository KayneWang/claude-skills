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

// Solid fills become { hex, token }; gradient fills keep their stops as
// { gradient: { type, stops } }. Image fills carry no color data — skipped.
function normalizeFills(fills = [], tokenByHex) {
  const out = [];
  for (const f of fills) {
    if (f.type === "color" && f.color) {
      const hex = rgbaToHex(f.color);
      out.push({ hex, token: tokenByHex.get(hex) ?? null });
    } else if (f.type === "gradient" && f.gradient) {
      out.push({
        gradient: {
          type: f.gradient.type ?? null,
          stops: (f.gradient.color_stops ?? []).map((s) => ({
            position: s.position ?? null,
            color: s.color ? rgbaToHex(s.color) : null,
          })),
        },
      });
    }
  }
  return out;
}

// Per-range text styles. The REST API returns snake_case; we expose camelCase.
// line_height / letter_spacing are only present when explicitly set, default null.
function normalizeTextStyles(layer) {
  const segs = layer.text_styles;
  if (!segs?.length) return null;
  return segs.map((seg) => ({
    range: seg.range ?? null,
    fontFamily: seg.style?.font_family ?? null,
    fontSize: seg.style?.font_size ?? null,
    fontWeight: seg.style?.font_weight ?? null,
    lineHeight: seg.style?.line_height ?? null,
    letterSpacing: seg.style?.letter_spacing ?? null,
    textAlign: seg.style?.text_align ?? null,
    color: seg.style?.color ? rgbaToHex(seg.style.color) : null,
  }));
}

function normalizeBorders(borders = []) {
  return borders.map((b) => ({
    thickness: b.thickness ?? null,
    color: b.color ? rgbaToHex(b.color) : null,
    position: b.position ?? null,
  }));
}

function normalizeShadows(shadows = []) {
  return shadows.map((s) => ({
    type: s.type ?? null,
    offsetX: s.offset_x ?? null,
    offsetY: s.offset_y ?? null,
    blur: s.blur_radius ?? null,
    spread: s.spread ?? null,
    color: s.color ? rgbaToHex(s.color) : null,
  }));
}

// Screen annotations carry designer implementation hints. The annotation `type`
// may be an object ({ name }) or a bare string depending on the endpoint shape;
// position may be `position` or `rect`. Read defensively.
function normalizeAnnotations(annotations = []) {
  return annotations.map((a) => ({
    type: a.type?.name ?? a.type ?? null,
    content: a.content ?? null,
    rect: a.position ?? a.rect ?? null,
  }));
}

export function normalize({ screen, version, colors = [], annotations = [] }) {
  const tokenByHex = new Map();
  const tokenColors = {};
  for (const c of colors) {
    const hex = rgbaToHex(c);
    tokenByHex.set(hex, c.name);
    tokenColors[c.name] = hex;
  }

  const layers = flattenLayers(version.layers).map(({ layer: l, depth }) => {
    const out = {
      id: l.id,
      sourceId: l.source_id ?? null,
      type: l.type,
      name: l.name ?? null,
      depth,
      // rect x/y are relative to the parent layer; rect.absolute (when the API
      // provides it) is the position within the screen — keep both, since the
      // flat output has no parent linkage to re-derive absolute positions from.
      rect: {
        x: l.rect?.x, y: l.rect?.y, width: l.rect?.width, height: l.rect?.height,
        ...(l.rect?.absolute ? { absolute: { x: l.rect.absolute.x, y: l.rect.absolute.y } } : {}),
      },
      borderRadius: l.border_radius ?? 0,
      content: l.content ?? null,
      fills: normalizeFills(l.fills, tokenByHex),
    };
    if (l.component_name) out.componentName = l.component_name;
    const textStyles = normalizeTextStyles(l);
    if (textStyles) out.textStyles = textStyles;
    const borders = normalizeBorders(l.borders);
    if (borders.length) out.borders = borders;
    const shadows = normalizeShadows(l.shadows);
    if (shadows.length) out.shadows = shadows;
    if (l.opacity != null && l.opacity !== 1) out.opacity = l.opacity;
    if (l.blend_mode != null && l.blend_mode !== "normal") out.blendMode = l.blend_mode;
    if (l.rotation != null && l.rotation !== 0) out.rotation = l.rotation;
    return out;
  });

  return {
    screen: {
      name: screen.name,
      width: screen.image?.width,
      height: screen.image?.height,
      densityScale: version.density_scale ?? null,
    },
    tokens: { colors: tokenColors },
    annotations: normalizeAnnotations(annotations),
    layers,
  };
}
