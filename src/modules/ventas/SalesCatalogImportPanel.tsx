import { useRef, useState } from 'react';
import { parseSalesCatalogFile, type SalesCatalogProgress } from './sales-catalog';
import type { SalesCatalogKind, SalesCatalogMeta, SalesCatalogSnapshot, SalesCatalogs } from './types';
import { Check, X } from 'lucide-react';
import { cn } from '../../core/cn';
import ModalDialog, { modalBodyClass, modalFooterClass, modalHeaderClass } from '../../core/ModalDialog';
import { Badge } from '../../core/ui/badge';
import { Button, buttonVariants } from '../../core/ui/button';
import { CardHeader, Muted } from '../../core/ui/card';
import { formatLoadedAt } from '../../core/loaded-at';

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
  const busy = progress.phase === 'reading' || progress.phase === 'saving';
  const selectedKinds = (Object.keys(files) as SalesCatalogKind[]).filter((kind) => Boolean(files[kind]));

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
    <ModalDialog labelledBy="sales-catalog-title" onRequestClose={() => { if (!busy) closePanel(); }} className="w-[min(52rem,calc(100vw-2rem))]">
      <header className={modalHeaderClass}>
        <div className="grid min-w-0 gap-2">
          <CardHeader eyebrow="Importación local / Proformas" title={<span id="sales-catalog-title">Actualizar catálogos</span>} />
          <Muted className="text-sm">Selecciona una o ambas planillas antiguas. Cada catálogo queda guardado en la SQLite compartida y conserva su archivo original.</Muted>
        </div>
        <Button variant="ghost" size="icon" onClick={closePanel} disabled={busy} aria-label="Cerrar ventana de actualización"><X /></Button>
      </header>

      <div className={modalBodyClass}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CATALOGS.map(({ kind, label, helper, fileName }) => {
            const file = files[kind];
            const meta = catalogs[kind]?.meta;
            return (
              <div className="grid min-w-0 content-start gap-3 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30" key={kind}>
                <div className="flex items-start justify-between gap-2">
                  <div className="grid gap-0.5">
                    <label className="font-bold text-navy dark:text-white" htmlFor={`proformas-${kind}-file`}>{label}</label>
                    <Muted>{helper}</Muted>
                  </div>
                  <Badge>.xlsx</Badge>
                </div>
                <label
                  className={cn('grid cursor-pointer gap-1 rounded-xl border border-dashed p-4 text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky', dragging === kind || file ? 'border-sky bg-sky/10' : 'border-navy/25 bg-white dark:border-sky/30 dark:bg-transparent')}
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
                    className="sr-only"
                    ref={(element) => { inputs.current[kind] = element; }}
                    id={`proformas-${kind}-file`}
                    name={`proformas-${kind}-file`}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => { selectFile(kind, event.target.files?.[0]); event.target.value = ''; }}
                  />
                  <div className="break-all text-sm font-bold text-navy dark:text-white">{file ? file.name : fileName}</div>
                  <Muted>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB seleccionado` : 'Haz clic para seleccionar la planilla'}</Muted>
                </label>
                {meta ? <div className="grid gap-1 text-xs text-status-ok-ink dark:text-status-ok-ink-dark"><div className="flex items-start gap-1.5"><Check className="mt-0.5 shrink-0" size={14} strokeWidth={2.5} aria-hidden="true" /><span>{meta.rowCount.toLocaleString('es-PY')} registros guardados · {meta.fileName}{formatLoadedAt(meta.updatedAt) ? ` · ${formatLoadedAt(meta.updatedAt)}` : ''}</span></div>{meta.sourceBatchId && meta.sourceFileId ? <a className={cn(buttonVariants({ variant: 'export', size: 'sm' }), 'export-button w-fit')} href={`/api/imports/${encodeURIComponent(meta.sourceBatchId)}/files/${encodeURIComponent(meta.sourceFileId)}`} download={meta.fileName}>Descargar original</a> : null}</div> : <Muted>Todavía no hay una carga guardada.</Muted>}
              </div>
            );
          })}
        </div>

        {fileError && <div className="rounded-xl border border-[#b42318]/30 bg-[#b42318]/5 p-4 text-sm text-[#b42318] dark:text-[#ffb0b7]" role="alert">{fileError}</div>}
        {progress.phase !== 'idle' && (
          <div className={cn('grid gap-2 rounded-xl border p-4', progress.phase === 'error' ? 'border-[#b42318]/30 bg-[#b42318]/5' : 'border-sky/40 bg-sky/10')} aria-live="polite">
            <div className="flex items-baseline justify-between gap-3 text-sm"><div className="font-bold text-navy dark:text-white">{progress.phase === 'error' ? 'No se pudo completar la carga' : progress.message}</div>{progress.phase !== 'error' && <b className="tabular-nums text-navy dark:text-white">{progress.percent}%</b>}</div>
            {progress.phase !== 'error' && <div className="h-2 overflow-hidden rounded-full bg-navy/10 dark:bg-white/10"><div className="h-full rounded-full bg-sky transition-[width]" style={{ width: `${progress.percent}%` }} /></div>}
            {progress.error && <div className="text-sm text-[#b42318] dark:text-[#ffb0b7]">{progress.error}</div>}
            {Object.entries(progress.imported).map(([kind, meta]) => (
              <Muted key={kind}>{meta?.kind === 'consumibles' ? 'Consumibles' : 'Repuestos'}: {meta?.rowCount.toLocaleString('es-PY')} registros</Muted>
            ))}
          </div>
        )}

        <Muted className="text-sm leading-relaxed">El lector detecta código, descripción, categoría, precios USD/Gs., stock y estado de discontinuación. Las columnas que no se proyectan siguen disponibles en la fila original del archivo importado.</Muted>
      </div>

      <footer className={modalFooterClass}>
        <Muted className="text-sm">{selectedKinds.length === 0 ? 'Puedes actualizar uno o ambos catálogos.' : `${selectedKinds.length} planilla${selectedKinds.length === 1 ? '' : 's'} lista${selectedKinds.length === 1 ? '' : 's'} para procesar.`}</Muted>
        <div className="flex gap-2">
          <Button variant="outline" onClick={closePanel} disabled={busy}>Cerrar</Button>
          <Button onClick={() => void processFiles()} disabled={selectedKinds.length === 0 || busy}>{busy ? 'Procesando…' : 'Procesar planillas'}</Button>
        </div>
      </footer>
    </ModalDialog>
  );
}
