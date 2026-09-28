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
