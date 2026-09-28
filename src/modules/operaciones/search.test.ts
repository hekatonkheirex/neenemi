import { describe, expect, it } from 'vitest';
import type { CustomerRecord, EquipmentRecord } from './repository';
import { customerMatchesSearch, equipmentMatchesSearch } from './search';

const customer: CustomerRecord = {
  id: 'customer-1',
  name: 'Cliente de prueba',
  customerType: 'Publico',
  commercialArea: 'Strategic',
  sourceDetails: [{ label: 'Código interno', value: 'SGS-001' }],
  sourceSheetName: 'Clientes',
  sourceRowNumber: 4,
  contracts: [{
    id: 'contract-1',
    customerId: 'customer-1',
    reference: 'AF001/26-R0',
    orderReference: '105000',
    contractType: 'Leasing',
    startsAt: '2026-01-10',
    endsAt: '2030-01-10',
    commercialArea: 'Commercial',
    division: 'Fotocopiadoras',
    isActive: true,
    requiresClosure: true,
    sourceDetails: [],
    sourceSheetName: 'Contratos',
    sourceRowNumber: 8,
    equipment: [{
      id: 'equipment-1',
      modelId: null,
      modelLabel: 'FOTOCOPIADORA CANON IR ADV C5535i',
      serialNumber: 'WXF04807',
      location: 'Casa Central',
      brand: 'Canon',
      description: 'Equipo color',
      interior: 'Piso 2',
      city: 'Encarnación',
      branch: 'Sucursal Centro',
      address: 'Av. Principal 100',
      isActive: true,
      sourceDetails: [],
      sourceSheetName: 'Equipos',
      sourceRowNumber: 12,
    }],
  }],
};

const equipment: EquipmentRecord = {
  ...customer.contracts[0].equipment[0],
  sourceDetails: [{ label: 'Código de equipo', value: 'EQ-001' }],
  contractId: 'contract-1',
  customerId: 'customer-1',
  customerName: customer.name,
  contractReference: customer.contracts[0].reference,
  orderReference: customer.contracts[0].orderReference,
  contractType: customer.contracts[0].contractType,
  contractStartsAt: customer.contracts[0].startsAt,
  contractEndsAt: customer.contracts[0].endsAt,
  contractCommercialArea: customer.contracts[0].commercialArea,
  contractDivision: customer.contracts[0].division,
  contractIsActive: customer.contracts[0].isActive,
  contractRequiresClosure: customer.contracts[0].requiresClosure,
};

describe('customerMatchesSearch', () => {
  it('encuentra referencias, series y columnas de origen además del cliente', () => {
    expect(customerMatchesSearch(customer, '105000')).toBe(true);
    expect(customerMatchesSearch(customer, 'wxf04807')).toBe(true);
    expect(customerMatchesSearch(customer, 'sgs 001')).toBe(true);
  });

  it('ignora mayúsculas y tildes', () => {
    expect(customerMatchesSearch(customer, 'encarnacion')).toBe(true);
    expect(customerMatchesSearch(customer, 'CANON IR ADV')).toBe(true);
  });

  it('devuelve true para una búsqueda vacía y false si no hay coincidencia', () => {
    expect(customerMatchesSearch(customer, '   ')).toBe(true);
    expect(customerMatchesSearch(customer, 'contrato inexistente')).toBe(false);
  });
});

describe('equipmentMatchesSearch', () => {
  it('encuentra cliente, contrato, ubicación y datos de origen', () => {
    expect(equipmentMatchesSearch(equipment, 'cliente de prueba')).toBe(true);
    expect(equipmentMatchesSearch(equipment, 'AF001 26')).toBe(true);
    expect(equipmentMatchesSearch(equipment, '105000')).toBe(true);
    expect(equipmentMatchesSearch(equipment, 'av principal 100')).toBe(true);
    expect(equipmentMatchesSearch(equipment, 'eq 001')).toBe(true);
  });

  it('normaliza tildes, separadores y consultas vacías', () => {
    expect(equipmentMatchesSearch(equipment, 'FOTOCOPIADORA-CANON')).toBe(true);
    expect(equipmentMatchesSearch(equipment, '2026-01-10')).toBe(true);
    expect(equipmentMatchesSearch(equipment, 'requiere cierre')).toBe(true);
    expect(equipmentMatchesSearch(equipment, '   ')).toBe(true);
    expect(equipmentMatchesSearch(equipment, 'serie inexistente')).toBe(false);
  });
});
