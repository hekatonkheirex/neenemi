import { useEffect, useRef, useState } from 'react';
import { parseSalesCatalogFile, type SalesCatalogProgress } from './sales-catalog';
import type { SalesCatalogKind, SalesCatalogMeta, SalesCatalogSnapshot, SalesCatalogs } from './types';

type ImportPhase = 'idle' | 'reading' | 'saving' | 'success' | 'error';

type ImportProgress = {
  phase: ImportPhase;
  kind: SalesCatalogKind | null;
  message: string;
  percent: number;
  error: string | null;
  imported: Partial<Record<SalesCatalogKind, SalesCatalogMeta>>;
};

type SalesCatalogImportPanelProps = {
  isOpen: boolean;
  catalogs: SalesCatalogs;
  onClose: () => void;
  onImport: (kind: SalesCatalogKind, snapshot: SalesCatalogSnapshot, file: File) => Promise<boolean>;
};

const CATALOGS: Array<{ kind: SalesCatalogKind; label: string; helper: string; fileName: string }> = [
  { kind: 'consumibles', label: 'Consumibles', helper: 'Tóner, kits y consumibles Canon', fileName: 'CONSUMIBLES_SISTEMA_ING.xlsx' },
  { kind: 'repuestos', label: 'Repuestos', helper: 'Partes, piezas y accesorios Canon', fileName: 'REPUESTOS_SISTEMA_ING.xlsx' },
];

const IDLE_PROGRESS: ImportProgress = {
  phase: 'idle',
  kind: null,
  message: '',
  percent: 0,
  error: null,
  imported: {},
};

