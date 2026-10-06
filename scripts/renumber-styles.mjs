// Renumera los trozos de src/styles/{index,theme} sin huecos y reescribe los @import de src/{index,theme}.css.
// Uso: node scripts/renumber-styles.mjs [raíz=.] (tras borrar o añadir un trozo).
import fs from 'node:fs';
import path from 'node:path';

export function renumberStyles(root) {
  const renames = [];
  for (const name of ['index', 'theme']) {
    const dir = path.join(root, 'src/styles', name);
    const files = fs.readdirSync(dir).filter((f) => /^\d{2}-.+\.css$/.test(f)).sort();
    const plan = files.map((file, i) => ({ from: file, to: `${String(i + 1).padStart(2, '0')}-${file.slice(3)}` }));
    // Dos pasos (nombre temporal) para que un destino no pise un origen que aún no se movió.
    for (const { from } of plan) fs.renameSync(path.join(dir, from), path.join(dir, `.tmp-${from}`));
    for (const { from, to } of plan) fs.renameSync(path.join(dir, `.tmp-${from}`), path.join(dir, to));
    const aggregator = path.join(root, `src/${name}.css`);
    let text = fs.readFileSync(aggregator, 'utf8');
    const head = text.split('\n').filter((line) => !line.startsWith('@import')).join('\n').replace(/\n+$/, '');
    text = `${head}\n${plan.map(({ to }) => `@import './styles/${name}/${to}';`).join('\n')}\n`;
    fs.writeFileSync(aggregator, text);
    renames.push(...plan.filter(({ from, to }) => from !== to).map(({ from, to }) => `${name}/${from} -> ${to}`));
  }
  return renames;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const renames = renumberStyles(path.resolve(process.argv[2] ?? '.'));
  console.log(renames.length ? renames.join('\n') : 'Sin cambios.');
}
