import fs from 'node:fs';
import path from 'node:path';

/** CSS con los @import resueltos en orden, como lo compila Vite. */
export function readCssBundle(file: string): string {
  const absolute = path.resolve(file);
  const text = fs.readFileSync(absolute, 'utf8');
  return text.replace(/^@import\s+'([^']+)';\n?/gm, (_match, target: string) =>
    readCssBundle(path.resolve(path.dirname(absolute), target)));
}
