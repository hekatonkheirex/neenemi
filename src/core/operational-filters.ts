export type OperationalFilters = {
  sector?: string;
  department?: string;
  contractType?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type OperationalFilterSql = {
  conditions: string[];
  parameters: string[];
};

export function buildOperationalFilter(
  filters: OperationalFilters = {},
  recordAlias = 'record',
  customerAlias = 'customer',
): OperationalFilterSql {
  const conditions: string[] = [];
  const parameters: string[] = [];

  if (filters.sector) {
    conditions.push(`${customerAlias}.customer_type = ?`);
    parameters.push(filters.sector);
  }
  if (filters.department) {
    conditions.push(`${customerAlias}.commercial_area = ?`);
    parameters.push(filters.department);
  }
  if (filters.contractType) {
    conditions.push(`${recordAlias}.contract_type = ?`);
    parameters.push(filters.contractType);
  }
  if (filters.dateFrom) {
    conditions.push(`${recordAlias}.month >= ?`);
    parameters.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push(`${recordAlias}.month <= ?`);
    parameters.push(filters.dateTo);
  }

  return { conditions, parameters };
}
