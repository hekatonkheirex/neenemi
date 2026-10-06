import { useRef, useState } from 'react';
import {
  parseOpenContractFile,
  type OpenContractProgress,
} from './open-contract';
import type { OpenContractMeta, OpenContractSnapshot } from './types';
import { X } from 'lucide-react';
import { cn } from '../../core/cn';
import ModalDialog, { modalBodyClass, modalFooterClass, modalHeaderClass } from '../../core/ModalDialog';
import { Badge } from '../../core/ui/badge';
import { Button } from '../../core/ui/button';
import { CardHeader, Muted } from '../../core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';

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
  const parseSequence = useRef(0);
  const isBusy = progress.phase === 'reading' || progress.phase === 'saving';

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
    <ModalDialog labelledBy="open-contract-title" describedBy="open-contract-description" onRequestClose={clearAndClose}>
      <header className={modalHeaderClass}>
        <div className="grid min-w-0 gap-2">
          <CardHeader eyebrow="Importación local" title={<span id="open-contract-title">Cargar contrato abierto</span>} />
          <Muted id="open-contract-description" className="text-sm">Selecciona el XLSX o PDF contractual con repuestos y consumibles a precio fijo. La lista reemplazará la vigente en este equipo.</Muted>
        </div>
        <Button variant="ghost" size="icon" onClick={clearAndClose} disabled={isBusy} aria-label="Cerrar carga del contrato"><X /></Button>
      </header>

      <div className={modalBodyClass}>
        <label
          className={cn('grid cursor-pointer gap-1 rounded-xl border border-dashed p-5 text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky', dragging ? 'border-sky bg-sky/10' : 'border-navy/25 bg-paper dark:border-sky/30 dark:bg-navy/30')}
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
            className="sr-only"
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
          <div className="font-bold text-navy dark:text-white">{file ? file.name : 'Seleccionar contrato XLSX o PDF'}</div>
          <Muted>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · procesamiento local` : 'El PDF debe contener texto seleccionable'}</Muted>
        </label>

        {progress.phase === 'reading' || progress.phase === 'saving' ? (
          <div className="grid gap-2 rounded-xl border border-sky/40 bg-sky/10 p-4" role="status" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3 text-sm"><div className="font-bold text-navy dark:text-white">{progress.message}</div><b className="tabular-nums text-navy dark:text-white">{progress.percent}%</b></div>
            <div className="h-2 overflow-hidden rounded-full bg-navy/10 dark:bg-white/10"><div className="h-full rounded-full bg-sky transition-[width]" style={{ width: `${progress.percent}%` }} /></div>
          </div>
        ) : null}
        {fileError ? <div className="rounded-xl border border-[#b42318]/30 bg-[#b42318]/5 p-4 text-sm text-[#b42318] dark:text-[#ffb0b7]" role="alert">{fileError}</div> : null}

        {parsed ? (
          <section className="grid gap-3" aria-labelledby="open-contract-preview-title">
            <CardHeader eyebrow="Vista previa" title={<span id="open-contract-preview-title">{formatInteger(parsed.items.length)} líneas detectadas</span>} aside={<Badge tone="success">Precio fijo en {formatCurrencyLabel(parsed.meta.priceCurrency)}</Badge>} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Fact label="Tipo" value={parsed.meta.hasKindColumn ? 'Desde columna del archivo' : 'Repuestos por defecto'} />
              <Fact label="Formato" value={parsed.meta.sourceFormat.toUpperCase()} />
              <Fact label="Lista anterior" value={meta ? `${formatInteger(meta.rowCount)} líneas` : 'Ninguna'} />
            </div>

            <Table className="min-w-[32rem]">
              <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Tipo</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Precio</TableHead></TableRow></TableHeader>
              <TableBody>
                {parsed.items.slice(0, 10).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs font-semibold">{item.code}</TableCell>
                    <TableCell>{item.kind === 'consumibles' ? 'Consumible' : 'Repuesto'}</TableCell>
                    <TableCell>{item.description || 'Sin descripción'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrencyLabel(parsed.meta.priceCurrency)} {priceFormat.format(getItemPrice(item, parsed.meta.priceCurrency))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {parsed.items.length > 10 ? <Muted>Mostrando las primeras 10 líneas. Se guardarán las {formatInteger(parsed.items.length)} detectadas.</Muted> : null}

            {(parsed.meta.invalidRows > 0 || parsed.meta.duplicateRows > 0) ? (
              <Muted className="text-sm">
                {parsed.meta.invalidRows > 0 ? `${formatInteger(parsed.meta.invalidRows)} fila${parsed.meta.invalidRows === 1 ? '' : 's'} omitida${parsed.meta.invalidRows === 1 ? '' : 's'} por datos incompletos.` : ''}
                {parsed.meta.invalidRows > 0 && parsed.meta.duplicateRows > 0 ? ' ' : ''}
                {parsed.meta.duplicateRows > 0 ? `${formatInteger(parsed.meta.duplicateRows)} código${parsed.meta.duplicateRows === 1 ? '' : 's'} duplicado${parsed.meta.duplicateRows === 1 ? '' : 's'}; se conserva la última fila.` : ''}
              </Muted>
            ) : null}
          </section>
        ) : null}

        <Muted className="text-sm">Se detectan automáticamente código, descripción, tipo/categoría y precio fijo. Los PDF escaneados como imagen requieren carga manual o una conversión previa a texto.</Muted>
      </div>

      <footer className={modalFooterClass}>
        <Muted className="text-sm">{parsed ? `${formatInteger(parsed.items.length)} líneas listas para guardar.` : meta ? `Reemplazará ${formatInteger(meta.rowCount)} líneas guardadas.` : 'Todavía no hay una lista contractual cargada.'}</Muted>
        <div className="flex gap-2">
          <Button variant="outline" onClick={clearAndClose} disabled={isBusy}>Cerrar</Button>
          <Button onClick={() => void handleImport()} disabled={!parsed || !file || isBusy}>Guardar contrato</Button>
        </div>
      </footer>
    </ModalDialog>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-0.5 rounded-xl border border-navy/10 bg-paper p-3 dark:border-sky/20 dark:bg-navy/30"><Muted>{label}</Muted><div className="text-sm font-bold text-navy dark:text-white">{value}</div></div>;
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
