import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { CustomerRecord } from './repository';
import { buildCustomerPortfolioWorkbook, buildOperationsExportData, buildOperationsWorkbook } from './export';

describe('operations export', () => {
  it('separa clientes, contratos, equipos y detalles de origen', () => {
    const customer: CustomerRecord = {
      id: 'customer-1',
      name: 'Cliente Uno',
      customerType: 'Publico',
      commercialArea: 'Strategic',
      sourceDetails: [{ label: 'Sector', value: 'Público' }],
      sourceSheetName: 'Cartera',
      sourceRowNumber: 2,
      contracts: [{
        id: 'contract-1',
        customerId: 'customer-1',
        reference: 'REF-001',
        orderReference: 'OV-001',
        contractType: 'Mantenimiento',
        startsAt: '2026-01-01',
        endsAt: '2026-12-31',
        commercialArea: 'Commercial',
        division: 'MRA',
        isActive: true,
        requiresClosure: false,
        sourceDetails: [{ label: 'ID contrato', value: 'C-001' }],
        sourceSheetName: 'Contratos',
        sourceRowNumber: 8,
        equipment: [{
          id: 'equipment-1',
          modelId: null,
          modelLabel: 'iR ADV C3325i',
          serialNumber: 'SER-001',
          location: 'Casa central',
          brand: 'Canon',
          description: 'Equipo instalado',
          interior: 'Interior 1',
          city: 'Asunción',
          branch: 'Sucursal Centro',
          address: 'Av. Central 100',
          isActive: true,
          sourceDetails: [{ label: 'Código interno', value: 'EQ-001' }],
          sourceSheetName: 'Equipos',
          sourceRowNumber: 12,
        }],
      }],
    };

    const data = buildOperationsExportData([customer]);

    expect(data.customers).toEqual([[
      'Cliente Uno', 'Publico', 'Strategic', 1, 1, 'Cartera', 2, 'Sector: Público',
    ]]);
    expect(data.contracts).toEqual([[
      'Cliente Uno', 'REF-001', 'Mantenimiento', '2026-01-01', '2026-12-31', 'OV-001', 'Commercial', 'MRA',
      'Sí', 'No', 1, 'Contratos', 8, 'ID contrato: C-001',
    ]]);
    expect(data.equipment).toEqual([[
      'Cliente Uno', 'REF-001', 'Mantenimiento', 'Commercial', 'iR ADV C3325i', 'SER-001', 'Canon',
      'Equipo instalado', 'Interior 1', 'Casa central', 'Asunción', 'Sucursal Centro',
      'Av. Central 100', 'Sí', 'Equipos', 12, 'Código interno: EQ-001',
    ]]);
    expect(data.sourceDetails).toEqual([
      ['Cliente', 'Cliente Uno', '', '', '', 'Sector', 'Público', 'Cartera', 2],
      ['Contrato', 'Cliente Uno', 'REF-001', '', '', 'ID contrato', 'C-001', 'Contratos', 8],
      ['Equipo', 'Cliente Uno', 'REF-001', 'iR ADV C3325i', 'SER-001', 'Código interno', 'EQ-001', 'Equipos', 12],
    ]);
  });

  it('genera un libro con las cuatro hojas de cartera', async () => {
    const buffer = await buildOperationsWorkbook([]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Clientes',
      'Contratos',
      'Equipos',
      'Detalles de origen',
    ]);
    expect(workbook.getWorksheet('Equipos')?.getRow(1).values).toEqual([
      undefined,
      'Cliente',
      'Contrato',
      'Tipo de contrato',
      'Área del contrato',
      'Modelo',
      'Serie',
      'Marca',
      'Descripción',
      'Interior',
      'Ubicación',
      'Ciudad',
      'Sucursal',
      'Dirección',
      'Vigente',
      'Hoja origen',
      'Fila origen',
      'Campos de origen',
    ]);
  });

  it('mantiene los detalles de origen en la exportación individual', async () => {
    const customer: CustomerRecord = {
      id: 'customer-1',
      name: 'Cliente Uno',
      customerType: null,
      commercialArea: null,
      sourceDetails: [{ label: 'Sector', value: 'Público' }],
      sourceSheetName: 'Cartera',
      sourceRowNumber: 2,
      contracts: [{
        id: 'contract-1',
        customerId: 'customer-1',
        reference: 'REF-001',
        orderReference: null,
        contractType: 'Mantenimiento',
        startsAt: null,
        endsAt: null,
        commercialArea: null,
        division: null,
        isActive: null,
        requiresClosure: null,
        sourceDetails: [{ label: 'Área', value: 'Central' }],
        sourceSheetName: 'Contratos',
        sourceRowNumber: 8,
        equipment: [{
          id: 'equipment-1',
          modelId: null,
          modelLabel: 'iR ADV C3325i',
          serialNumber: 'SER-001',
          location: null,
          brand: 'Canon',
          description: null,
          interior: null,
          city: null,
          branch: null,
          address: null,
          isActive: null,
          sourceDetails: [{ label: 'Código interno', value: 'EQ-001' }],
          sourceSheetName: 'Equipos',
          sourceRowNumber: 12,
        }],
      }],
    };

    const buffer = await buildCustomerPortfolioWorkbook(customer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Resumen',
      'Equipos',
      'Detalles de origen',
    ]);
    expect(workbook.getWorksheet('Equipos')?.getRow(1).values).toContain('Campos de origen');
    expect(workbook.getWorksheet('Detalles de origen')?.getRows(1, 4)?.map((row) => row.values)).toEqual([
      [undefined, 'Entidad', 'Cliente', 'Contrato', 'Modelo', 'Serie', 'Campo', 'Valor', 'Hoja origen', 'Fila origen'],
      [undefined, 'Cliente', 'Cliente Uno', '', '', '', 'Sector', 'Público', 'Cartera', 2],
      [undefined, 'Contrato', 'Cliente Uno', 'REF-001', '', '', 'Área', 'Central', 'Contratos', 8],
      [undefined, 'Equipo', 'Cliente Uno', 'REF-001', 'iR ADV C3325i', 'SER-001', 'Código interno', 'EQ-001', 'Equipos', 12],
    ]);
  });
});
