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
  const version = {
    layers: [
      {
        id: "title", type: "text", name: "Title",
        rect: { x: 16, y: 40, width: 200, height: 28 },
        content: "Welcome",
        fills: [{ type: "color", color: { r: 0, g: 0, b: 0, a: 1 } }],
        textStyles: [{ style: { fontFamily: "Inter", fontSize: 24, fontWeight: 600, lineHeight: 28, letterSpacing: 0, color: { r: 0, g: 0, b: 0, a: 1 } } }],
        borderRadius: 0,
      },
      {
        id: "cta", type: "shape", name: "Button",
        rect: { x: 16, y: 700, width: 343, height: 48 },
        fills: [{ type: "color", color: { r: 0, g: 122, b: 255, a: 1 } }],
        borderRadius: 8,
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
    textStyle: { fontFamily: "Inter", fontSize: 24, fontWeight: 600, lineHeight: 28, letterSpacing: 0, color: "#000000" },
  });
  assert.deepEqual(spec.layers[1].fills, [{ hex: "#007aff", token: "primary" }]);
  assert.equal(spec.layers[1].textStyle, null);
});
