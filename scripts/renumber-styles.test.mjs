import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renumberStyles } from './renumber-styles.mjs';

describe('renumberStyles', () => {
  it('cierra los huecos, conserva el orden y reescribe los @import', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'renumber-'));
    for (const name of ['index', 'theme']) {
      fs.mkdirSync(path.join(root, 'src/styles', name), { recursive: true });
      for (const file of name === 'index' ? ['01-a.css', '03-b.css', '04-c.css'] : ['01-x.css', '02-y.css']) fs.writeFileSync(path.join(root, 'src/styles', name, file), `/* ${file} */`);
      fs.writeFileSync(path.join(root, `src/${name}.css`), `/* cabecera */\n@import './styles/${name}/01-a.css';\n`);
    }
    expect(renumberStyles(root)).toEqual(['index/03-b.css -> 02-b.css', 'index/04-c.css -> 03-c.css']);
    expect(fs.readdirSync(path.join(root, 'src/styles/index'))).toEqual(['01-a.css', '02-b.css', '03-c.css']);
    expect(fs.readFileSync(path.join(root, 'src/styles/index/02-b.css'), 'utf8')).toBe('/* 03-b.css */');
    const aggregator = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
    expect(aggregator).toBe("/* cabecera */\n@import './styles/index/01-a.css';\n@import './styles/index/02-b.css';\n@import './styles/index/03-c.css';\n");
    expect(renumberStyles(root)).toEqual([]);
  });
});