export default function SalesCatalogImportPanel({ isOpen, catalogs, onClose, onImport }: SalesCatalogImportPanelProps) {
  const [files, setFiles] = useState<Partial<Record<SalesCatalogKind, File>>>({});
  const [dragging, setDragging] = useState<SalesCatalogKind | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress>(IDLE_PROGRESS);
  const inputs = useRef<Partial<Record<SalesCatalogKind, HTMLInputElement | null>>>({});
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const busy = progress.phase === 'reading' || progress.phase === 'saving';
  const selectedKinds = (Object.keys(files) as SalesCatalogKind[]).filter((kind) => Boolean(files[kind]));

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) closePanel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, isOpen]);

  function closePanel() {
    if (busy) return;
    setFiles({});
    setDragging(null);
    setFileError(null);
    setProgress(IDLE_PROGRESS);
    Object.values(inputs.current).forEach((input) => {
      if (input) input.value = '';
    });
    onClose();
  }

  function selectFile(kind: SalesCatalogKind, file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setFileError('Solo se aceptan planillas con extensión .xlsx.');
      return;
    }
    setFileError(null);
    setDragging(null);
    setProgress(IDLE_PROGRESS);
    setFiles((current) => ({ ...current, [kind]: file }));
  }

  async function processFiles() {
    if (selectedKinds.length === 0) return;
    const imported: Partial<Record<SalesCatalogKind, SalesCatalogMeta>> = {};
    setProgress({ phase: 'reading', kind: null, message: 'Preparando carga…', percent: 1, error: null, imported });

    for (const [index, kind] of selectedKinds.entries()) {
      const file = files[kind];
      if (!file) continue;
      try {
        const snapshot = await parseSalesCatalogFile(file, kind, (next) => updateProgress(index, selectedKinds.length, kind, next));
        setProgress((current) => ({ ...current, phase: 'saving', kind, message: 'Guardando catálogo en SQLite…' }));
        const applied = await onImport(kind, snapshot, file);
        if (applied) imported[kind] = snapshot.meta;
        setProgress((current) => ({
          ...current,
          phase: 'reading',
          kind,
          message: applied
            ? `${snapshot.meta.rowCount.toLocaleString('es-PY')} registros guardados.`
            : 'Este archivo ya era la fuente vigente; no se aplicaron cambios.',
          percent: Math.round(((index + 1) / selectedKinds.length) * 100),
          imported: { ...imported },
        }));
      } catch (error: unknown) {
        setProgress((current) => ({
          ...current,
          phase: 'error',
          kind,
          message: 'Revisa el formato de la planilla seleccionada.',
          percent: 100,
          error: error instanceof Error ? error.message : 'No se pudo procesar el archivo XLSX.',
          imported: { ...imported },
        }));
        return;
      }
    }

    const importedCount = Object.keys(imported).length;
    const duplicateCount = selectedKinds.length - importedCount;
    setProgress({
      phase: 'success',
      kind: null,
      message: importedCount === 0
        ? 'Las planillas ya estaban vigentes; no se realizaron cambios.'
        : duplicateCount > 0
          ? `${importedCount} catálogo(s) actualizado(s); ${duplicateCount} archivo(s) ya vigente(s), sin cambios.`
          : 'Catálogos de Proformas actualizados correctamente.',
      percent: 100,
      error: null,
      imported,
    });
  }

  function updateProgress(index: number, total: number, kind: SalesCatalogKind, next: SalesCatalogProgress) {
    const scaledPercent = Math.min(99, Math.round(((index * 100) + next.percent) / total));
    setProgress((current) => ({ ...current, phase: next.phase, kind, message: next.message, percent: scaledPercent }));
  }

  if (!isOpen) return null;

  return (
    <div className="sales-catalog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closePanel(); }}>
      <section className="sales-catalog-dialog" role="dialog" aria-modal="true" aria-labelledby="sales-catalog-title">
        <header className="sales-catalog-dialog-header">
          <div>
            <div className="eyebrow">IMPORTACIÓN LOCAL / PROFORMAS</div>
            <h2 id="sales-catalog-title">Actualizar catálogos</h2>
            <p>Selecciona una o ambas planillas antiguas. Cada catálogo queda guardado en la SQLite compartida y conserva su archivo original.</p>
          </div>
          <button ref={closeButtonRef} className="icon-button sales-catalog-close" type="button" onClick={closePanel} disabled={busy} aria-label="Cerrar ventana de actualización">×</button>
        </header>

        <div className="sales-catalog-dialog-body">
          <div className="sales-catalog-file-grid">
            {CATALOGS.map(({ kind, label, helper, fileName }) => {
              const file = files[kind];
              const meta = catalogs[kind]?.meta;
              return (
                <div className="sales-catalog-file-card" key={kind}>
                  <div className="sales-catalog-file-heading">
                    <div>
                      <label htmlFor={`proformas-${kind}-file`}>{label}</label>
                      <small>{helper}</small>
                    </div>
                    <span>.xlsx</span>
                  </div>
                  <label
                    className={`sales-catalog-dropzone ${file ? 'selected' : ''} ${dragging === kind ? 'dragging' : ''}`}
                    htmlFor={`proformas-${kind}-file`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragging(kind);
                    }}
                    onDragLeave={() => setDragging(null)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(null);
                      selectFile(kind, event.dataTransfer.files[0]);
                    }}
                  >
                    <input
                      ref={(element) => { inputs.current[kind] = element; }}
                      id={`proformas-${kind}-file`}
                      name={`proformas-${kind}-file`}
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={(event) => { selectFile(kind, event.target.files?.[0]); event.target.value = ''; }}
                    />
                    <strong>{file ? file.name : fileName}</strong>
                    <span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB seleccionado` : 'Haz clic para seleccionar la planilla'}</span>
                  </label>
                  {meta ? <div className="sales-catalog-file-meta"><span>✓ {meta.rowCount.toLocaleString('es-PY')} registros guardados · {meta.fileName}</span>{meta.sourceBatchId && meta.sourceFileId ? <a href={`/api/imports/${encodeURIComponent(meta.sourceBatchId)}/files/${encodeURIComponent(meta.sourceFileId)}`} download={meta.fileName}>Descargar original</a> : null}</div> : <p className="sales-catalog-file-meta muted">Todavía no hay una carga guardada.</p>}
                </div>
              );
            })}
          </div>

          {fileError && <p className="sales-catalog-error" role="alert">{fileError}</p>}
          {progress.phase !== 'idle' && (
            <div className={`sales-catalog-progress ${progress.phase === 'error' ? 'has-error' : ''}`} aria-live="polite">
              <div className="sales-catalog-progress-heading">
                <strong>{progress.phase === 'error' ? 'No se pudo completar la carga' : progress.message}</strong>
                {progress.phase !== 'error' && <span>{progress.percent}%</span>}
              </div>
              {progress.phase !== 'error' && <div className="sales-catalog-progress-track"><span style={{ width: `${progress.percent}%` }} /></div>}
              {progress.error && <p>{progress.error}</p>}
              {Object.entries(progress.imported).map(([kind, meta]) => (
                <small key={kind}>{meta?.kind === 'consumibles' ? 'Consumibles' : 'Repuestos'}: {meta?.rowCount.toLocaleString('es-PY')} registros</small>
              ))}
            </div>
          )}

          <div className="sales-catalog-notice">
            El lector detecta código, descripción, categoría, precios USD/Gs., stock y estado de discontinuación. Las columnas que no se proyectan siguen disponibles en la fila original del archivo importado.
          </div>
        </div>

        <footer className="sales-catalog-dialog-footer">
          <span>{selectedKinds.length === 0 ? 'Puedes actualizar uno o ambos catálogos.' : `${selectedKinds.length} planilla${selectedKinds.length === 1 ? '' : 's'} lista${selectedKinds.length === 1 ? '' : 's'} para procesar.`}</span>
          <div>
            <button className="secondary-button" type="button" onClick={closePanel} disabled={busy}>Cerrar</button>
            <button className="primary-button" type="button" onClick={() => void processFiles()} disabled={selectedKinds.length === 0 || busy}>{busy ? 'Procesando…' : 'Procesar planillas'}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
