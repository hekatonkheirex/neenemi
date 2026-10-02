export function formatSourceLocation(
  fileName: string,
  sheetName?: string,
  rowNumber?: number,
): string {
  const parts = [
    fileName.trim(),
    sheetName?.trim() ? `hoja ${sheetName.trim()}` : '',
    rowNumber && rowNumber > 0 ? `fila ${rowNumber}` : '',
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Para tablas: "Planilla · fila N" y la ubicación completa (archivo y hoja) para el tooltip. */
export function compactSourceLocation(
  fileName: string,
  sheetName?: string,
  rowNumber?: number,
): { text: string; title: string } | null {
  const title = formatSourceLocation(fileName, sheetName, rowNumber);
  if (!title) return null;
  return { text: rowNumber && rowNumber > 0 ? `Planilla · fila ${rowNumber}` : title, title };
}
