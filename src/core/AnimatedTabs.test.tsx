import { Plane } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import AnimatedTabs, { centeredScrollLeft, followingSiblings } from './AnimatedTabs';

describe('AnimatedTabs', () => {
  const tabs = [{ id: 'a', label: 'Uno', step: '01' }, { id: 'b', label: 'Dos', count: '5' }] as const;

  it('marca solo la pestaña activa y le da el indicador', () => {
    const html = renderToStaticMarkup(<AnimatedTabs tabs={tabs} active="b" onChange={() => {}} ariaLabel="Vistas" />);
    expect(html).toContain('aria-label="Vistas"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.match(/anim-tabs-indicator/g)).toHaveLength(1);
    expect(html).toMatch(/is-active[^>]*aria-current="page"[^>]*>.*Dos.*<strong>5<\/strong>/);
    expect(html).toContain('<span>01</span>');
    expect(html).not.toContain('has-hint');
  });

  it('con hint apila la etiqueta y su subtítulo', () => {
    const html = renderToStaticMarkup(<AnimatedTabs tabs={[{ id: 'a', label: 'Uno', hint: 'Sub' }]} active="a" onChange={() => {}} ariaLabel="V" />);
    expect(html).toContain('anim-tabs has-hint');
    expect(html).toContain('<em>Uno</em><small>Sub</small>');
  });

  it('dibuja el icono solo en las pestañas que lo traen', () => {
    const html = renderToStaticMarkup(<AnimatedTabs tabs={[{ id: 'a', label: 'Uno', icon: Plane }, { id: 'b', label: 'Dos' }]} active="a" onChange={() => {}} ariaLabel="V" />);
    expect(html.match(/anim-tabs-icon/g)).toHaveLength(1);
    expect(html).toContain('<svg');
  });

  it('scroll añade la clase de una sola fila; sin él no', () => {
    const on = renderToStaticMarkup(<AnimatedTabs scroll tabs={[{ id: 'a', label: 'Uno' }]} active="a" onChange={() => {}} ariaLabel="V" />);
    const off = renderToStaticMarkup(<AnimatedTabs tabs={[{ id: 'a', label: 'Uno' }]} active="a" onChange={() => {}} ariaLabel="V" />);
    expect(on).toContain('anim-tabs is-scroll');
    expect(off).not.toContain('is-scroll');
  });

  it('centeredScrollLeft centra el botón y respeta los extremos', () => {
    const nav = { left: 100, width: 400, scrollLeft: 0, scrollWidth: 1500 };
    expect(centeredScrollLeft(nav, { left: 700, width: 100 })).toBe(450); // 0 + 600 - 150
    expect(centeredScrollLeft(nav, { left: 110, width: 100 })).toBe(0);   // cerca del inicio: no negativo
    expect(centeredScrollLeft({ ...nav, scrollLeft: 1000 }, { left: 450, width: 100 })).toBe(1100); // tope: 1500 - 400
    expect(centeredScrollLeft({ ...nav, scrollLeft: 300 }, { left: 300, width: 100 })).toBe(300 + 200 - 150);
    expect(centeredScrollLeft({ left: 0, width: 800, scrollLeft: 0, scrollWidth: 800 }, { left: 500, width: 100 })).toBe(0); // sin desborde
  });
});

describe('transición de panel', () => {
  it('followingSiblings devuelve solo lo que sigue a la barra, en orden', () => {
    expect(followingSiblings(['hero', 'nav', 'status', 'panel'], 'nav')).toEqual(['status', 'panel']);
    expect(followingSiblings(['nav'], 'nav')).toEqual([]);
    expect(followingSiblings(['a', 'b'], 'x')).toEqual([]);
  });
  it('se anima con Framer Motion y se omite con movimiento reducido', () => {
    const source = fs.readFileSync('src/core/AnimatedTabs.tsx', 'utf8');
    expect(source).toMatch(/mounted\.current && !still/);
    expect(source).toMatch(/animate\(panel as HTMLElement\[\], \{ opacity: \[0, 1\], y: \[8, 0\] \}/);
  });
  it('el cambio de módulo entra con fundido y respeta prefers-reduced-motion', () => {
    const app = fs.readFileSync('src/app/App.tsx', 'utf8');
    expect(app).toContain('<MotionConfig reducedMotion="user">');
    expect(app).toMatch(/<motion\.div key=\{activeModuleId \?\? 'inicio'\}/);
  });
});
