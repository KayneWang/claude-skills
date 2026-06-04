import { test } from "node:test";
import assert from "node:assert/strict";
import { flattenLayers, normalize } from "../lib/normalize.js";

test("flattenLayers walks nested groups depth-first", () => {
  const tree = [
    { id: "g", type: "group", layers: [{ id: "a", type: "text" }, { id: "b", type: "shape" }] },
    { id: "c", type: "text" },
  ];
  assert.deepEqual(flattenLayers(tree).map((l) => l.id), ["g", "a", "b", "c"]);
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

  assert.deepEqual(spec.screen, { name: "Login", width: 375, height: 812 });
  assert.deepEqual(spec.tokens.colors, { primary: "#007aff" });
  assert.deepEqual(spec.layers[0], {
    id: "title", type: "text", name: "Title",
    rect: { x: 16, y: 40, width: 200, height: 28 },
    borderRadius: 0, content: "Welcome",
    fills: [{ hex: "#000000", token: null }],
    textStyle: { fontFamily: "Inter", fontSize: 24, fontWeight: 600, lineHeight: null, letterSpacing: null, textAlign: "left", color: "#000000" },
  });
  assert.deepEqual(spec.layers[1].fills, [{ hex: "#007aff", token: "primary" }]);
  assert.equal(spec.layers[1].borderRadius, 8);
  assert.equal(spec.layers[1].textStyle, null);
});

test("normalize drops non-color fills and defaults missing fills/rect", () => {
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
