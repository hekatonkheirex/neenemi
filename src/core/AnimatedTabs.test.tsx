import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Airplane01Icon } from '@hugeicons/core-free-icons';
import AnimatedTabs from './AnimatedTabs';

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
    const html = renderToStaticMarkup(<AnimatedTabs tabs={[{ id: 'a', label: 'Uno', icon: Airplane01Icon }, { id: 'b', label: 'Dos' }]} active="a" onChange={() => {}} ariaLabel="V" />);
    expect(html.match(/anim-tabs-icon/g)).toHaveLength(1);
    expect(html).toContain('<svg');
  });

  it('scroll añade la clase de una sola fila; sin él no', () => {
    const on = renderToStaticMarkup(<AnimatedTabs scroll tabs={[{ id: 'a', label: 'Uno' }]} active="a" onChange={() => {}} ariaLabel="V" />);
    const off = renderToStaticMarkup(<AnimatedTabs tabs={[{ id: 'a', label: 'Uno' }]} active="a" onChange={() => {}} ariaLabel="V" />);
    expect(on).toContain('anim-tabs is-scroll');
    expect(off).not.toContain('is-scroll');
  });
});
