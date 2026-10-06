import { compactSourceLocation } from './source-location';
import { Muted } from './ui/card';

/** Línea de origen de un registro importado, abreviada para no inflar las filas de las tablas. */
export default function SourceLocationLabel({ fileName, sheetName, rowNumber }: { fileName: string; sheetName?: string; rowNumber?: number }) {
  const label = compactSourceLocation(fileName, sheetName, rowNumber);
  return label ? <Muted className="mt-0.5" title={label.title}>{label.text}</Muted> : null;
}
