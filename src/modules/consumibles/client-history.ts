export type ClientHistoryObservation = {
  customerName: string;
  sourceCustomerName?: string;
  date: string;
  orderReference?: string;
};

export type ClientHistoryEntry = {
  customerName: string;
  from: string;
  to: string;
  orderReferences: string[];
};

/**
 * Reconstructs the previous customers seen for an equipment serial.
 * Source names are preferred because they preserve the historical export;
 * the normalized customer is used as a fallback for older records.
 */
export function buildClientHistory(
  currentCustomerName: string,
  observations: readonly ClientHistoryObservation[],
): ClientHistoryEntry[] {
  const currentKey = clientNameKey(currentCustomerName);
  const ordered = observations
    .map((observation, index) => ({
      name: (observation.sourceCustomerName?.trim() || observation.customerName.trim()).replace(/\s+/g, ' '),
      date: observation.date.trim(),
      orderReference: observation.orderReference?.trim() ?? '',
      index,
    }))
    .filter((observation) => observation.name && observation.date)
    .sort((left, right) => left.date.localeCompare(right.date) || left.index - right.index);

  const history: ClientHistoryEntry[] = [];
  for (const observation of ordered) {
    const previous = history[history.length - 1];
    if (previous && clientNameKey(previous.customerName) === clientNameKey(observation.name)) {
      previous.to = observation.date;
      if (observation.orderReference && !previous.orderReferences.includes(observation.orderReference)) {
        previous.orderReferences.push(observation.orderReference);
      }
      continue;
    }

    history.push({
      customerName: observation.name,
      from: observation.date,
      to: observation.date,
      orderReferences: observation.orderReference ? [observation.orderReference] : [],
    });
  }

  return history.filter((entry) => clientNameKey(entry.customerName) !== currentKey);
}

export function clientNameKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('es-PY');
}
