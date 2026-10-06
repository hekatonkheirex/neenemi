import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Con el rediseño completo, estas clases globales ya no las usa ningún componente y su CSS se retiró.
// Si una vuelve a aparecer en un .tsx, el estilo no existe: usa las primitivas de src/core/ui.
const RETIRED = [
  'sales-card', 'card-heading', 'muted-note', 'catalog-table', 'catalog-table-wrap', 'summary-card', 'summary-grid',
  'secondary-button', 'primary-button', 'text-button', 'icon-button', 'search-field', 'compact-field', 'sales-status',
  'catalog-header', 'form-card', 'form-hint', 'table-secondary-text', 'code-cell', 'empty-cell', 'empty-inline',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('CSS heredado retirado', () => {
  const classNames = walk('src').flatMap((file) => [...fs.readFileSync(file, 'utf8').matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/g)].map((match) => ({ file, text: match[1] ?? match[2] })));
  const css = ['src/index.css', 'src/theme.css'].flatMap((entry) => [...fs.readFileSync(entry, 'utf8').matchAll(/'\.\/([^']+)'/g)].map((match) => fs.readFileSync(path.join('src', match[1]), 'utf8'))).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

  it.each(RETIRED)('ningún componente usa .%s', (name) => {
    const pattern = new RegExp(`(?:^|[\\s"'\`])${name}(?=$|[\\s"'\`])`);
    expect(classNames.filter(({ text }) => pattern.test(text)).map(({ file }) => file)).toEqual([]);
  });

  it.each(RETIRED)('el CSS ya no define .%s', (name) => {
    expect(css).not.toMatch(new RegExp(`\\.${name}(?![\\w-])`));
  });
});
