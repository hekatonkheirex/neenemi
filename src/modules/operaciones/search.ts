import type { CustomerRecord, EquipmentRecord } from './repository';

export function customerMatchesSearch(customer: CustomerRecord, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return normalizeSearchText(customerSearchText(customer)).includes(normalizedQuery);
}

export function equipmentMatchesSearch(equipment: EquipmentRecord, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return normalizeSearchText(equipmentSearchText(equipment)).includes(normalizedQuery);
}

function customerSearchText(customer: CustomerRecord): string {
  return [
    customer.name,
    customer.customerType ?? '',
    customer.commercialArea ?? '',
    sourceDetailsText(customer.sourceDetails),
    ...customer.contracts.flatMap((contract) => [
      contract.reference ?? '',
      contract.orderReference ?? '',
      contract.contractType,
      contract.startsAt ?? '',
      contract.endsAt ?? '',
      contract.commercialArea ?? '',
      contract.division ?? '',
      contract.isActive === true ? 'vigente' : contract.isActive === false ? 'no vigente' : '',
      contract.requiresClosure === true ? 'requiere cierre' : '',
      sourceDetailsText(contract.sourceDetails),
      ...contract.equipment.flatMap((equipment) => [
        equipment.modelLabel,
        equipment.serialNumber ?? '',
        equipment.location ?? '',
        equipment.brand ?? '',
        equipment.description ?? '',
        equipment.interior ?? '',
        equipment.city ?? '',
        equipment.branch ?? '',
        equipment.address ?? '',
        equipment.isActive === true ? 'vigente' : equipment.isActive === false ? 'no vigente' : '',
        sourceDetailsText(equipment.sourceDetails),
      ]),
    ]),
  ].join(' ');
}

function sourceDetailsText(details: CustomerRecord['sourceDetails']): string {
  return details.flatMap((detail) => [detail.label, detail.value]).join(' ');
}

function equipmentSearchText(equipment: EquipmentRecord): string {
  return [
    equipment.customerName,
    equipment.contractReference ?? '',
    equipment.orderReference ?? '',
    equipment.contractType,
    equipment.contractStartsAt ?? '',
    equipment.contractEndsAt ?? '',
    equipment.contractCommercialArea ?? '',
    equipment.contractDivision ?? '',
    equipment.contractIsActive === true ? 'vigente' : equipment.contractIsActive === false ? 'no vigente' : '',
    equipment.contractRequiresClosure === true ? 'requiere cierre' : '',
    equipment.modelLabel,
    equipment.serialNumber ?? '',
    equipment.location ?? '',
    equipment.brand ?? '',
    equipment.description ?? '',
    equipment.interior ?? '',
    equipment.city ?? '',
    equipment.branch ?? '',
    equipment.address ?? '',
    equipment.isActive === true ? 'vigente' : equipment.isActive === false ? 'no vigente' : '',
    sourceDetailsText(equipment.sourceDetails),
  ].join(' ');
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
