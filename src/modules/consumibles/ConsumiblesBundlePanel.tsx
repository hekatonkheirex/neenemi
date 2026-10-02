import { useMemo } from 'react';
import { SOURCE_CATALOG } from '../../core/source-catalog';
import {
  CONSUMABLES_BUNDLE_SOURCES,
  isConsumablesBundleComplete,
  type ConsumablesBundleFiles,
  type ConsumablesBundleSourceId,
} from './bundle';
import { confirmAction } from '../../core/confirm';

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
    <section className="source-data-bundle" aria-labelledby="consumables-bundle-title">
      <div className="source-data-bundle-heading">
        <div>
          <div className="eyebrow">MIGRACIÓN DEL LEGADO</div>
          <h2 id="consumables-bundle-title">Carga coordinada de las nueve fuentes</h2>
          <p>
            Seleccioná un archivo por cada entrada del flujo original. La suite valida los nueve archivos antes de escribir y luego los procesa en orden de cartera, detalles, consumos, despachos y Servicios LAM.
          </p>
        </div>
        <div className="source-data-bundle-count" aria-live="polite">
          <strong>{selectedCount}/9</strong>
          <span>archivos seleccionados</span>
        </div>
      </div>

      <div className="source-data-bundle-list">
        {CONSUMABLES_BUNDLE_SOURCES.map((source, index) => {
          const definition = SOURCE_CATALOG.find((item) => item.id === source.catalogId);
          const selectedFile = files[source.id];
          return (
            <div className={`source-data-bundle-row ${selectedFile ? 'selected' : ''}`} key={source.id}>
              <span className="source-data-bundle-index">{String(index + 1).padStart(2, '0')}</span>
              <div className="source-data-bundle-copy">
                <strong>{source.label}</strong>
                <span>{definition?.expectedFiles[0] ?? 'Archivo XLSX'}</span>
                <small>{definition?.origin ?? 'Origen documentado en la matriz de fuentes.'}</small>
                {selectedFile ? <em>{selectedFile.name} · {formatFileSize(selectedFile.size)}</em> : null}
              </div>
              <label className="file-input-button source-data-bundle-file-button">
                <span>{selectedFile ? 'Cambiar' : 'Seleccionar'}</span>
                <input
                  type="file"
                  accept={spreadsheetAccept}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (!file) return;
                    onFilesChange({ ...files, [source.id]: file });
                  }}
                  disabled={busy}
                />
              </label>
            </div>
          );
        })}
      </div>

      <div className="source-data-bundle-actions">
        <span className={progressMessage ? 'source-data-bundle-progress' : undefined} role={progressMessage ? 'status' : undefined}>
          {progressMessage || (complete ? 'Los nueve archivos están listos para importar.' : 'Faltan archivos por seleccionar.')}
        </span>
        <div>
          <button className="secondary-button" type="button" onClick={clearSelection} disabled={busy || selectedCount === 0}>Limpiar selección</button>
          <button className="primary-button" type="button" onClick={() => void startImport()} disabled={busy || !complete}>{importing ? 'Importando paquete…' : 'Importar paquete'}</button>
        </div>
      </div>
    </section>
  );
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
