const RE = /\/project\/([^/]+)\/screen\/([^/?#]+)(?:\/version\/([^/?#]+))?/;

export function parseScreenUrl(url) {
  const m = RE.exec(String(url));
  if (!m) {
    throw new Error(
      `Could not parse Zeplin screen URL: ${url}\n` +
        `Expected form: https://app.zeplin.io/project/<projectId>/screen/<screenId>`
    );
  }
  return { projectId: m[1], screenId: m[2], versionId: m[3] ?? null };
}
