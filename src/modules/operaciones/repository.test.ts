import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import { OperationsRepository } from './repository';

const temporaryDirectories: string[] = [];

function makeDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-operations-'));
  temporaryDirectories.push(directory);
  return openDatabase(path.join(directory, 'suite.sqlite'));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('OperationsRepository', () => {
  it('normalizes customers and groups their contracts and installed equipment', () => {
    const database = makeDatabase();
    const operations = new OperationsRepository(database);

    const customer = operations.saveCustomer({
      name: '  Compañía   de Prueba  ',
      customerType: 'Privado',
      commercialArea: 'Commercial',
    });
    const sameCustomer = operations.saveCustomer({ name: 'COMPANIA DE PRUEBA', customerType: 'Privado' });

    expect(sameCustomer.id).toBe(customer.id);
    expect(operations.saveContract({
      customerId: customer.id,
      reference: 'OV-001',
      orderReference: '105000',
      contractType: 'Mantenimiento',
      startsAt: '2026-01-01',
      endsAt: '2026-12-31',
      division: 'Fotocopiadoras',
      isActive: true,
      requiresClosure: true,
      equipment: [
        {
          modelLabel: 'iR ADV C3325i',
          serialNumber: 'SER-001',
          location: 'Casa central',
          brand: 'Canon',
          description: 'Equipo color de producción',
          interior: 'Piso 2',
          city: 'Asunción',
          branch: 'Casa central',
          address: 'Av. España 123',
          isActive: true,
        },
        { modelLabel: 'iR ADV C3325i', serialNumber: 'SER-002', location: 'Sucursal' },
      ],
    })).toMatchObject({
      customerId: customer.id,
      reference: 'OV-001',
      contractType: 'Mantenimiento',
      equipment: expect.arrayContaining([
        expect.objectContaining({
          modelLabel: 'iR ADV C3325i',
          serialNumber: 'SER-001',
          brand: 'Canon',
          description: 'Equipo color de producción',
          interior: 'Piso 2',
          city: 'Asunción',
          branch: 'Casa central',
          address: 'Av. España 123',
          isActive: true,
        }),
        expect.objectContaining({ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-002' }),
      ]),
    });

    expect(operations.listCustomers()).toEqual([
      expect.objectContaining({
        id: customer.id,
        name: 'COMPANIA DE PRUEBA',
        customerType: 'Privado',
        commercialArea: 'Commercial',
        contracts: [expect.objectContaining({ reference: 'OV-001', equipment: expect.any(Array) })],
      }),
    ]);
    expect(operations.listEquipment('ser-002')).toEqual([
      expect.objectContaining({ customerName: 'COMPANIA DE PRUEBA', serialNumber: 'SER-002' }),
    ]);
    expect(operations.listEquipment('OV-001')).toEqual(expect.arrayContaining([
      expect.objectContaining({ customerName: 'COMPANIA DE PRUEBA', contractReference: 'OV-001', orderReference: '105000' }),
    ]));
    expect(operations.listEquipment('105000')).toEqual(expect.arrayContaining([
      expect.objectContaining({ customerName: 'COMPANIA DE PRUEBA', orderReference: '105000' }),
    ]));
    expect(operations.listEquipment('Av. España 123')).toEqual([
      expect.objectContaining({ customerName: 'COMPANIA DE PRUEBA', address: 'Av. España 123' }),
    ]);
    expect(operations.listEquipment('2026-01-01')).toEqual(expect.arrayContaining([
      expect.objectContaining({ contractStartsAt: '2026-01-01', contractEndsAt: '2026-12-31' }),
    ]));
    expect(operations.listEquipment('fotocopiadoras')).toEqual(expect.arrayContaining([
      expect.objectContaining({ contractDivision: 'Fotocopiadoras' }),
    ]));
    expect(operations.listEquipment('requiere cierre')).toEqual(expect.arrayContaining([
      expect.objectContaining({ contractRequiresClosure: true, contractIsActive: true }),
    ]));
    expect(operations.listCustomers('SER-002')).toEqual([
      expect.objectContaining({ name: 'COMPANIA DE PRUEBA' }),
    ]);
    expect(operations.listCustomers('casa central')).toEqual([
      expect.objectContaining({ name: 'COMPANIA DE PRUEBA' }),
    ]);

    database.close();
  });

  it('imports a legacy portfolio into shared customers, contracts and equipment without duplicates', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const operations = new OperationsRepository(database);
    const batchId = imports.createBatch({ domain: 'operations', sourceName: 'cartera.xlsx' });

    const result = operations.importLegacyPortfolio(batchId, [
      {
        customerName: 'Cliente Histórico',
        customerType: 'Publico',
        commercialArea: 'Strategic',
        contractReference: 'OV-HIST-001',
        orderReference: null,
        contractType: 'Alquiler',
        startsAt: '2026-01-01',
        endsAt: '2026-12-31',
        division: null,
        active: true,
        modelLabel: 'iR ADV C3325i',
        brand: null,
        description: null,
        serialNumber: 'SER-HIST-001',
        interior: null,
        city: null,
        branch: null,
        address: null,
        location: 'Casa central',
        sourceDetails: [{ label: 'Sector', value: 'Público' }],
        sourceSheetName: 'Cartera',
        sourceRowNumber: 2,
      },
      {
        customerName: 'CLIENTE HISTORICO',
        customerType: null,
        commercialArea: null,
        contractReference: 'OV-HIST-001',
        orderReference: null,
        contractType: 'Alquiler',
        startsAt: null,
        endsAt: null,
        division: null,
        active: true,
        modelLabel: 'IR ADV C3325I',
        brand: null,
        description: null,
        serialNumber: 'SER-HIST-001',
        interior: null,
        city: null,
        branch: null,
        address: null,
        location: null,
      },
    ]);

    expect(result).toEqual({ customers: 1, contracts: 1, equipment: 1 });
    expect(operations.listCustomers()).toEqual([
      expect.objectContaining({
        name: 'Cliente Histórico',
        customerType: 'Publico',
        commercialArea: 'Strategic',
        contracts: [expect.objectContaining({
          reference: 'OV-HIST-001',
          contractType: 'Alquiler',
          equipment: [expect.objectContaining({ serialNumber: 'SER-HIST-001', location: 'Casa central' })],
        })],
      }),
    ]);
    expect(operations.listCustomers()[0]?.contracts[0]).toMatchObject({
      sourceSheetName: 'Cartera',
      sourceRowNumber: 2,
      sourceDetails: [{ label: 'Sector', value: 'Público' }],
      equipment: [expect.objectContaining({
        sourceSheetName: 'Cartera',
        sourceRowNumber: 2,
        sourceDetails: [{ label: 'Sector', value: 'Público' }],
      })],
    });
    expect(imports.getBatch(batchId)).toEqual(expect.objectContaining({ status: 'applied' }));

    database.close();
  });

  it('imports separated legacy contract metadata and customer classification', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const operations = new OperationsRepository(database);
    const contractsBatchId = imports.createBatch({ domain: 'operations-fleet-contracts', sourceName: 'Contratos.xlsx' });

    expect(operations.importLegacyFleetMetadata(contractsBatchId, 'contracts', [
      {
        customerName: 'Cliente Separado',
        contractReference: 'REF-001',
        orderReference: 'OV-001',
        contractType: 'Leasing',
        startsAt: null,
        endsAt: null,
        customerType: null,
        commercialArea: null,
        division: 'MRA',
        active: true,
        requiresClosure: null,
        sourceDetails: [{ label: 'ID Con', value: 'ID-1' }],
        sourceSheetName: 'Contratos',
        sourceRowNumber: 2,
      },
    ])).toEqual({
      sourceType: 'contracts',
      customers: 1,
      contracts: 1,
      updatedCustomers: 0,
      updatedContracts: 0,
    });

    const detailsBatchId = imports.createBatch({ domain: 'operations-fleet-contract-details', sourceName: 'Detalles de contratos.xlsx' });
    expect(operations.importLegacyFleetMetadata(detailsBatchId, 'contract-details', [
      {
        customerName: 'CLIENTE SEPARADO',
        contractReference: 'REF-001',
        orderReference: 'OV-001',
        contractType: null,
        startsAt: '2026-01-01',
        endsAt: '2026-12-31',
        customerType: null,
        commercialArea: 'Commercial',
        contractCommercialArea: 'Commercial',
        division: null,
        active: true,
        requiresClosure: false,
        sourceDetails: [{ label: 'Área', value: 'Commercial' }],
        sourceSheetName: 'Detalle',
        sourceRowNumber: 2,
      },
    ])).toEqual({
      sourceType: 'contract-details',
      customers: 1,
      contracts: 1,
      updatedCustomers: 1,
      updatedContracts: 1,
    });

    const classificationBatchId = imports.createBatch({ domain: 'operations-fleet-classification', sourceName: 'clasificacion.xlsx' });
    expect(operations.importLegacyFleetMetadata(classificationBatchId, 'classification', [
      {
        customerName: 'Cliente Separado',
        contractReference: null,
        orderReference: null,
        contractType: null,
        startsAt: null,
        endsAt: null,
        customerType: 'Privado',
        commercialArea: 'Commercial',
        division: null,
        active: true,
        requiresClosure: null,
        sourceDetails: [{ label: 'Segmento original', value: 'Cliente estratégico' }],
        sourceSheetName: 'Clasificación',
        sourceRowNumber: 2,
      },
    ])).toEqual({
      sourceType: 'classification',
      customers: 1,
      contracts: 0,
      updatedCustomers: 1,
      updatedContracts: 0,
    });

    expect(operations.listCustomers()).toEqual([
      expect.objectContaining({
        name: 'Cliente Separado',
        customerType: 'Privado',
        commercialArea: 'Commercial',
        contracts: [expect.objectContaining({
          reference: 'REF-001',
          orderReference: 'OV-001',
          contractType: 'Leasing',
          startsAt: '2026-01-01',
          endsAt: '2026-12-31',
          commercialArea: 'Commercial',
          division: 'MRA',
          isActive: true,
          requiresClosure: false,
          sourceSheetName: 'Detalle',
          sourceRowNumber: 2,
          sourceDetails: [{ label: 'Área', value: 'Commercial' }],
        })],
      }),
    ]);
    expect(operations.listCustomers()[0]).toMatchObject({
      sourceDetails: [{ label: 'Segmento original', value: 'Cliente estratégico' }],
      sourceSheetName: 'Clasificación',
      sourceRowNumber: 2,
    });
    expect(operations.listCustomers('segmento original')).toEqual([
      expect.objectContaining({ name: 'Cliente Separado' }),
    ]);
    expect(imports.getBatch(classificationBatchId)).toEqual(expect.objectContaining({ status: 'applied' }));

    database.close();
  });

  it('imports Canon model support data separately from parts and crosses it with installed equipment', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const operations = new OperationsRepository(database);
    const customer = operations.saveCustomer({ name: 'Cliente Canon Modelos' });
    operations.saveContract({
      customerId: customer.id,
      contractType: 'Mantenimiento',
      equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-3325' }],
    });
    const batchId = imports.createBatch({ domain: 'operations-canon', sourceName: 'canon.xlsx' });

    expect(operations.importCanonDiscontinuation(batchId, [
      { modelLabel: 'iR-ADV C3325i', partCode: '', endsAt: '2025-01-10', source: 'canon.xlsx · Printer', voltage: '120', sourceNotes: ['Correo soporte'] },
      { modelLabel: 'iR ADV C3325i', partCode: 'Q30-3325-000', endsAt: '2027-12-01', source: 'canon.xlsx · Printer', voltage: '230' },
      { modelLabel: 'iR ADV C3325i', partCode: 'Q30-3325-000', endsAt: '2027-12-01', source: 'canon.xlsx · Printer' },
    ])).toEqual({ items: 2 });

    expect(operations.listModelDiscontinuation()).toEqual([
      expect.objectContaining({
        modelLabel: 'iR-ADV C3325i',
        partCode: '',
        endsAt: '2025-01-10',
        voltage: '120',
        sourceNotes: ['Correo soporte'],
        installedCount: 1,
        installedModels: ['iR ADV C3325i'],
        status: 'discontinued',
      }),
      expect.objectContaining({
        modelLabel: 'iR ADV C3325i',
        partCode: 'Q30-3325-000',
        endsAt: '2027-12-01',
        voltage: '230',
        installedCount: 1,
        status: 'scheduled',
      }),
    ]);
    expect(database.prepare('SELECT COUNT(*) AS count FROM parts').get()).toEqual({ count: 0 });
    expect(imports.getBatch(batchId)).toEqual(expect.objectContaining({ status: 'applied' }));

    database.close();
  });

  it('imports Waldbott Depot 04 stock, groups model variants and crosses it with support and portfolio', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const operations = new OperationsRepository(database);
    const customer = operations.saveCustomer({ name: 'Cliente Stock Waldbott' });
    operations.saveContract({
      customerId: customer.id,
      contractType: 'Mantenimiento',
      equipment: [{ modelLabel: 'iR ADV C5535i', serialNumber: 'SER-5535' }],
    });

    const supportBatchId = imports.createBatch({ domain: 'operations-canon', sourceName: 'canon.xlsx' });
    operations.importCanonDiscontinuation(supportBatchId, [
      { modelLabel: 'iR ADV C5535i', partCode: '', endsAt: '2025-01-10', source: 'canon.xlsx · Printer' },
    ]);
    const stockBatchId = imports.createBatch({ domain: 'operations-waldbott', sourceName: 'stock.xlsx' });

    expect(operations.importWaldbottStock(stockBatchId, [
      { modelLabel: 'Impresora Laser IR ADV C5535 (120V)', deposit: '04', quantity: 2, source: 'stock.xlsx · Depósito' },
      { modelLabel: 'Canon IR ADV C5535', deposit: '04', quantity: 3, source: 'stock.xlsx · Depósito' },
    ])).toEqual({ items: 2, models: 1, quantity: 5 });

    expect(operations.listWaldbottStock()).toEqual([
      {
        id: expect.any(String),
        modelLabel: 'Impresora Laser IR ADV C5535 (120V)',
        deposit: '04',
        quantity: 5,
        sourceNames: ['stock.xlsx · Depósito'],
        canonStatus: 'discontinued',
        canonModelLabel: 'iR ADV C5535i',
        canonEndsAt: '2025-01-10',
        installedCount: 1,
        installedModels: ['iR ADV C5535i'],
      },
    ]);
    expect(database.prepare('SELECT COUNT(*) AS count FROM waldbott_stock_items').get()).toEqual({ count: 2 });
    expect(imports.getBatch(stockBatchId)).toEqual(expect.objectContaining({ status: 'applied' }));

    database.close();
  });
  it('el resumen del Discontinuador no repite los equipos en una lista plana y conserva el detalle de origen de cada nivel', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const operations = new OperationsRepository(database);
    const row = (serial: string, extra: Record<string, unknown> = {}) => ({
      customerName: 'Cliente Detalle', customerType: 'Publico', commercialArea: 'Strategic', contractReference: 'OV-D-1',
      orderReference: null, contractType: 'Alquiler', startsAt: '2026-01-01', endsAt: '2026-12-31', division: null, active: true,
      modelLabel: 'iR ADV C3325i', brand: null, description: null, serialNumber: serial, interior: null, city: null, branch: null,
      address: null, location: null, sourceDetails: [{ label: 'Serie', value: serial }], sourceSheetName: 'Cartera',
      sourceRowNumber: 2, ...extra,
    });
    operations.importLegacyPortfolio(imports.createBatch({ domain: 'operations', sourceName: 'cartera.xlsx' }), [row('A-1'), row('A-2'), row('A-3')] as never);

    const overview = operations.getDiscontinuationOverview();
    expect(overview).not.toHaveProperty('equipment');
    const [customer] = overview.customers;
    expect(customer?.contracts).toHaveLength(1);
    expect(customer?.contracts[0]?.equipment.map((item) => item.serialNumber).sort()).toEqual(['A-1', 'A-2', 'A-3']);
    // Cada equipo conserva su propio detalle; cliente y contrato, el suyo (se leen una vez, no por fila de equipo).
    expect(customer?.contracts[0]?.equipment.every((item) => item.sourceDetails[0]?.value === item.serialNumber)).toBe(true);
    expect(Array.isArray(customer?.sourceDetails)).toBe(true);
    expect(Array.isArray(customer?.contracts[0]?.sourceDetails)).toBe(true);
    expect(operations.listCustomers('A-2')[0]?.contracts[0]?.equipment).toHaveLength(1);

    database.close();
  });

  it('lists only customers, contracts and equipment with an active Alquiler, Leasing or Mantenimiento contract', () => {
    const database = makeDatabase();
    const operations = new OperationsRepository(database);
    const equipment = (serial: string) => [{ modelLabel: 'iR ADV C3325i', serialNumber: serial }];
    const save = (name: string, contractType: 'Alquiler' | 'Leasing' | 'Mantenimiento' | 'Abierto', isActive: boolean | undefined, serial: string) => {
      const customer = operations.saveCustomer({ name });
      operations.saveContract({ customerId: customer.id, reference: `REF-${serial}`, contractType, isActive, equipment: equipment(serial) });
      return customer.id;
    };

    save('Cliente Vigente Alquiler', 'Alquiler', true, 'S-1');
    save('Cliente Vigente Leasing', 'Leasing', true, 'S-2');
    save('Cliente Vigente Mantenimiento', 'Mantenimiento', true, 'S-3');
    const manual = save('Cliente Manual', 'Alquiler', undefined, 'S-4');
    const inactive = save('Cliente Inactivo', 'Alquiler', false, 'S-5');
    save('Cliente Abierto', 'Abierto', true, 'S-6');
    const withoutContracts = operations.saveCustomer({ name: 'Cliente Sin Contratos' }).id;

    expect(operations.listCustomers().map((customer) => customer.name)).toEqual([
      'Cliente Manual', 'Cliente Vigente Alquiler', 'Cliente Vigente Leasing', 'Cliente Vigente Mantenimiento',
    ]);
    expect(operations.listEquipment().map((item) => item.serialNumber).sort()).toEqual(['S-1', 'S-2', 'S-3', 'S-4']);
    expect(operations.listEquipment('S-5')).toEqual([]);
    expect(operations.getCustomer(manual)).toBeDefined();
    expect(operations.getCustomer(inactive)?.contracts).toHaveLength(1);
    expect(operations.getCustomer(withoutContracts)).toBeDefined();

    database.close();
  });
});
