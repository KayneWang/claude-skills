// Zeplin's REST API returns colors with r/g/b as 8-bit integer channels
// (0–255) and alpha as a 0–1 float — this scale is baked into the tests. If
// Zeplin ever switches to 0–1 float channels, this conversion must change too.
// `|| 0` guards against missing/NaN channels so we never emit `#nannannan`.
const to2 = (n) => (Math.round(Number(n)) || 0).toString(16).padStart(2, "0");

export function rgbaToHex({ r, g, b, a = 1 } = {}) {
  const base = `#${to2(r)}${to2(g)}${to2(b)}`;
  return a < 1 ? `${base}${to2(a * 255)}` : base;
}
