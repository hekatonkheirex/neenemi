import type { Express } from 'express';
import type { SuiteDatabase } from '../../db/database';
import { isPositiveInteger, isRecord } from '../../core/validation';
import { UNIFLOW_DEVICE_MODELS } from './catalog';
import { calculateUniflowConfiguration } from './pricing';
import { UniflowRepository } from './repository';
import type { UniflowAddedDevice, UniflowConfigurationInput, UniflowPriceCatalog } from './types';

function parseUniflowConfigurationInput(value: unknown): UniflowConfigurationInput | null {
  if (!isRecord(value) || !isPositiveInteger(value.months) || !Array.isArray(value.devices) || value.devices.length === 0 || value.devices.length > 100) {
    return null;
  }
  const devices: UniflowAddedDevice[] = [];
  for (const [index, item] of value.devices.entries()) {
    if (!isRecord(item) || typeof item.modelName !== 'string' || !isPositiveInteger(item.quantity)) return null;
    if (item.withCIP !== undefined && typeof item.withCIP !== 'boolean') return null;
    devices.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `row-${index + 1}`,
      modelName: item.modelName,
      quantity: item.quantity,
      withCIP: item.withCIP === true,
    });
  }
  return { months: value.months, devices };
}

export function registerUniflowRoutes(app: Express, database: SuiteDatabase): void {
  const uniflow = new UniflowRepository(database);

  app.get('/api/uniflow/models', (_request, response) => {
    response.json(UNIFLOW_DEVICE_MODELS);
  });

  app.get('/api/uniflow/catalog', (_request, response) => {
    response.json(uniflow.getCatalog());
  });

  app.put('/api/uniflow/catalog', (request, response) => {
    if (!isRecord(request.body)) {
      response.status(400).json({ error: 'El catálogo uniFLOW no es válido.' });
      return;
    }
    try {
      response.json(uniflow.saveCatalog(request.body as UniflowPriceCatalog));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el catálogo uniFLOW.' });
    }
  });

  app.post('/api/uniflow/configure', (request, response) => {
    const input = parseUniflowConfigurationInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'months y devices deben contener una configuración válida.' });
      return;
    }
    response.json(calculateUniflowConfiguration(input.devices, input.months, uniflow.getCatalog()));
  });
}
