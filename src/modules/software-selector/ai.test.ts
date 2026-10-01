import { describe, expect, it } from 'vitest';
import { analyzeSoftwareRequirements } from './analysis';
import { buildSoftwareAiPrompt, mergeAiFeatures } from './ai';
import { SOFTWARE_FEATURES } from './catalog';

describe('software selector AI step', () => {
  it('offers the model every real catalog id and none of the retired keys', () => {
    const prompt = buildSoftwareAiPrompt('pliego');
    for (const feature of SOFTWARE_FEATURES) expect(prompt).toContain(`- ${feature.id}:`);
    for (const retired of ['print-management', 'secure-print', 'rfid-auth', 'ha-clustering']) expect(prompt).not.toContain(retired);
  });

  it('truncates very long documents in the prompt', () => {
    expect(buildSoftwareAiPrompt('x'.repeat(100_000)).length).toBeLessThan(30_000 + 8_000);
  });

  it('merges only catalog ids, deduplicates and keeps the local reasoning', () => {
    const base = analyzeSoftwareRequirements('Se requiere lector de tarjetas y liberacion segura.');
    expect(base.selectedFeatureIds).toContain('secure_print_auth');
    const { analysis, rejected } = mergeAiFeatures(base, ['secure_print_auth', 'cloud_ocr', 'secure-print', 42, null]);
    expect(analysis.selectedFeatureIds).toEqual([...base.selectedFeatureIds, 'cloud_ocr']);
    expect(rejected).toEqual(['secure-print', '42', 'null']);
    expect(analysis.source).toBe('IA Gemini');
    expect(analysis.reasoning.secure_print_auth).toBe(base.reasoning.secure_print_auth);
    expect(analysis.reasoning.cloud_ocr).toContain('Detectado por IA Gemini');
    expect(base.source).toBe('heurística local');
    expect(base.selectedFeatureIds).not.toContain('cloud_ocr');
  });
});
