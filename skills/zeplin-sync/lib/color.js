const to2 = (n) => Math.round(n).toString(16).padStart(2, "0");

export function rgbaToHex({ r, g, b, a = 1 }) {
  const base = `#${to2(r)}${to2(g)}${to2(b)}`;
  return a < 1 ? `${base}${to2(a * 255)}` : base;
}
