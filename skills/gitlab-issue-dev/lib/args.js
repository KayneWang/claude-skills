const USAGE = "Usage: gitlab.js mr <source-branch> --issue <iid> --title <t> --description <d>";

export function parseMrArgs(argv) {
  const [sourceBranch, ...rest] = argv;
  if (!sourceBranch || sourceBranch.startsWith("--")) throw new Error(USAGE);
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (flag === "--issue") opts.issueIid = Number(value);
    else if (flag === "--title") opts.title = value;
    else if (flag === "--description") opts.description = value;
    else throw new Error(`Unknown flag: ${flag}\n${USAGE}`);
  }
  if (!opts.issueIid || Number.isNaN(opts.issueIid)) throw new Error(`--issue <iid> is required\n${USAGE}`);
  if (!opts.title) throw new Error(`--title is required\n${USAGE}`);
  if (opts.description === undefined) throw new Error(`--description is required\n${USAGE}`);
  return { sourceBranch, ...opts };
}
