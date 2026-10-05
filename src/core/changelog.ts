export type ChangelogEntry = { version: string; date: string; text: string };

const HEADING = /^## (\d+\.\d+\.\d+) · (\d{4}-\d{2}-\d{2})\s*$/;

/** Reads CHANGELOG.md: one `## X.Y.Z · AAAA-MM-DD` heading per version, the text below it belongs to that version. Order is kept. */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let body: string[] = [];
  const flush = () => { const last = entries[entries.length - 1]; if (last) last.text = body.join('\n').trim(); body = []; };
  for (const line of markdown.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) { flush(); entries.push({ version: heading[1], date: heading[2], text: '' }); } else if (entries.length) body.push(line);
  }
  flush();
  return entries;
}
