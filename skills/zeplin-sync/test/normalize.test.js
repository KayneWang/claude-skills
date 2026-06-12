import { test } from "node:test";
import assert from "node:assert/strict";
import { flattenLayers, normalize } from "../lib/normalize.js";

test("flattenLayers walks nested groups depth-first with depth", () => {
  const tree = [
    { id: "g", type: "group", layers: [{ id: "a", type: "text" }, { id: "b", type: "shape" }] },
    { id: "c", type: "text" },
  ];
  const out = flattenLayers(tree);
  assert.deepEqual(out.map(({ layer }) => layer.id), ["g", "a", "b", "c"]);
  assert.deepEqual(out.map(({ depth }) => depth), [0, 1, 1, 0]);
});

test("normalize builds screen meta, tokens, and flat layers", () => {
  const screen = { name: "Login", image: { width: 375, height: 812, originalUrl: "https://img/x.png" } };
  const colors = [{ name: "primary", r: 0, g: 122, b: 255, a: 1 }];
  // Input shapes mirror the real Zeplin REST API (snake_case), as recorded
  // during calibration against a live screen.
  const version = {
    layers: [
      {
        id: "title", type: "text", name: "Title",
        rect: { x: 16, y: 40, width: 200, height: 28 },
        content: "Welcome",
        fills: [{ type: "color", color: { r: 0, g: 0, b: 0, a: 1 } }],
        text_styles: [{ style: { font_family: "Inter", font_size: 24, font_weight: 600, text_align: "left", color: { r: 0, g: 0, b: 0, a: 1 } } }],
        border_radius: 0,
      },
      {
        id: "cta", type: "shape", name: "Button",
        rect: { x: 16, y: 700, width: 343, height: 48 },
        fills: [{ type: "color", color: { r: 0, g: 122, b: 255, a: 1 } }],
        border_radius: 8,
      },
    ],
  };

  const spec = normalize({ screen, version, colors });

  assert.deepEqual(spec.screen, { name: "Login", width: 375, height: 812, densityScale: null });
  assert.deepEqual(spec.tokens.colors, { primary: "#007aff" });
  assert.deepEqual(spec.layers[0], {
    id: "title", sourceId: null, type: "text", name: "Title", depth: 0,
    rect: { x: 16, y: 40, width: 200, height: 28 },
    borderRadius: 0, content: "Welcome",
    fills: [{ hex: "#000000", token: null }],
    textStyles: [{ range: null, fontFamily: "Inter", fontSize: 24, fontWeight: 600, lineHeight: null, letterSpacing: null, textAlign: "left", color: "#000000" }],
  });
  assert.deepEqual(spec.layers[1].fills, [{ hex: "#007aff", token: "primary" }]);
  assert.equal(spec.layers[1].borderRadius, 8);
  assert.equal(spec.layers[1].textStyles, undefined);
});

test("normalize drops malformed fills and defaults missing fills/rect", () => {
  const screen = { name: "Empty", image: { width: 100, height: 200 } };
  const version = {
    layers: [
      {
        id: "mixed", type: "shape", name: "Mixed",
        rect: { x: 0, y: 0, width: 50, height: 50 },
        fills: [{ type: "gradient" }, { type: "color", color: { r: 255, g: 0, b: 0, a: 1 } }],
      },
      { id: "bare", type: "group", name: "Bare" },
    ],
  };

  const spec = normalize({ screen, version });

  assert.deepEqual(spec.layers[0].fills, [{ hex: "#ff0000", token: null }]);
  assert.deepEqual(spec.layers[1].fills, []);
  assert.deepEqual(spec.layers[1].rect, { x: undefined, y: undefined, width: undefined, height: undefined });
});

test("normalize emits gradient fills with hex color stops", () => {
  const screen = { name: "G", image: { width: 100, height: 100 } };
  const version = {
    layers: [
      {
        id: "scrim", type: "shape", name: "scrim",
        rect: { x: 0, y: 0, width: 50, height: 50 },
        fills: [{
          type: "gradient",
          gradient: {
            type: "linear",
            color_stops: [
              { position: 0, color: { r: 255, g: 255, b: 255, a: 0 } },
              { position: 1, color: { r: 86, g: 171, b: 174, a: 1 } },
            ],
          },
        }],
      },
    ],
  };

  const spec = normalize({ screen, version });
  assert.deepEqual(spec.layers[0].fills, [{
    gradient: {
      type: "linear",
      stops: [
        { position: 0, color: "#ffffff00" },
        { position: 1, color: "#56abae" },
      ],
    },
  }]);
});

