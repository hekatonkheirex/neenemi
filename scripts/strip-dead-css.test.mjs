import { describe, expect, it } from 'vitest';
import { findDeadClasses, stripCss } from './strip-dead-css.mjs';

describe('strip-dead-css', () => {
  it('una clase solo es muerta si estaba antes y ya no aparece en ningún fuente', () => {
    const dead = findDeadClasses(['<div className="old-card shared-card" />'], ['<div className="shared-card" />', 'const x = "other-thing"']);
    expect([...dead]).toEqual(['old-card']);
  });

  it('quita solo los selectores muertos de un grupo y elimina la regla vacía', () => {
    const css = '.old-card, .shared-card { color: red; }\n.old-card .inner { margin: 0; }\n@media (min-width: 1px) { .old-card { display: none; } }\n@keyframes old-card-in { from { opacity: 0; } }\n';
    const { css: out, removed } = stripCss(css, new Set(['old-card']));
    expect(removed).toBe(3);
    expect(out).toMatch(/\.shared-card\s*{/);
    expect(out).not.toMatch(/\.old-card/);
    expect(out).not.toMatch(/@media/);
    expect(out).toMatch(/@keyframes old-card-in/);
  });
});
