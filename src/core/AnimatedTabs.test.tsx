import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
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
});
