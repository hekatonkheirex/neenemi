import { compactSourceLocation } from './source-location';

/** Línea de origen de un registro importado, abreviada para no inflar las filas de las tablas. */
export default function SourceLocationLabel({ fileName, sheetName, rowNumber }: { fileName: string; sheetName?: string; rowNumber?: number }) {
  const label = compactSourceLocation(fileName, sheetName, rowNumber);
  return label ? <small className="table-secondary-text" title={label.title}>{label.text}</small> : null;
}
