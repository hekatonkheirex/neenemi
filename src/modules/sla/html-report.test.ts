import { describe, expect, it } from 'vitest';
import { analyzeSlaRequirements } from './analysis';
import { buildSlaHtmlReport } from './html-report';

describe('SLA HTML report', () => {
  it('renders the complete local report and escapes document content', () => {
    const analysis = analyzeSlaRequirements('Horario de atención de 8x5 y canales oficiales.', 'pliego <cliente>.txt');
    const html = buildSlaHtmlReport({
      ...analysis,
      summary: '<script>alert("x")</script>',
      items: analysis.items.map((item) => ({ ...item, advice: '<b>Revisar</b>' })),
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Matriz de cumplimiento');
    expect(html).toContain('pliego &lt;cliente&gt;.txt');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Revisar&lt;/b&gt;');
    expect(html).not.toContain('<script>alert("x")</script>');
  });
});
