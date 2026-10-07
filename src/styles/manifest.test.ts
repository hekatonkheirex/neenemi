import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe.each(['index', 'theme'])('src/%s.css', (name) => {
  const aggregator = fs.readFileSync(`src/${name}.css`, 'utf8');
  const files = fs.readdirSync(`src/styles/${name}`).sort();

  it('solo contiene comentario y @import', () => {
    const rest = aggregator.split('\n').filter((line) => line.trim() && !line.startsWith('/*') && !line.startsWith('@import'));
    expect(rest).toEqual([]);
  });

  it('ningún trozo está vacío ni solo con comentarios (Vite avisa "is empty")', () => {
    for (const file of files) {
      const text = fs.readFileSync(`src/styles/${name}/${file}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(text.trim(), file).not.toBe('');
    }
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