test("normalize keeps absolute rect coordinates when the API provides them", () => {
  const screen = { name: "Abs", image: { width: 2560, height: 9000 } };
  const version = {
    layers: [
      {
        id: "outer", type: "group", name: "outer",
        rect: { x: 580, y: 1358, width: 1400, height: 100, absolute: { x: 580, y: 1358 } },
        layers: [
          {
            id: "inner", type: "text", name: "inner", content: "hi",
            rect: { x: 0, y: 0, width: 240, height: 56, absolute: { x: 1160.5, y: 1358 } },
          },
        ],
      },
      { id: "legacy", type: "shape", name: "legacy", rect: { x: 5, y: 6, width: 7, height: 8 } },
    ],
  };

  const spec = normalize({ screen, version });
  assert.deepEqual(spec.layers[0].rect, { x: 580, y: 1358, width: 1400, height: 100, absolute: { x: 580, y: 1358 } });
  assert.deepEqual(spec.layers[1].rect, { x: 0, y: 0, width: 240, height: 56, absolute: { x: 1160.5, y: 1358 } });
  assert.deepEqual(spec.layers[2].rect, { x: 5, y: 6, width: 7, height: 8 });
});

test("normalize exposes the screen density scale", () => {
  const screen = { name: "D", image: { width: 2560, height: 9000 } };
  const version = { layers: [], density_scale: 2 };

  const spec = normalize({ screen, version });
  assert.equal(spec.screen.densityScale, 2);

  const noDensity = normalize({ screen, version: { layers: [] } });
  assert.equal(noDensity.screen.densityScale, null);
});

test("normalize keeps componentName, borders, shadows, and non-default opacity/blend/rotation", () => {
  const screen = { name: "Rich", image: { width: 375, height: 812 } };
  const version = {
    layers: [
      {
        id: "footer", type: "group", name: "footer", source_id: "SRC-1",
        component_name: "footer/logged-out",
        rect: { x: 0, y: 800, width: 375, height: 70 },
        opacity: 0.5, blend_mode: "multiply", rotation: 90,
        borders: [{ thickness: 1, color: { r: 230, g: 231, b: 235, a: 1 }, position: "center" }],
        shadows: [{ type: "outer", offset_x: 0, offset_y: 3, blur_radius: 4, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.1 } }],
      },
      {
        id: "plain", type: "shape", name: "plain",
        rect: { x: 0, y: 0, width: 10, height: 10 },
        opacity: 1, blend_mode: "normal", rotation: 0,
      },
    ],
  };

  const spec = normalize({ screen, version });
  const footer = spec.layers[0];
  const plain = spec.layers[1];

  assert.equal(footer.sourceId, "SRC-1");
  assert.equal(footer.componentName, "footer/logged-out");
  assert.equal(footer.opacity, 0.5);
  assert.equal(footer.blendMode, "multiply");
  assert.equal(footer.rotation, 90);
  assert.deepEqual(footer.borders, [{ thickness: 1, color: "#e6e7eb", position: "center" }]);
  assert.deepEqual(footer.shadows, [{ type: "outer", offsetX: 0, offsetY: 3, blur: 4, spread: 0, color: "#0000001a" }]);

  assert.equal(plain.componentName, undefined);
  assert.equal(plain.borders, undefined);
  assert.equal(plain.shadows, undefined);
  assert.equal(plain.opacity, undefined);
  assert.equal(plain.blendMode, undefined);
  assert.equal(plain.rotation, undefined);
});

test("normalize emits per-range textStyles", () => {
  const screen = { name: "T", image: { width: 100, height: 100 } };
  const version = {
    layers: [
      {
        id: "t", type: "text", name: "t", content: "AB",
        rect: { x: 0, y: 0, width: 20, height: 10 },
        text_styles: [
          { range: { location: 0, length: 1 }, style: { font_family: "Inter", font_size: 12, font_weight: 400, color: { r: 0, g: 0, b: 0, a: 1 } } },
          { range: { location: 1, length: 1 }, style: { font_family: "Inter", font_size: 12, font_weight: 700, color: { r: 255, g: 0, b: 0, a: 1 } } },
        ],
      },
    ],
  };

  const spec = normalize({ screen, version });
  assert.equal(spec.layers[0].textStyles.length, 2);
  assert.deepEqual(spec.layers[0].textStyles[1], {
    range: { location: 1, length: 1 },
    fontFamily: "Inter", fontSize: 12, fontWeight: 700,
    lineHeight: null, letterSpacing: null, textAlign: null, color: "#ff0000",
  });
});

test("normalize maps annotations and defaults to empty", () => {
  const screen = { name: "A", image: { width: 1, height: 1 } };
  const version = { layers: [] };

  const withNone = normalize({ screen, version });
  assert.deepEqual(withNone.annotations, []);

  const annotations = [
    { type: { name: "comment" }, content: "Use the shared Button here", position: { x: 10, y: 20 } },
    { type: "note", content: "Spacing is 8px", rect: { x: 1, y: 2 } },
  ];
  const withSome = normalize({ screen, version, annotations });
  assert.deepEqual(withSome.annotations, [
    { type: "comment", content: "Use the shared Button here", rect: { x: 10, y: 20 } },
    { type: "note", content: "Spacing is 8px", rect: { x: 1, y: 2 } },
  ]);
});
