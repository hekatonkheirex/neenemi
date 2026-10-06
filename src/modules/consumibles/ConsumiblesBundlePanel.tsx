import { useMemo } from 'react';
import { SOURCE_CATALOG } from '../../core/source-catalog';
import {
  CONSUMABLES_BUNDLE_SOURCES,
  isConsumablesBundleComplete,
  type ConsumablesBundleFiles,
  type ConsumablesBundleSourceId,
} from './bundle';
import { confirmAction } from '../../core/confirm';
import { UploadButton } from '../../core/ActionButtons';
import { cn } from '../../core/cn';
import { Badge } from '../../core/ui/badge';
import { Button } from '../../core/ui/button';
import { CardHeader, Muted } from '../../core/ui/card';

type ConsumablesBundlePanelProps = {
  importing: boolean;
  busy: boolean;
  files: ConsumablesBundleFiles;
  onFilesChange: (files: ConsumablesBundleFiles) => void;
  progressMessage: string;
  onImportBundle: (files: Record<ConsumablesBundleSourceId, File>) => void | Promise<void>;
};

const spreadsheetAccept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default function ConsumablesBundlePanel({ importing, busy, files, onFilesChange, progressMessage, onImportBundle }: ConsumablesBundlePanelProps) {
  const selectedCount = useMemo(() => Object.keys(files).length, [files]);
  const complete = isConsumablesBundleComplete(files);

  function clearSelection() {
    onFilesChange({});
  }

  async function startImport() {
    if (!complete || busy) return;
    const confirmed = await confirmAction({
      title: 'Importar paquete de fuentes',
      message: 'Primero se validarán las nueve fuentes. Si todas son legibles, las cinco fuentes de Consumibles y Servicios reemplazarán su carga aplicada anterior; las tres fuentes de cartera actualizarán la cartera compartida sin borrar altas manuales.',
      confirmLabel: 'Importar paquete',
      tone: 'default',
    });
    if (!confirmed) return;
    void onImportBundle(files);
  }

  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="consumables-bundle-title">
      <CardHeader eyebrow="Migración del legado" title={<span id="consumables-bundle-title">Carga coordinada de las nueve fuentes</span>} aside={<Badge aria-live="polite">{selectedCount}/9 archivos seleccionados</Badge>} />
      <Muted className="text-sm leading-relaxed">
        Seleccioná un archivo por cada entrada del flujo original. La suite valida los nueve archivos antes de escribir y luego los procesa en orden de cartera, detalles, consumos, despachos y Servicios LAM.
      </Muted>

      <div className="grid gap-2">
        {CONSUMABLES_BUNDLE_SOURCES.map((source, index) => {
          const definition = SOURCE_CATALOG.find((item) => item.id === source.catalogId);
          const selectedFile = files[source.id];
          return (
            <div className={cn('grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3', selectedFile ? 'border-sky bg-sky/10' : 'border-navy/10 bg-paper dark:border-sky/20 dark:bg-navy/30')} key={source.id}>
              <div className="font-mono text-xs text-ink-2 dark:text-[#9fb2d1]">{String(index + 1).padStart(2, '0')}</div>
              <div className="grid min-w-0 gap-0.5">
                <div className="font-bold text-navy dark:text-white">{source.label}</div>
                <Muted>{definition?.expectedFiles[0] ?? 'Archivo XLSX'}</Muted>
                <Muted>{definition?.origin ?? 'Origen documentado en la matriz de fuentes.'}</Muted>
                {selectedFile ? <div className="text-xs font-semibold text-[#14532d] dark:text-[#9be3b9]">{selectedFile.name} · {formatFileSize(selectedFile.size)}</div> : null}
              </div>
              <UploadButton
                label={selectedFile ? 'Cambiar' : 'Seleccionar'}
                accept={spreadsheetAccept}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (!file) return;
                  onFilesChange({ ...files, [source.id]: file });
                }}
                disabled={busy}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={cn('text-sm', progressMessage ? 'font-semibold text-navy dark:text-white' : 'text-ink-2 dark:text-[#d6e2f5]')} role={progressMessage ? 'status' : undefined}>
          {progressMessage || (complete ? 'Los nueve archivos están listos para importar.' : 'Faltan archivos por seleccionar.')}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={clearSelection} disabled={busy || selectedCount === 0}>Limpiar selección</Button>
          <Button onClick={() => void startImport()} disabled={busy || !complete}>{importing ? 'Importando paquete…' : 'Importar paquete'}</Button>
        </div>
      </div>
    </section>
  );
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
