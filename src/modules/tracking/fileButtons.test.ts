import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./TrackingModule.tsx', import.meta.url), 'utf8');

describe('Tracking: selectores de archivo', () => {
  it('usan el boton unificado (secondary-button file-button), no el input nativo', () => {
    const inputs = source.match(/<input type="file"[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(2);
    expect(source.match(/<label className="secondary-button file-button">/g)).toHaveLength(2);
    for (const input of inputs) expect(input).toContain('aria-label=');
  });
});
