export function findSourceHeaderRow(
  rows: readonly unknown[][],
  sourceType: string | null | undefined,
  sourceName: string | undefined,
): number {
  const normalizedSourceType = normalizeSourceHeader(`${sourceType ?? ''} ${sourceName ?? ''}`);
  const isServicesSource = normalizedSourceType.includes('servicios');
  const isOutputSource = normalizedSourceType.includes('salida');
  const isUsageSource = normalizedSourceType.includes('uso repuestos');
  const isConsumablesSource = normalizedSourceType.includes('consumibles') || normalizedSourceType.includes('repuestos');
  const isFleetSource = normalizedSourceType.includes('contrato')
    || normalizedSourceType.includes('equipos')
    || normalizedSourceType.includes('clasificacion');
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const headers = rows[rowIndex] ?? [];
    const hasDate = hasSourceHeader(headers, ['fecha']);
    const hasCode = hasSourceHeader(headers, ['codigo', 'codigo repuesto']);
    const hasDescription = hasSourceHeader(headers, ['descripcion', 'descripcion repuesto']);
    const hasSerial = hasSourceHeader(headers, ['n serie', 'nro serie', 'numero serie', 'n serie equipo', 'nro serie equipo']);
    const hasModel = hasSourceHeader(headers, ['equipo', 'modelo', 'modelo equipo']);
    const hasQuantity = hasSourceHeader(headers, ['cantidad', 'cant']);
    const hasCustomer = hasSourceHeader(headers, ['cliente', 'razon social', 'nombre cliente', 'customer']);
    const hasContract = hasSourceHeader(headers, ['ref data', 'numero contrato', 'nro contrato', 'id con', 'contrato', 'contract']);
    const hasClassification = hasSourceHeader(headers, ['sector', 'tipo de cliente', 'area', 'area comercial', 'division']);

    if (isServicesSource && hasSourceHeader(headers, ['cliente']) && hasDate && hasSerial && hasModel) {
      return rowIndex;
    }
    if (isOutputSource && hasSourceHeader(headers, ['n remision', 'numero remision', 'n comprobante', 'numero comprobante']) && hasDate && hasCode && hasDescription && hasQuantity && hasSerial && hasModel) {
      return rowIndex;
    }
    if (isConsumablesSource && hasModel && hasSerial && hasCode && hasDescription && (hasQuantity || isUsageSource)) {
      return rowIndex;
    }
    if (isFleetSource && hasCustomer && (hasContract || hasModel || hasClassification)) {
      return rowIndex;
    }
  }

  // Some archived exports contain a title or a report timestamp before the
  // actual header. Keep a source-agnostic fallback for those files so the
  // inspection remains useful when a batch was imported with an unknown name.
  let bestCandidate = -1;
  let bestScore = 0;
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const score = sourceHeaderScore(rows[rowIndex] ?? []);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = rowIndex;
    }
  }
  return bestCandidate >= 0 ? bestCandidate : 0;
}

function sourceHeaderScore(headers: readonly unknown[]): number {
  const signalGroups = [
    ['cliente', 'razon social', 'nombre cliente', 'customer'],
    ['contrato', 'ref data', 'numero contrato', 'nro contrato', 'id con', 'contract'],
    ['n ov', 'n o v', 'numero ov', 'nro ov', 'orden de venta', 'ov'],
    ['modelo', 'modelo equipo', 'equipo', 'machine', 'machines'],
    ['serie', 'n serie', 'nro serie', 'numero serie', 'n serie equipo', 'nro serie equipo', 'serial'],
    ['codigo', 'codigo repuesto', 'codigo de repuesto', 'item code', 'part code'],
    ['descripcion', 'descripcion repuesto', 'descripcion de repuesto', 'description'],
    ['fecha', 'fecha inicio', 'fch hora inicio', 'date'],
    ['cantidad', 'cant', 'quantity', 'qty', 'unidades'],
    ['precio', 'precio unitario', 'costo', 'price'],
    ['total', 'total pyg', 'importe', 'amount'],
    ['vigente', 'activo', 'vigencia', 'active'],
    ['division', 'división', 'unidad de negocio'],
    ['sector', 'tipo de cliente', 'segmento'],
    ['area', 'area comercial', 'área comercial'],
    ['deposito', 'depósito', 'deposit', 'deposits', 'warehouse', 'almacen'],
    ['sucursal', 'branch'],
    ['tecnico', 'técnico', 'responsable', 'technician'],
    ['estado', 'status'],
    ['remision', 'n remision', 'numero remision'],
    ['comprobante', 'n comprobante', 'numero comprobante'],
    ['informe', 'n informe', 'numero informe'],
  ];
  return signalGroups.reduce((score, names) => score + (hasSourceHeader(headers, names) ? 1 : 0), 0);
}

function hasSourceHeader(headers: readonly unknown[], names: readonly string[]): boolean {
  const normalizedNames = new Set(names.map(normalizeSourceHeader));
  return headers.some((header) => normalizedNames.has(normalizeSourceHeader(header)));
}

function normalizeSourceHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
