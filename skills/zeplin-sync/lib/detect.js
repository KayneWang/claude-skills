import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Accepts a Buffer or a file path; returns the sha256 hex digest of its bytes.
export function hashFile(input) {
  const buf = Buffer.isBuffer(input) ? input : readFileSync(input);
  return createHash("sha256").update(buf).digest("hex");
}
