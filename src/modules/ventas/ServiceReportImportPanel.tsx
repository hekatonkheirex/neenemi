import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContractPriceCurrency, SalesPricePart } from './types';
import {
  findServiceReportCatalogMatches,
  parseServiceReportFile,
  type ParsedServiceReport,
  type ServiceReportCatalogMatch,
} from './service-report';
import { X } from 'lucide-react';
import { cn } from '../../core/cn';
import ModalDialog, { modalBodyClass, modalFooterClass, modalHeaderClass } from '../../core/ModalDialog';
import { Badge } from '../../core/ui/badge';
import { Button, buttonVariants } from '../../core/ui/button';
import { CardHeader, Muted } from '../../core/ui/card';

type ServiceReportImportPanelProps = {
  isOpen: boolean;
  catalogItems: SalesPricePart[];
  catalogLoading: boolean;
  priceCurrency?: ContractPriceCurrency;
  onClose: () => void;
  onApply: (report: ParsedServiceReport, items: SalesPricePart[]) => void;
};

export default function ServiceReportImportPanel({
  isOpen,
  catalogItems,
  catalogLoading,
  priceCurrency = 'local',
  onClose,
  onApply,
}: ServiceReportImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ParsedServiceReport | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const parseSequence = useRef(0);

  const matches = useMemo<ServiceReportCatalogMatch[]>(
    () => (report ? findServiceReportCatalogMatches(report, catalogItems) : []),
    [catalogItems, report],
  );
  const selectedItems = useMemo(
    () => matches.filter((match) => selectedIds.has(match.item.id)).map((match) => match.item),
    [matches, selectedIds],
  );

  useEffect(() => {
    if (!report) {
      setSelectedIds(new Set());
      return;
    }

    const preferred = matches.filter((match) => match.explicit || match.score >= 5);
    const defaults = preferred.length > 0 ? preferred : matches.slice(0, 3);
    setSelectedIds(new Set(defaults.map((match) => match.item.id)));
  }, [matches, report]);

  if (!isOpen) return null;

  function selectFile(nextFile: File | undefined) {
    if (!nextFile) return;
    if (nextFile.type !== 'application/pdf' && !nextFile.name.toLowerCase().endsWith('.pdf')) {
      setFileError('Solo se aceptan informes con extensión .pdf.');
      return;
    }

    const sequence = parseSequence.current + 1;
    parseSequence.current = sequence;
    setFile(nextFile);
    setReport(null);
    setFileError(null);
    setReading(true);

    void parseServiceReportFile(nextFile)
      .then((parsed) => {
        if (parseSequence.current === sequence) setReport(parsed);
      })
      .catch((error: unknown) => {
        if (parseSequence.current !== sequence) return;
        setFileError(error instanceof Error ? error.message : 'No se pudo leer el informe de servicio.');
      })
      .finally(() => {
        if (parseSequence.current === sequence) setReading(false);
      });
  }

  function toggleMatch(itemId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function applyReport() {
    if (!report) return;
    onApply(report, selectedItems);
    onClose();
  }

  return (
    <ModalDialog labelledBy="service-report-title" describedBy="service-report-description" onRequestClose={() => { if (!reading) onClose(); }} className="w-[min(56rem,calc(100vw-2rem))]">
      <header className={modalHeaderClass}>
        <div className="grid min-w-0 gap-2">
          <CardHeader eyebrow="Importación local" title={<span id="service-report-title">Cargar informe de servicio</span>} />
          <Muted id="service-report-description" className="text-sm">Lee un PDF en este equipo, revisa los campos detectados y decide qué sugerencias agregar a la proforma.</Muted>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} disabled={reading} aria-label="Cerrar carga de informe"><X /></Button>
      </header>

      <div className={modalBodyClass}>
        <label className="grid cursor-pointer gap-1 rounded-xl border border-dashed border-navy/25 bg-paper p-5 text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky dark:border-sky/30 dark:bg-navy/30" htmlFor="proforma-service-report-file">
          <input
            className="sr-only"
            id="proforma-service-report-file"
            name="serviceReportFile"
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) => {
              selectFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <div className="font-bold text-navy dark:text-white">{file ? file.name : 'Seleccionar informe de servicio PDF'}</div>
          <Muted>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · texto local` : 'Solo se procesan PDF con texto seleccionable'}</Muted>
        </label>

        {reading ? <div className="rounded-xl border border-sky/40 bg-sky/10 p-4 text-sm font-semibold text-navy dark:text-white" role="status">Analizando el texto del informe…</div> : null}
        {fileError ? <div className="rounded-xl border border-[#b42318]/30 bg-[#b42318]/5 p-4 text-sm text-[#b42318] dark:text-[#ffb0b7]" role="alert">{fileError}</div> : null}

        {report ? (
          <div className="grid gap-4">
            <section className="grid gap-3" aria-labelledby="service-report-preview-title">
              <CardHeader eyebrow="Vista previa" title={<span id="service-report-preview-title">Datos detectados</span>} aside={<Badge tone="success">Texto reconocido</Badge>} />
              <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Cliente" value={report.header.customerName || 'No detectado'} />
                <Field label="Informe Nº" value={report.header.serviceReportNumber || 'No detectado'} />
                <Field label="Fecha / hora del informe" value={`${report.reportDate || 'No detectada'} · ${report.reportTime || 'No detectada'}`} />
                <Field label="Modelo" value={report.header.modelName || 'No detectado'} />
                <Field label="Número de serie" value={report.header.serialNumber || 'No detectado'} />
                <Field label="Técnico" value={report.header.attendedBy || 'No detectado'} />
              </dl>
              <div className="grid gap-3">
                <Detail title="Problema" text={report.problemDescription || 'No detectado'} />
                <Detail title="Tarea realizada" text={report.taskDescription || 'No detectada'} />
                {report.usedPartsDescription ? <Detail title="Repuestos indicados" text={report.usedPartsDescription} /> : null}
              </div>
              <Muted>La fecha y hora detectadas se aplican a la emisión de la proforma y también quedan en el detalle del informe.</Muted>
            </section>

            <section className="grid gap-3" aria-labelledby="service-report-matches-title">
              <CardHeader eyebrow="Catálogos disponibles" title={<span id="service-report-matches-title">Sugerencias de repuestos</span>} aside={<Badge>{selectedItems.length}/{matches.length} seleccionadas</Badge>} />
              <Muted className="text-sm leading-relaxed">Las coincidencias combinan modelo, descripción de la tarea y códigos explícitos del informe. Se priorizan las planillas específicas de Proformas y se completa con el catálogo común. Revísalas antes de agregarlas.</Muted>
              {catalogLoading ? <Muted className="text-sm">Cargando catálogo común…</Muted> : null}
              {!catalogLoading && matches.length > 0 ? (
                <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
                  {matches.map((match) => (
                    <label className={cn('grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border p-3', selectedIds.has(match.item.id) ? 'border-sky bg-sky/10' : 'border-navy/10 bg-white dark:border-sky/20 dark:bg-transparent')} key={match.item.id}>
                      <input className="mt-1 size-4 accent-sky" type="checkbox" checked={selectedIds.has(match.item.id)} onChange={() => toggleMatch(match.item.id)} />
                      <div className="grid min-w-0 gap-0.5">
                        <div className="font-bold text-navy dark:text-white">{match.item.code}</div>
                        <Muted>{match.item.description || 'Sin descripción'}</Muted>
                        <Muted className="italic">{match.reason}{match.item.origin === 'proformas' ? ' · planilla específica de Proformas' : ' · catálogo común'}</Muted>
                      </div>
                      <b className="whitespace-nowrap text-sm tabular-nums text-navy dark:text-white">{currencyLabel(match.item.fixedPriceCurrency ?? priceCurrency)} {formatPrice(match.item, match.item.fixedPriceCurrency ?? priceCurrency)}</b>
                    </label>
                  ))}
                </div>
              ) : null}
              {!catalogLoading && matches.length === 0 ? <Muted className="text-sm">No se encontraron coincidencias confiables. Puedes aplicar los datos y agregar las líneas manualmente.</Muted> : null}
            </section>
          </div>
        ) : null}
      </div>

      <footer className={modalFooterClass}>
        <Muted className="text-sm">{report ? `${selectedItems.length} línea${selectedItems.length === 1 ? '' : 's'} lista${selectedItems.length === 1 ? '' : 's'} para agregar.` : 'Selecciona un informe para continuar.'}</Muted>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={reading}>Cerrar</Button>
          <Button onClick={applyReport} disabled={!report || reading}>Aplicar informe</Button>
        </div>
      </footer>
    </ModalDialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div className="grid min-w-0 gap-0.5 rounded-xl border border-navy/10 bg-paper p-3 dark:border-sky/20 dark:bg-navy/30"><dt className="text-xs text-ink-2 dark:text-[#9fb2d1]">{label}</dt><dd className="m-0 text-sm font-semibold text-navy dark:text-white">{value}</dd></div>;
}

function Detail({ title, text }: { title: string; text: string }) {
  return <div className="grid gap-1"><div className="text-sm font-bold text-navy dark:text-white">{title}</div><Muted className="text-sm leading-relaxed">{text}</Muted></div>;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(value);
}

function formatPrice(item: SalesPricePart, currency: ContractPriceCurrency): string {
  const value = currency === 'usd' ? item.salePriceUsd : item.salePriceLocal;
  return currency === 'usd'
    ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    : formatNumber(value);
}

function currencyLabel(currency: ContractPriceCurrency): string {
  return currency === 'usd' ? 'USD' : 'Gs.';
}
