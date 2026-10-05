import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// El orden de los @import es el orden de la cascada: este test impide perder, duplicar o reordenar trozos sin querer.
describe.each(['index', 'theme'])('src/%s.css', (name) => {
  const aggregator = fs.readFileSync(`src/${name}.css`, 'utf8');
  const imports = [...aggregator.matchAll(/^@import '\.\/styles\/(\w+)\/(\d{2})-([\w-]+)\.css';$/gm)];
  const files = fs.readdirSync(`src/styles/${name}`).sort();

  it('solo contiene comentario y @import', () => {
    const rest = aggregator.split('\n').filter((line) => line.trim() && !line.startsWith('/*') && !line.startsWith('@import'));
    expect(rest).toEqual([]);
  });

  it('importa cada trozo una vez, numerado sin huecos y en orden', () => {
    expect(imports.map((m) => `${m[2]}-${m[3]}.css`)).toEqual(files);
    expect(imports.map((m) => Number(m[2]))).toEqual(files.map((_, i) => i + 1));
  });

  it('ningún trozo empieza con una regla cortada a la mitad', () => {
    for (const file of files) {
      const text = fs.readFileSync(`src/styles/${name}/${file}`, 'utf8');
      const open = (text.match(/{/g) || []).length;
      const close = (text.match(/}/g) || []).length;
      expect(open, file).toBe(close);
    }
  });
});
