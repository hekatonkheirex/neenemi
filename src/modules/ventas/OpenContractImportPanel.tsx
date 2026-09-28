import { useEffect, useRef, useState } from 'react';
import {
  parseOpenContractFile,
  type OpenContractProgress,
} from './open-contract';
import type { OpenContractMeta, OpenContractSnapshot } from './types';

type OpenContractImportPanelProps = {
  isOpen: boolean;
  meta: OpenContractMeta | null;
  onClose: () => void;
  onImport: (snapshot: OpenContractSnapshot, file: File) => Promise<void>;
};

type PanelProgress = {
  phase: 'idle' | 'reading' | 'saving' | 'success' | 'error';
  message: string;
  percent: number;
  error: string | null;
};

const IDLE_PROGRESS: PanelProgress = {
  phase: 'idle',
  message: '',
  percent: 0,
  error: null,
};

const priceFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 });

export default function OpenContractImportPanel({
  isOpen,
  meta,
  onClose,
  onImport,
}: OpenContractImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<OpenContractSnapshot | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PanelProgress>(IDLE_PROGRESS);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const parseSequence = useRef(0);
  const isBusy = progress.phase === 'reading' || progress.phase === 'saving';

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) clearAndClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, isOpen]);

  if (!isOpen) return null;

  function clearAndClose() {
    if (isBusy) return;
    parseSequence.current += 1;
    setFile(null);
    setParsed(null);
    setFileError(null);
    setProgress(IDLE_PROGRESS);
    setDragging(false);
    if (inputRef.current) inputRef.current.value = '';
    onClose();
  }

  function selectFile(selectedFile: File | undefined) {
    if (!selectedFile) return;
    const lowerName = selectedFile.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.pdf')) {
      setFileError('Solo se aceptan contratos con extensión .xlsx o .pdf.');
      return;
    }

    const sequence = parseSequence.current + 1;
    parseSequence.current = sequence;
    setFile(selectedFile);
    setParsed(null);
    setFileError(null);
    setProgress({ phase: 'reading', message: 'Analizando el archivo contractual…', percent: 1, error: null });

    void parseOpenContractFile(selectedFile, (nextProgress: OpenContractProgress) => {
      if (parseSequence.current !== sequence) return;
      setProgress((current) => ({ ...current, ...nextProgress }));
    })
      .then((snapshot) => {
        if (parseSequence.current !== sequence) return;
        setParsed(snapshot);
        setProgress({ phase: 'success', message: 'Lista contractual lista para revisar.', percent: 100, error: null });
      })
      .catch((error: unknown) => {
        if (parseSequence.current !== sequence) return;
        const message = error instanceof Error ? error.message : 'No se pudo leer el archivo contractual.';
        setFileError(message);
        setProgress({ phase: 'error', message: 'No se pudo leer el contrato.', percent: 100, error: message });
      });
  }

  async function handleImport() {
    if (!parsed || !file || isBusy) return;
    setProgress({ phase: 'saving', message: 'Guardando lista contractual en SQLite…', percent: 96, error: null });
    try {
      await onImport(parsed, file);
      clearAndClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Intenta nuevamente.';
      setProgress({ phase: 'error', message: 'No se pudo guardar la lista contractual.', percent: 100, error: message });
      setFileError(message);
    }
  }

  return (
    <div
      className="open-contract-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) clearAndClose();
      }}
    >
      <section
        className="open-contract-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-contract-title"
        aria-describedby="open-contract-description"
      >
        <header className="open-contract-dialog-header">
          <div>
            <div className="eyebrow">IMPORTACIÓN LOCAL</div>
            <h2 id="open-contract-title">Cargar contrato abierto</h2>
            <p id="open-contract-description">Selecciona el XLSX o PDF contractual con repuestos y consumibles a precio fijo. La lista reemplazará la vigente en este equipo.</p>
          </div>
          <button className="mps-editor-close" type="button" onClick={clearAndClose} disabled={isBusy} ref={closeButtonRef} aria-label="Cerrar carga del contrato">×</button>
        </header>

        <div className="open-contract-dialog-body">
          <label
            className={`open-contract-dropzone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
            htmlFor="open-contract-file"
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              selectFile(event.dataTransfer.files[0]);
            }}
          >
            <input
              id="open-contract-file"
              name="openContractFile"
              ref={inputRef}
              type="file"
              accept=".xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                selectFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <strong>{file ? file.name : 'Seleccionar contrato XLSX o PDF'}</strong>
            <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · procesamiento local` : 'El PDF debe contener texto seleccionable'}</span>
          </label>

          {progress.phase === 'reading' || progress.phase === 'saving' ? (
            <div className="open-contract-notice" role="status" aria-live="polite">
              <div><strong>{progress.message}</strong><b>{progress.percent}%</b></div>
              <div className="open-contract-progress"><span style={{ width: `${progress.percent}%` }} /></div>
            </div>
          ) : null}
          {fileError ? <div className="open-contract-error" role="alert">{fileError}</div> : null}

          {parsed ? (
            <section className="open-contract-preview" aria-labelledby="open-contract-preview-title">
              <div className="card-heading">
                <div>
                  <div className="eyebrow">VISTA PREVIA</div>
                  <h3 id="open-contract-preview-title">{formatInteger(parsed.items.length)} líneas detectadas</h3>
                </div>
                <span className="open-contract-detected">Precio fijo en {formatCurrencyLabel(parsed.meta.priceCurrency)}</span>
              </div>

              <div className="open-contract-meta-grid">
                <div><span>Tipo</span><strong>{parsed.meta.hasKindColumn ? 'Desde columna del archivo' : 'Repuestos por defecto'}</strong></div>
                <div><span>Formato</span><strong>{parsed.meta.sourceFormat.toUpperCase()}</strong></div>
                <div><span>Lista anterior</span><strong>{meta ? `${formatInteger(meta.rowCount)} líneas` : 'Ninguna'}</strong></div>
              </div>

              <div className="open-contract-table-wrap">
                <table className="open-contract-table">
                  <thead><tr><th>Código</th><th>Tipo</th><th>Descripción</th><th className="align-right">Precio</th></tr></thead>
                  <tbody>
                    {parsed.items.slice(0, 10).map((item) => (
                      <tr key={item.id}>
                        <td className="code-cell">{item.code}</td>
                        <td>{item.kind === 'consumibles' ? 'Consumible' : 'Repuesto'}</td>
                        <td>{item.description || 'Sin descripción'}</td>
                        <td className="align-right">{formatCurrencyLabel(parsed.meta.priceCurrency)} {priceFormat.format(getItemPrice(item, parsed.meta.priceCurrency))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.items.length > 10 ? <p className="open-contract-table-note">Mostrando las primeras 10 líneas. Se guardarán las {formatInteger(parsed.items.length)} detectadas.</p> : null}
              </div>

              {(parsed.meta.invalidRows > 0 || parsed.meta.duplicateRows > 0) ? (
                <p className="open-contract-footnote">
                  {parsed.meta.invalidRows > 0 ? `${formatInteger(parsed.meta.invalidRows)} fila${parsed.meta.invalidRows === 1 ? '' : 's'} omitida${parsed.meta.invalidRows === 1 ? '' : 's'} por datos incompletos.` : ''}
                  {parsed.meta.invalidRows > 0 && parsed.meta.duplicateRows > 0 ? ' ' : ''}
                  {parsed.meta.duplicateRows > 0 ? `${formatInteger(parsed.meta.duplicateRows)} código${parsed.meta.duplicateRows === 1 ? '' : 's'} duplicado${parsed.meta.duplicateRows === 1 ? '' : 's'}; se conserva la última fila.` : ''}
                </p>
              ) : null}
            </section>
          ) : null}

          <p className="open-contract-help">Se detectan automáticamente código, descripción, tipo/categoría y precio fijo. Los PDF escaneados como imagen requieren carga manual o una conversión previa a texto.</p>
        </div>

        <footer className="open-contract-dialog-footer">
          <span>{parsed ? `${formatInteger(parsed.items.length)} líneas listas para guardar.` : meta ? `Reemplazará ${formatInteger(meta.rowCount)} líneas guardadas.` : 'Todavía no hay una lista contractual cargada.'}</span>
          <div className="sales-actions">
            <button className="secondary-button" type="button" onClick={clearAndClose} disabled={isBusy}>Cerrar</button>
            <button className="primary-button" type="button" onClick={() => void handleImport()} disabled={!parsed || !file || isBusy}>Guardar contrato</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(value);
}

function formatCurrencyLabel(currency: OpenContractMeta['priceCurrency']): string {
  return currency === 'usd' ? 'USD' : 'Gs.';
}

function getItemPrice(item: OpenContractSnapshot['items'][number], currency: OpenContractMeta['priceCurrency']): number {
  return currency === 'usd' ? item.priceUsd ?? 0 : item.priceLocal ?? 0;
}
