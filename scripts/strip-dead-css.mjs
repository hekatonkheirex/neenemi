// Quita del CSS los selectores con clases que un rediseño dejó de usar.
// Uso (tras migrar un módulo, con los .tsx antiguos aún en HEAD):
//   node scripts/strip-dead-css.mjs <archivo.tsx>...          # simulacro: lista clases y selectores
//   node scripts/strip-dead-css.mjs --write <archivo.tsx>...  # aplica
// Una clase está muerta si aparece en la versión de HEAD de esos archivos y ya no aparece en ningún .ts/.tsx de producción.
// ponytail: usa postcss, que llega con vite/tailwind (no es dependencia propia); si cambia el bundler, declararlo.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const TOKEN = /[a-z][a-z0-9]*(?:-[a-z0-9]+)+|\b[a-z][a-z0-9]{3,}\b/g;

export const tokensOf = (text) => new Set(text.match(TOKEN) ?? []);

export function findDeadClasses(oldSources, currentSources) {
  const old = new Set(oldSources.flatMap((text) => [...tokensOf(text)]));
  const now = tokensOf(currentSources.join('\n'));
  return new Set([...old].filter((token) => !now.has(token)));
}

/** Devuelve { css, removed, used }: sin los selectores con alguna clase muerta; las reglas que quedan vacías se eliminan. */
export function stripCss(css, dead) {
  const root = postcss.parse(css);
  let removed = 0;
  const used = new Set();
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes/.test(rule.parent.name)) return;
    const keep = rule.selectors.filter((selector) => {
      const hit = [...selector.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]).find((name) => dead.has(name));
      if (hit) used.add(hit);
      return !hit;
    });
    if (keep.length === rule.selectors.length) return;
    removed += rule.selectors.length - keep.length;
    if (keep.length === 0) rule.remove(); else rule.selectors = keep;
  });
  root.walkAtRules((at) => { if (at.nodes && at.nodes.length === 0) at.remove(); });
  return { css: root.toString(), removed, used };
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write');
  const targets = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (targets.length === 0) throw new Error('Indica los archivos .tsx migrados.');
  const source = walk('src').filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
  const dead = findDeadClasses(
    targets.map((file) => execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' })),
    source.map((file) => fs.readFileSync(file, 'utf8')),
  );
  let total = 0;
  const used = new Set();
  const touched = [];
  for (const file of walk('src').filter((name) => name.endsWith('.css'))) {
    const result = stripCss(fs.readFileSync(file, 'utf8'), dead);
    if (result.removed === 0) continue;
    total += result.removed;
    result.used.forEach((name) => used.add(name));
    touched.push(file);
    if (write) fs.writeFileSync(file, result.css);
  }
  console.log(`clases muertas con CSS: ${[...used].sort().join(' ')}`);
  console.log(`${write ? 'archivos modificados' : 'archivos afectados'}: ${touched.join(', ')}`);
  console.log(`selectores quitados: ${total}${write ? '' : ' (simulacro; usa --write)'}`);
}
