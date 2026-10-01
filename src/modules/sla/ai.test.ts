import { describe, expect, it } from 'vitest';
import { buildSlaAiPrompt, mergeAiSlaItems } from './ai';

describe('SLA AI step', () => {
  it('asks for the three fields and truncates long documents', () => {
    const prompt = buildSlaAiPrompt('y'.repeat(100_000));
    for (const field of ['section', 'excerpt', 'requirement']) expect(prompt).toContain(`- ${field}:`);
    expect(prompt.length).toBeLessThan(30_000 + 1_000);
  });

  it('appends AI items as gaps to the local analysis and skips malformed entries', () => {
    const baseCount = mergeAiSlaItems('Texto sin cláusulas.', 'p.txt', []).items.length;
    const merged = mergeAiSlaItems('Texto sin cláusulas.', 'p.txt', [
      { section: '3.1', excerpt: 'Respuesta en 4 horas', requirement: 'Responder en 4 horas' },
      { excerpt: 'Sin sección' },
      null,
      'texto suelto',
      42,
    ]);
    expect(merged.source).toBe('IA OpenRouter');
    expect(merged.items).toHaveLength(baseCount + 2);
    const added = merged.items.slice(baseCount);
    expect(added[0]).toMatchObject({ category: '3.1', clientSource: 'Respuesta en 4 horas', status: 'gap', ourSource: 'Detectado por IA' });
    expect(added[1]).toMatchObject({ category: 'General', clientRequirement: '' });
    expect(new Set(added.map((item) => item.id)).size).toBe(2);
  });
});
