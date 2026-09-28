import { describe, expect, it } from 'vitest';
import {
  analyzeSoftwareRequirements,
  findSoftwareGaps,
  recommendSoftware,
  stripAccents,
} from './analysis';

describe('software selector analysis', () => {
  it('normalizes accents and detects requirements from pasted Spanish text', () => {
    const result = analyzeSoftwareRequirements(
      'Se requiere autenticación con tarjetas, inicio de sesión único con Microsoft 365 y reportes por centro de costo.',
      'pliego.pdf',
    );

    expect(stripAccents('Autenticación Única')).toBe('Autenticacion Unica');
    expect(result.usedFallback).toBe(false);
    expect(result.selectedFeatureIds).toEqual(expect.arrayContaining([
      'secure_print_auth',
      'sso_idp_integration',
      'cost_tracking',
    ]));
    expect(result.reasoning.secure_print_auth).toContain('Coincidencia local');
  });

  it('keeps a useful local baseline when the text has no recognized terms', () => {
    const result = analyzeSoftwareRequirements('contenido sin requisitos identificables', 'vacio.txt');

    expect(result.usedFallback).toBe(true);
    expect(result.selectedFeatureIds).toEqual([
      'central_device_management',
      'device_status_alerts',
      'consumables_monitoring',
    ]);
  });

  it('scores products against manually selected features and identifies unsupported products', () => {
    const recommendations = recommendSoftware([
      'single_driver_hybrid',
      'scan_local_dms',
      'remote_resilience_rps',
      'device_status_alerts',
    ]);

    expect(recommendations[0]?.product.id).toBe('uniflow_hybrid');
    expect(recommendations[0]?.score).toBe(4);
    expect(recommendations).toHaveLength(4);
    expect(findSoftwareGaps(['serverless_no_infra'])).toEqual([]);
  });
});
