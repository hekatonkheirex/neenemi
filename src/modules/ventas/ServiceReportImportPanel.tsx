import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContractPriceCurrency, SalesPricePart } from './types';
import {
  findServiceReportCatalogMatches,
  parseServiceReportFile,
  type ParsedServiceReport,
  type ServiceReportCatalogMatch,
} from './service-report';

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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !reading) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, reading]);

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
    <div
      className="service-report-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !reading) onClose();
      }}
    >
      <section className="service-report-dialog" role="dialog" aria-modal="true" aria-labelledby="service-report-title" aria-describedby="service-report-description">
        <header className="service-report-dialog-header">
          <div>
            <div className="eyebrow">IMPORTACIÓN LOCAL</div>
            <h2 id="service-report-title">Cargar informe de servicio</h2>
            <p id="service-report-description">Lee un PDF en este equipo, revisa los campos detectados y decide qué sugerencias agregar a la proforma.</p>
          </div>
          <button className="mps-editor-close" type="button" onClick={onClose} disabled={reading} ref={closeButtonRef} aria-label="Cerrar carga de informe">×</button>
        </header>

        <div className="service-report-dialog-body">
          <label className={`service-report-dropzone ${file ? 'has-file' : ''}`} htmlFor="proforma-service-report-file">
            <input
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
            <strong>{file ? file.name : 'Seleccionar informe de servicio PDF'}</strong>
            <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · texto local` : 'Solo se procesan PDF con texto seleccionable'}</span>
          </label>

          {reading ? <div className="service-report-notice" role="status">Analizando el texto del informe…</div> : null}
          {fileError ? <div className="service-report-error" role="alert">{fileError}</div> : null}

          {report ? (
            <div className="service-report-preview-stack">
              <section className="service-report-preview" aria-labelledby="service-report-preview-title">
                <div className="card-heading">
                  <div>
                    <div className="eyebrow">VISTA PREVIA</div>
                    <h3 id="service-report-preview-title">Datos detectados</h3>
                  </div>
                  <span className="service-report-detected">Texto reconocido</span>
                </div>
                <dl className="service-report-fields">
                  <div><dt>Cliente</dt><dd>{report.header.customerName || 'No detectado'}</dd></div>
                  <div><dt>Informe Nº</dt><dd>{report.header.serviceReportNumber || 'No detectado'}</dd></div>
                  <div><dt>Fecha / hora del informe</dt><dd>{report.reportDate || 'No detectada'} · {report.reportTime || 'No detectada'}</dd></div>
                  <div><dt>Modelo</dt><dd>{report.header.modelName || 'No detectado'}</dd></div>
                  <div><dt>Número de serie</dt><dd>{report.header.serialNumber || 'No detectado'}</dd></div>
                  <div><dt>Técnico</dt><dd>{report.header.attendedBy || 'No detectado'}</dd></div>
                </dl>
                <div className="service-report-details">
                  <div><strong>Problema</strong><p>{report.problemDescription || 'No detectado'}</p></div>
                  <div><strong>Tarea realizada</strong><p>{report.taskDescription || 'No detectada'}</p></div>
                  {report.usedPartsDescription ? <div><strong>Repuestos indicados</strong><p>{report.usedPartsDescription}</p></div> : null}
                </div>
                <p className="service-report-footnote">La fecha y hora detectadas se aplican a la emisión de la proforma y también quedan en el detalle del informe.</p>
              </section>

              <section className="service-report-matches" aria-labelledby="service-report-matches-title">
                <div className="card-heading">
                  <div>
                    <div className="eyebrow">CATÁLOGOS DISPONIBLES</div>
                    <h3 id="service-report-matches-title">Sugerencias de repuestos</h3>
                  </div>
                  <span className="muted-note">{selectedItems.length}/{matches.length} seleccionadas</span>
                </div>
                <p className="service-report-explanation">Las coincidencias combinan modelo, descripción de la tarea y códigos explícitos del informe. Se priorizan las planillas específicas de Proformas y se completa con el catálogo común. Revísalas antes de agregarlas.</p>
                {catalogLoading ? <p className="empty-inline">Cargando catálogo común…</p> : null}
                {!catalogLoading && matches.length > 0 ? (
                  <div className="service-report-match-list">
                    {matches.map((match) => (
                      <label className="service-report-match" key={match.item.id}>
                        <input type="checkbox" checked={selectedIds.has(match.item.id)} onChange={() => toggleMatch(match.item.id)} />
                        <span>
                          <strong>{match.item.code}</strong>
                          <small>{match.item.description || 'Sin descripción'}</small>
                          <em>{match.reason}{match.item.origin === 'proformas' ? ' · planilla específica de Proformas' : ' · catálogo común'}</em>
                        </span>
                        <b>{currencyLabel(match.item.fixedPriceCurrency ?? priceCurrency)} {formatPrice(match.item, match.item.fixedPriceCurrency ?? priceCurrency)}</b>
                      </label>
                    ))}
                  </div>
                ) : null}
                {!catalogLoading && matches.length === 0 ? <p className="empty-inline">No se encontraron coincidencias confiables. Puedes aplicar los datos y agregar las líneas manualmente.</p> : null}
              </section>
            </div>
          ) : null}
        </div>

        <footer className="service-report-dialog-footer">
          <span>{report ? `${selectedItems.length} línea${selectedItems.length === 1 ? '' : 's'} lista${selectedItems.length === 1 ? '' : 's'} para agregar.` : 'Selecciona un informe para continuar.'}</span>
          <div className="sales-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={reading}>Cerrar</button>
            <button className="primary-button" type="button" onClick={applyReport} disabled={!report || reading}>Aplicar informe</button>
          </div>
        </footer>
      </section>
    </div>
  );
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
