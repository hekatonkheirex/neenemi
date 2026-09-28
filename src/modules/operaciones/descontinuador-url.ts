import type { CommercialArea, ContractType, CustomerType } from './repository';

export type DescontinuadorView = 'discontinued' | 'stock' | 'uploads';

export type DescontinuadorUrlState = {
  view: DescontinuadorView;
  query: string;
  customerQuery: string;
  selectedCustomerId?: string;
  contractFilter: ContractType | 'Todos';
  customerTypeFilter: CustomerType | 'Todos';
  commercialAreaFilter: CommercialArea | 'Todos';
  visibleCustomerCount: number;
};

const VIEWS: readonly DescontinuadorView[] = ['discontinued', 'stock', 'uploads'];
const CONTRACT_FILTERS: readonly (ContractType | 'Todos')[] = ['Todos', 'Alquiler', 'Abierto', 'Mantenimiento', 'Leasing'];
const CUSTOMER_TYPE_FILTERS: readonly (CustomerType | 'Todos')[] = ['Todos', 'Publico', 'Privado'];
const COMMERCIAL_AREA_FILTERS: readonly (CommercialArea | 'Todos')[] = ['Todos', 'Strategic', 'Commercial'];

export function parseDescontinuadorUrl(value: string, customerPageSize = 50): DescontinuadorUrlState {
  const params = new URL(value, 'https://datasystems.local').searchParams;
  const requestedCustomerCount = Number(params.get('clientes'));
  const visibleCustomerCount = Number.isSafeInteger(requestedCustomerCount) && requestedCustomerCount >= customerPageSize
    ? requestedCustomerCount
    : customerPageSize;

  return {
    view: readView(params.get('vista')),
    query: params.get('buscarTabla') ?? '',
    customerQuery: params.get('buscar') ?? '',
    selectedCustomerId: readOptionalText(params.get('cliente')),
    contractFilter: readValue(params.get('tipo'), CONTRACT_FILTERS, 'Todos'),
    customerTypeFilter: readValue(params.get('tipoCliente'), CUSTOMER_TYPE_FILTERS, 'Todos'),
    commercialAreaFilter: readValue(params.get('areaComercial'), COMMERCIAL_AREA_FILTERS, 'Todos'),
    visibleCustomerCount,
  };
}

export function serializeDescontinuadorUrl(
  pathname: string,
  search: string,
  hash: string,
  state: DescontinuadorUrlState,
): string {
  const params = new URLSearchParams(search);
  setOrDelete(params, 'vista', state.view);
  setOrDelete(params, 'buscarTabla', state.query);
  setOrDelete(params, 'buscar', state.customerQuery);
  setOrDelete(params, 'cliente', state.selectedCustomerId);
  setOrDelete(params, 'tipo', state.contractFilter === 'Todos' ? undefined : state.contractFilter);
  setOrDelete(params, 'tipoCliente', state.customerTypeFilter === 'Todos' ? undefined : state.customerTypeFilter);
  setOrDelete(params, 'areaComercial', state.commercialAreaFilter === 'Todos' ? undefined : state.commercialAreaFilter);
  setOrDelete(params, 'clientes', state.visibleCustomerCount > 50 ? String(state.visibleCustomerCount) : undefined);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}

function readOptionalText(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function readValue<T extends string>(value: string | null, values: readonly T[], fallback: T): T {
  return value && values.includes(value as T) ? value as T : fallback;
}

function readView(value: string | null): DescontinuadorView {
  // `portfolio` was the temporary name used by the suite before the legacy
  // Descontinuados dashboard became the primary view.
  return readValue(value === 'portfolio' ? 'discontinued' : value, VIEWS, 'discontinued');
}

function setOrDelete(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value) params.set(key, value);
  else params.delete(key);
}
