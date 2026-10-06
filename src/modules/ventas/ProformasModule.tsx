import { useEffect, useMemo, useRef, useState } from 'react';
import { checkCurrentAppliedImport } from '../../core/import-status';
import { useUnsavedChanges } from '../../core/unsavedChanges';
import { normalizePartCode } from '../catalogo/normalization';
import { exportProforma } from './export';
import OpenContractImportPanel from './OpenContractImportPanel';
import SalesCatalogImportPanel from './SalesCatalogImportPanel';
import ServiceReportImportPanel from './ServiceReportImportPanel';
import { mergeReportDateTime, type ParsedServiceReport } from './service-report';
import type {
  ContractPriceCurrency,
  OpenContractSnapshot,
  PricingSettings,
  Proforma,
  ProformaHeader,
  ProformaLine,
  ProformaLineInput,
  ProformaSummary,
  SalesPricePart,
  SalesCatalogKind,
  SalesCatalogSnapshot,
  SalesCatalogs,
} from './types';
import { readJson, toErrorMessage } from '../../core/http';
import { ExportButton } from '../../core/ActionButtons';

const numberFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const usdNumberFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('es-PY', { dateStyle: 'medium' });

type DraftLine = {
  id: string;
  part: SalesPricePart | null;
  code: string;
  kind: SalesCatalogKind;
  quantity: number;
  source: 'catalog' | 'legacy' | 'contract';
};

type DraftLaborLine = {
  id: string;
  description: string;
  costLocal: number | null;
  salePriceLocal: number | null;
};

const PROFORMA_LABOR_ROWS = 7;

const EMPTY_SALES_CATALOGS: SalesCatalogs = { consumibles: null, repuestos: null };

export default function ProformasModule() {
  const [pricing, setPricing] = useState<PricingSettings | null>(null);
  const [salesCatalogs, setSalesCatalogs] = useState<SalesCatalogs>(EMPTY_SALES_CATALOGS);
  const [openContract, setOpenContract] = useState<OpenContractSnapshot | null>(null);
  const [header, setHeader] = useState<ProformaHeader>(() => createHeader());
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SalesPricePart[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [lineMatches, setLineMatches] = useState<Record<string, SalesPricePart[]>>({});
  const [laborRows, setLaborRows] = useState<DraftLaborLine[]>(createLaborRows);
  const [history, setHistory] = useState<ProformaSummary[]>([]);
  const [savedProforma, setSavedProforma] = useState<Proforma | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [reportImportOpen, setReportImportOpen] = useState(false);
  const [salesCatalogImportOpen, setSalesCatalogImportOpen] = useState(false);
  const [contractImportOpen, setContractImportOpen] = useState(false);
  const [reportCatalog, setReportCatalog] = useState<SalesPricePart[]>([]);
  const [reportCatalogLoading, setReportCatalogLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  useUnsavedChanges(hasProformaDraft(savedProforma, header, lines, laborRows));
  const lineLookupControllers = useRef(new Map<string, AbortController>());

  const contractParts = useMemo(
    () => (openContract && pricing ? openContract.items.map((item) => toContractSalesPart(item, openContract.meta.priceCurrency, pricing)) : []),
    [openContract, pricing],
  );

  const salesCatalogParts = useMemo(
    () => (pricing
      ? (['consumibles', 'repuestos'] as SalesCatalogKind[]).flatMap((kind) => {
        const snapshot = salesCatalogs[kind];
        return snapshot ? snapshot.items.map((item) => toSalesCatalogPart(item, pricing)) : [];
      })
      : []),
    [pricing, salesCatalogs],
  );

  const reportCatalogItems = useMemo(
    () => mergeSearchResults(header.mode === 'contrato-abierto' ? contractParts : salesCatalogParts, reportCatalog),
    [contractParts, header.mode, reportCatalog, salesCatalogParts],
  );

  const priceCurrency: ContractPriceCurrency = header.mode === 'contrato-abierto'
    ? savedProforma?.currency === 'USD'
      ? 'usd'
      : savedProforma?.currency === 'PYG'
        ? 'local'
        : openContract?.meta.priceCurrency ?? 'local'
    : 'local';
  const priceLabel = currencyLabel(priceCurrency);

  useEffect(() => {
    Promise.all([
      fetch('/api/sales/pricing').then(readJson<PricingSettings>),
      fetch('/api/sales/proformas').then(readJson<ProformaSummary[]>),
      fetch('/api/sales/catalogs').then(readJson<SalesCatalogs>),
      fetch('/api/sales/open-contract').then(readJson<OpenContractSnapshot | null>),
    ])
      .then(([loadedPricing, loadedHistory, loadedCatalogs, loadedContract]) => {
        setPricing(loadedPricing);
        setHistory(loadedHistory);
        setSalesCatalogs(loadedCatalogs);
        setOpenContract(loadedContract);
      })
      .catch((requestError: unknown) => setError(toErrorMessage(requestError)));
  }, []);

  useEffect(() => () => {
    for (const controller of lineLookupControllers.current.values()) controller.abort();
  }, []);

  useEffect(() => {
    if (!reportImportOpen || reportCatalog.length > 0) return undefined;

    const controller = new AbortController();
    setReportCatalogLoading(true);
    fetch('/api/sales/price-list', { signal: controller.signal })
      .then((response) => readJson<SalesPricePart[]>(response))
      .then(setReportCatalog)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(toErrorMessage(requestError));
      })
      .finally(() => setReportCatalogLoading(false));

    return () => controller.abort();
  }, [reportCatalog.length, reportImportOpen]);

  useEffect(() => {
    const normalizedSearch = search.trim();
    if (normalizedSearch.length < 2) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }

    if (header.mode === 'contrato-abierto') {
      const query = normalizeSearchValue(normalizedSearch);
      setSearchResults(contractParts.filter((item) => (
        normalizeSearchValue(`${item.code} ${item.description} ${item.models.join(' ')}`).includes(query)
      )).slice(0, 30));
      setLoadingSearch(false);
      return;
    }

    const query = normalizeSearchValue(normalizedSearch);
    const legacyResults = salesCatalogParts.filter((item) => (
      normalizeSearchValue(`${item.code} ${item.description} ${item.models.join(' ')}`).includes(query)
    ));
    const controller = new AbortController();
    setLoadingSearch(true);
    fetch(`/api/sales/price-list?query=${encodeURIComponent(normalizedSearch)}`, { signal: controller.signal })
      .then((response) => readJson<SalesPricePart[]>(response))
      .then((sharedResults) => setSearchResults(mergeSearchResults(legacyResults, sharedResults)))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(toErrorMessage(requestError));
      })
      .finally(() => setLoadingSearch(false));

    return () => controller.abort();
  }, [contractParts, header.mode, salesCatalogParts, search]);

  const partsTotal = useMemo(
    () => lines.reduce((total, line) => total + getPartSalePrice(line.part, priceCurrency) * line.quantity, 0),
    [lines, priceCurrency],
  );
  const filledLaborRows = useMemo(() => laborRows.filter(isLaborRowUsed), [laborRows]);
  const laborTotal = filledLaborRows.reduce((sum, row) => sum + getLaborSalePrice(row, pricing, priceCurrency), 0);
  const total = partsTotal + laborTotal;
  const loadedSalesCatalogCount = Number(Boolean(salesCatalogs.consumibles)) + Number(Boolean(salesCatalogs.repuestos));

  function updateHeader(field: keyof ProformaHeader, value: string) {
    setHeader((current) => ({ ...current, [field]: value }));
    setSavedProforma(null);
  }

  function updateIssuedTime(value: string) {
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    setHeader((current) => ({
      ...current,
      issuedAt: `${current.issuedAt.slice(0, 10)}T${value}:00.000Z`,
    }));
    setSavedProforma(null);
  }

  function addLine(kind: SalesCatalogKind = 'repuestos') {
    const id = crypto.randomUUID();
    setLines((current) => [...current, {
      id,
      part: null,
      code: '',
      kind,
      quantity: 1,
      source: 'catalog',
    }]);
    setMessage('Línea lista para buscar por código.');
    setSavedProforma(null);
  }

  function addPart(part: SalesPricePart) {
    setLines((current) => {
      const existing = current.find((line) => line.part?.id === part.id);
      if (existing) {
        return current.map((line) => line.part?.id === part.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, {
        id: crypto.randomUUID(),
        part,
        code: part.code,
        kind: part.catalogKind ?? 'repuestos',
        quantity: 1,
        source: draftSourceForPart(part),
      }];
    });
    setSearch('');
    setMessage(`${part.code} agregado a la proforma.`);
    setSavedProforma(null);
  }

  function updateQuantity(id: string, value: string) {
    const quantity = Math.max(1, Math.floor(Number(value)) || 1);
    setLines((current) => current.map((line) => line.id === id ? { ...line, quantity } : line));
    setSavedProforma(null);
  }

  function updateLineCode(id: string, code: string) {
    const line = lines.find((item) => item.id === id);
    if (!line) return;
    setLines((current) => current.map((item) => item.id === id
      ? { ...item, code, part: null, source: 'catalog' }
      : item));
    void lookupLine(id, code, line.kind);
    setSavedProforma(null);
  }

  function updateLineKind(id: string, kind: SalesCatalogKind) {
    const line = lines.find((item) => item.id === id);
    if (!line) return;
    setLines((current) => current.map((item) => item.id === id
      ? { ...item, kind, part: null, source: 'catalog' }
      : item));
    void lookupLine(id, line.code, kind);
    setSavedProforma(null);
  }

  async function lookupLine(id: string, code: string, kind: SalesCatalogKind) {
    const previousController = lineLookupControllers.current.get(id);
    previousController?.abort();
    setLineMatches((current) => ({ ...current, [id]: [] }));

    const normalizedCode = code.trim();
    if (normalizedCode.length < 2) return;

    const controller = new AbortController();
    lineLookupControllers.current.set(id, controller);
    const localCandidates = (header.mode === 'contrato-abierto' ? contractParts : salesCatalogParts)
      .filter((part) => !part.catalogKind || part.catalogKind === kind);
    let matches = mergeSearchResults(localCandidates.filter((part) => matchesPart(part, normalizedCode)), []);
    setLineMatches((current) => ({ ...current, [id]: matches }));
    const exactLocal = findExactPart(matches, normalizedCode);
    if (exactLocal) chooseLinePart(id, exactLocal, normalizedCode);

    if (header.mode !== 'contrato-abierto') {
      try {
        const response = await fetch(`/api/sales/price-list?query=${encodeURIComponent(normalizedCode)}`, { signal: controller.signal });
        const sharedResults = await readJson<SalesPricePart[]>(response);
        if (controller.signal.aborted) return;
        matches = mergeSearchResults(matches, sharedResults.filter((part) => !part.catalogKind || part.catalogKind === kind));
        setLineMatches((current) => ({ ...current, [id]: matches }));
        const exact = findExactPart(matches, normalizedCode);
        if (exact) chooseLinePart(id, exact, normalizedCode);
      } catch (lookupError: unknown) {
        if (lookupError instanceof DOMException && lookupError.name === 'AbortError') return;
        setError(toErrorMessage(lookupError));
      }
    }
  }

  function chooseLinePart(id: string, part: SalesPricePart, expectedCode?: string) {
    setLines((current) => current.map((line) => {
      if (line.id !== id) return line;
      if (expectedCode && normalizePartCode(line.code) !== normalizePartCode(expectedCode)) return line;
      return {
        ...line,
        part,
        code: part.code,
        kind: part.catalogKind ?? line.kind,
        source: draftSourceForPart(part),
      };
    }));
    setLineMatches((current) => ({ ...current, [id]: [] }));
  }

  function updateLaborRow(id: string, patch: Partial<Omit<DraftLaborLine, 'id'>>) {
    setLaborRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
    setSavedProforma(null);
  }

  function removeLine(id: string) {
    lineLookupControllers.current.get(id)?.abort();
    lineLookupControllers.current.delete(id);
    setLineMatches((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setLines((current) => current.filter((line) => line.id !== id));
    setSavedProforma(null);
  }

  function addSuggestedParts(items: readonly SalesPricePart[]) {
    if (items.length === 0) return;
    setLines((current) => {
      const next = [...current];
      items.forEach((part) => {
        const existingIndex = next.findIndex((line) => line.part?.id === part.id);
        if (existingIndex === -1) {
          next.push({
            id: crypto.randomUUID(),
            part,
            code: part.code,
            kind: part.catalogKind ?? 'repuestos',
            quantity: 1,
            source: draftSourceForPart(part),
          });
        } else {
          const existing = next[existingIndex];
          next[existingIndex] = { ...existing, quantity: existing.quantity + 1 };
        }
      });
      return next;
    });
  }

  function handleApplyServiceReport(report: ParsedServiceReport, suggestedItems: SalesPricePart[]) {
    const reportDetails = [
      report.reportDate || report.reportTime ? `Fecha/hora del informe: ${report.reportDate || 'no detectada'} ${report.reportTime || ''}`.trim() : '',
      report.problemDescription ? `Problema: ${report.problemDescription}` : '',
      report.taskDescription ? `Tarea realizada: ${report.taskDescription}` : '',
      report.usedPartsDescription ? `Repuestos indicados: ${report.usedPartsDescription}` : '',
    ].filter(Boolean).join('\n');

    setHeader((current) => ({
      ...current,
      customerName: report.header.customerName || current.customerName,
      customerContact: report.header.customerContact || current.customerContact,
      serviceReportNumber: report.header.serviceReportNumber || current.serviceReportNumber,
      reference: report.header.reference || current.reference,
      issuedAt: mergeReportDateTime(current.issuedAt, report.reportDate, report.reportTime),
      attendedBy: report.header.attendedBy || current.attendedBy,
      modelName: report.header.modelName || current.modelName,
      serialNumber: report.header.serialNumber || current.serialNumber,
      serviceReport: [current.serviceReport.trim(), reportDetails].filter(Boolean).join('\n\n'),
    }));
    addSuggestedParts(suggestedItems);
    const laborDescription = report.taskDescription || report.problemDescription;
    if (laborDescription) {
      setLaborRows((current) => current.map((row, index) => index === 0 ? { ...row, description: laborDescription } : row));
    }
    setSearch('');
    setSavedProforma(null);
    setError(null);
    setMessage(`Informe ${report.header.serviceReportNumber || report.fileName} aplicado${suggestedItems.length > 0 ? ` con ${suggestedItems.length} sugerencias` : ''}.`);
  }

  async function handleContractImport(snapshot: OpenContractSnapshot, file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sourceHash = await digest(bytes);
    let batchId: string | undefined;

    try {
      const currentImport = await checkCurrentAppliedImport({
        domain: 'sales-open-contract',
        sourceType: 'open-contract',
        sourceHash,
      });
      if (currentImport.current) {
        setError(null);
        setMessage('Este contrato ya está vigente; no se volvió a importar ni se modificó la lista.');
        return;
      }

      const batch = await readJson<{ id: string }>(fetch('/api/imports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain: 'sales-open-contract',
          sourceName: file.name,
          sourceType: 'open-contract',
          sourceHash,
        }),
      }));
      batchId = batch.id;

      await readJson(fetch(`/api/imports/${batchId}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentBase64: bytesToBase64(bytes),
          contentType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
        }),
      }));

      const saved = await readJson<OpenContractSnapshot>(fetch('/api/sales/open-contract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batchId, snapshot }),
      }));
      setOpenContract(saved);
      setHeader((current) => ({ ...current, mode: 'contrato-abierto' }));
      setSearch('');
      setSearchResults([]);
      setSavedProforma(null);
      setError(null);
      setMessage(`Contrato ${file.name} guardado con ${numberFormat.format(saved.items.length)} líneas.`);
    } catch (importError: unknown) {
      if (batchId) {
        try {
          await fetch(`/api/imports/${batchId}/status`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'failed' }),
          });
        } catch {
          // El error principal de la importación es el que debe ver el usuario.
        }
      }
      throw importError;
    }
  }

  async function handleSalesCatalogImport(kind: SalesCatalogKind, snapshot: SalesCatalogSnapshot, file: File): Promise<boolean> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sourceHash = await digest(bytes);
    let batchId: string | undefined;

    try {
      const currentImport = await checkCurrentAppliedImport({
        domain: 'sales-catalog',
        sourceType: `proformas-catalog-${kind}`,
        sourceHash,
      });
      if (currentImport.current) {
        setError(null);
        setMessage(`La lista de ${kind} ya está vigente; no se duplicaron filas ni se reemplazó el estado actual.`);
        return false;
      }

      const batch = await readJson<{ id: string }>(fetch('/api/imports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain: 'sales-catalog',
          sourceName: file.name,
          sourceType: `proformas-catalog-${kind}`,
          sourceHash,
        }),
      }));
      batchId = batch.id;

      await readJson(fetch(`/api/imports/${batchId}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentBase64: bytesToBase64(bytes),
          contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      }));

      const saved = await readJson<SalesCatalogSnapshot>(fetch(`/api/sales/catalogs/${kind}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batchId, snapshot }),
      }));
      setSalesCatalogs((current) => ({ ...current, [kind]: saved }));
      setError(null);
      setMessage(`${kind === 'consumibles' ? 'Consumibles' : 'Repuestos'} actualizado: ${numberFormat.format(saved.items.length)} registros.`);
      return true;
    } catch (importError: unknown) {
      if (batchId) {
        try {
          await fetch(`/api/imports/${batchId}/status`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'failed' }),
          });
        } catch {
          // El error principal de la importación es el que debe ver el usuario.
        }
      }
      throw importError;
    }
  }

  async function saveDraft() {
    if (lines.some((line) => !line.part)) {
      setError('Completa el código de cada línea o elimina las líneas pendientes antes de guardar.');
      return;
    }

    if (lines.length === 0 && filledLaborRows.length === 0) {
      setError('Agrega por lo menos un repuesto o una línea de mano de obra.');
      return;
    }

    if (!pricing) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/sales/proformas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: savedProforma?.id,
          header,
          currency: priceCurrency === 'usd' ? 'USD' : 'PYG',
          status: 'draft',
          lines: [
            ...lines.map((line) => draftLineToInput(line)),
            ...filledLaborRows.map((row) => ({
              kind: 'labor' as const,
              description: row.description.trim() || 'Mano de obra',
              costLocal: row.costLocal,
              unitPriceUsd: priceCurrency === 'usd' ? getLaborSalePrice(row, pricing, priceCurrency) : null,
              unitPriceLocal: priceCurrency === 'local' ? getLaborSalePrice(row, pricing, priceCurrency) : null,
              quantity: 1,
            })),
          ],
        }),
      });
      const body = await readJson<Proforma>(response);
      setSavedProforma(body);
      setHistory((current) => [toSummary(body), ...current.filter((item) => item.id !== body.id)]);
      setMessage(`Proforma guardada: ${body.id.slice(0, 8)}.`);
    } catch (saveError: unknown) {
      setError(toErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  function startNew() {
    setHeader(createHeader());
    setLines([]);
    setLineMatches({});
    setLaborRows(createLaborRows());
    setSavedProforma(null);
    setMessage('Nueva proforma lista.');
    setError(null);
  }

  async function loadSaved(id: string) {
    setError(null);
    try {
      const proforma = await fetch(`/api/sales/proformas/${id}`).then((response) => readJson<Proforma>(response));
      const partLines = proforma.lines.filter((line) => line.kind === 'part');
      const resolvedParts = await Promise.all(partLines.map((line) => line.partId ? findPart(line.code) : Promise.resolve(null)));
      setHeader({
        customerName: proforma.customerName,
        customerContact: proforma.customerContact,
        serviceReport: proforma.serviceReport,
        serviceReportNumber: proforma.serviceReportNumber,
        reference: proforma.reference,
        issuedAt: proforma.issuedAt,
        attendedBy: proforma.attendedBy,
        modelName: proforma.modelName,
        serialNumber: proforma.serialNumber,
        mode: proforma.mode,
      });
      setLines(partLines.map((line, index) => ({
        id: crypto.randomUUID(),
        part: resolvedParts[index] ?? savedLineToPart(line, line.partId ? 'catalog' : proforma.mode === 'contrato-abierto' ? 'contract' : 'legacy', proforma.currency),
        code: line.code,
        kind: line.catalogKind ?? resolvedParts[index]?.catalogKind ?? 'repuestos',
        quantity: line.quantity,
        source: line.partId ? 'catalog' : proforma.mode === 'contrato-abierto' ? 'contract' : 'legacy',
      })));
      setLineMatches({});
      const savedLaborRows = proforma.lines
        .filter((line) => line.kind === 'labor')
        .slice(0, PROFORMA_LABOR_ROWS)
        .map((line) => ({
          id: crypto.randomUUID(),
          description: line.description,
          costLocal: line.costLocal,
          salePriceLocal: proforma.currency === 'USD'
            ? line.unitPriceUsd ?? (line.unitPriceLocal === null ? null : roundNumber(line.unitPriceLocal / proforma.pricing.exchangeRate, 2))
            : line.unitPriceLocal,
        }));
      setLaborRows([...savedLaborRows, ...createLaborRows(PROFORMA_LABOR_ROWS - savedLaborRows.length)]);
      setSavedProforma(proforma);
      setPricing(proforma.pricing);
      setMessage(`Proforma ${id.slice(0, 8)} cargada.`);
    } catch (loadError: unknown) {
      setError(toErrorMessage(loadError));
    }
  }

  async function handleExport() {
    if (!savedProforma) return;
    setError(null);
    try {
      await exportProforma(savedProforma);
      setMessage('Proforma XLSX generada.');
    } catch (exportError: unknown) {
      setError(toErrorMessage(exportError));
    }
  }

  return (
    <div className="page-content sales-page proforma-page">
      <section className="catalog-header">
        <div>
          <div className="eyebrow">VENTAS / DOCUMENTOS</div>
          <h1>Proformas</h1>
          <p className="lead">Arma una cotización con el catálogo común, guárdala en SQLite y descárgala como XLSX.</p>
        </div>
        <div className="sales-actions">
          <button className="secondary-button" type="button" onClick={startNew}>Nueva</button>
          <button className="secondary-button" type="button" onClick={() => setReportImportOpen(true)}>Importar informe PDF</button>
          <button className="secondary-button" type="button" onClick={() => setSalesCatalogImportOpen(true)}>Actualizar catálogos</button>
          <button className="secondary-button" type="button" onClick={() => setContractImportOpen(true)}>Importar contrato</button>
          <ExportButton onClick={() => void handleExport()} disabled={!savedProforma}>Exportar XLSX</ExportButton>
        </div>
      </section>

      <section className="sales-status" aria-live="polite">
        <span className={`status-dot ${error ? 'error' : !pricing ? 'pending' : 'ready'}`} />
        <span>{error || message || (pricing ? 'Lista para preparar una proforma.' : 'Conectando con ventas…')}</span>
      </section>

      <section className="proforma-layout">
        <div className="proforma-main">
          <section className="sales-card">
            <div className="card-heading">
              <div>
                <div className="eyebrow">CABECERA</div>
                <h2>Datos de la consulta</h2>
              </div>
              <label className="compact-field">
                <span>Modo</span>
                <select id="proforma-mode" name="mode" value={header.mode} onChange={(event) => updateHeader('mode', event.target.value)}>
                  <option value="sin-contrato">Sin contrato</option>
                  <option value="contrato-abierto">Contrato abierto</option>
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label className="search-field"><span>Cliente</span><input id="proforma-customer" name="customerName" value={header.customerName} onChange={(event) => updateHeader('customerName', event.target.value)} placeholder="Nombre del cliente" /></label>
              <label className="search-field"><span>Contacto</span><input id="proforma-contact" name="customerContact" value={header.customerContact} onChange={(event) => updateHeader('customerContact', event.target.value)} placeholder="Teléfono o correo" /></label>
              <label className="search-field"><span>INF. Servicio Nº</span><input id="proforma-service-report-number" name="serviceReportNumber" value={header.serviceReportNumber} onChange={(event) => updateHeader('serviceReportNumber', event.target.value)} placeholder="Ej. 2921689" /></label>
              <label className="search-field"><span>Referencia</span><input id="proforma-reference" name="reference" value={header.reference} onChange={(event) => updateHeader('reference', event.target.value)} placeholder="Ej. Consulta 2026-001" /></label>
              <label className="search-field"><span>Fecha</span><input id="proforma-issued-at" name="issuedAt" type="date" value={header.issuedAt.slice(0, 10)} onChange={(event) => updateHeader('issuedAt', `${event.target.value}T12:00:00.000Z`)} /></label>
              <label className="search-field"><span>Hora</span><input id="proforma-issued-time" name="issuedTime" type="time" value={timeInputValue(header.issuedAt)} onChange={(event) => updateIssuedTime(event.target.value)} /></label>
              <label className="search-field"><span>Modelo</span><input id="proforma-model" name="modelName" value={header.modelName} onChange={(event) => updateHeader('modelName', event.target.value)} placeholder="Modelo Canon" /></label>
              <label className="search-field"><span>Número de serie</span><input id="proforma-serial" name="serialNumber" value={header.serialNumber} onChange={(event) => updateHeader('serialNumber', event.target.value)} placeholder="Opcional" /></label>
              <label className="search-field"><span>Atendido por</span><input id="proforma-attended-by" name="attendedBy" value={header.attendedBy} onChange={(event) => updateHeader('attendedBy', event.target.value)} placeholder="Responsable" /></label>
              <label className="search-field form-wide"><span>Informe / observación</span><textarea id="proforma-service-report" name="serviceReport" value={header.serviceReport} onChange={(event) => updateHeader('serviceReport', event.target.value)} placeholder="Detalle del pedido o del servicio" rows={3} /></label>
            </div>
          </section>

          <section className="sales-card">
            <div className="card-heading">
              <div>
                <div className="eyebrow">{header.mode === 'contrato-abierto' ? 'CONTRATO ABIERTO' : 'CATÁLOGO COMÚN'}</div>
                <h2>{header.mode === 'contrato-abierto' ? 'Agregar líneas contractuales' : 'Agregar repuestos'}</h2>
              </div>
              <div className="sales-actions">
                <span className="muted-note">{header.mode === 'contrato-abierto' ? `Precio fijo en ${priceLabel}` : 'Escribe al menos 2 caracteres'}</span>
                <button className="secondary-button" type="button" onClick={() => addLine()}>Agregar línea</button>
              </div>
            </div>
            {header.mode === 'contrato-abierto' ? (
              <div className="contract-source-banner">
              <div>
                <strong>{openContract ? openContract.meta.fileName : 'Sin contrato cargado'}</strong>
                <span>{openContract ? `${numberFormat.format(openContract.items.length)} líneas · precio fijo original en ${currencyLabel(openContract.meta.priceCurrency)}` : 'Importa un XLSX o PDF para habilitar la búsqueda contractual.'}</span>
              </div>
                {openContract?.meta.sourceBatchId && openContract.meta.sourceFileId ? <a className="text-button" href={`/api/imports/${encodeURIComponent(openContract.meta.sourceBatchId)}/files/${encodeURIComponent(openContract.meta.sourceFileId)}`} download={openContract.meta.fileName}>Descargar original</a> : null}
                <button className="secondary-button" type="button" onClick={() => setContractImportOpen(true)}>Cargar lista</button>
              </div>
            ) : null}
            {header.mode === 'sin-contrato' ? (
              <div className="sales-catalog-source-banner">
                <div>
                  <strong>{loadedSalesCatalogCount === 0 ? 'Catálogos específicos no cargados' : `${loadedSalesCatalogCount}/2 catálogos específicos cargados`}</strong>
                  <span>{loadedSalesCatalogCount === 0 ? 'La búsqueda usa el catálogo común de la suite. Puedes recuperar las planillas antiguas de Consumibles y Repuestos cuando las tengas.' : 'Las planillas antiguas tienen prioridad en la búsqueda; el catálogo común completa los resultados que no estén en ellas.'}</span>
                </div>
                <button className="secondary-button" type="button" onClick={() => setSalesCatalogImportOpen(true)}>Actualizar</button>
              </div>
            ) : null}
            <label className="search-field sales-search"><span>Buscar por código o descripción</span><input id="proforma-part-search" name="partSearch" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej. FK-123 o rodillo" /></label>
            {search.trim().length >= 2 && (
              <div className="suggestion-list">
                {searchResults.map((item) => (
                  <button className="suggestion-row" key={item.id} type="button" onClick={() => addPart(item)}>
                    <span>
                      <strong>{item.code}</strong>
                      <small>{item.description || 'Sin descripción'}</small>
                      <small className="suggestion-meta">{partSourceLabel(item)}</small>
                    </span>
                    <span className="suggestion-price">{priceLabel} {formatProformaAmount(getPartSalePrice(item, priceCurrency), priceCurrency)}{item.fixedPriceCurrency ? ' fijo' : ''} <b>+</b></span>
                  </button>
                ))}
                {searchResults.length === 0 && <p className="empty-inline">{loadingSearch ? 'Buscando…' : header.mode === 'contrato-abierto' && !openContract ? 'Carga primero el contrato abierto.' : 'No se encontraron partes.'}</p>}
              </div>
            )}
          </section>

          <section className="sales-card">
            <div className="card-heading"><div><div className="eyebrow">DETALLE</div><h2>Ítems de la proforma</h2></div><span className="muted-note">{lines.length} líneas</span></div>
            <div className="proforma-table-wrap">
              <table className="proforma-table">
                <thead><tr><th>Tipo</th><th>Código</th><th>Descripción</th><th>Estado / stock</th><th>Cantidad</th><th className="align-right">Unitario {priceLabel}</th><th className="align-right">Total {priceLabel}</th><th /></tr></thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <select className="proforma-line-kind" value={line.kind} onChange={(event) => updateLineKind(line.id, event.target.value as SalesCatalogKind)} aria-label={`Tipo de línea ${line.id}`}>
                          <option value="repuestos">Repuesto</option>
                          <option value="consumibles">Consumible</option>
                        </select>
                      </td>
                      <td>
                        <input className="labor-input proforma-line-code" value={line.code} onChange={(event) => updateLineCode(line.id, event.target.value)} placeholder="Código" aria-label={`Código de línea ${line.id}`} />
                        {line.part ? null : lineMatches[line.id]?.length ? (
                          <div className="proforma-line-matches">
                            {lineMatches[line.id].map((match) => (
                              <button key={`${match.origin ?? 'shared'}-${match.id}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseLinePart(line.id, match)}>
                                <strong>{match.code}</strong>
                                <span>{match.description || 'Sin descripción'}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td>{line.part ? <><strong>{line.part.description || 'Sin descripción'}</strong>{line.part.group ? <small className="table-secondary-text">{line.part.group}</small> : null}</> : line.code ? <span className="proforma-unresolved-line">Código no encontrado</span> : <span className="table-secondary-text">La descripción aparecerá aquí</span>}</td>
                      <td>
                        {line.part ? (
                          <div className="proforma-line-metadata">
                            <span className={`proforma-line-status ${partStatusTone(line.part, header.mode)}`}>{partStatusLabel(line.part, header.mode)}</span>
                            <small>{partStockLabel(line.part, header.mode)}</small>
                            <small>{`Origen: ${linePartSourceLabel(line.part)}`}</small>
                          </div>
                        ) : (
                          <span className="table-secondary-text">Se mostrará al resolver el código</span>
                        )}
                      </td>
                      <td><input className="quantity-input" id={`proforma-line-${line.id}-quantity`} name={`lineQuantity-${line.id}`} type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateQuantity(line.id, event.target.value)} /></td>
                      <td className="align-right">{line.part ? formatProformaAmount(getPartSalePrice(line.part, priceCurrency), priceCurrency) : '—'}</td>
                      <td className="align-right price-cell">{line.part ? formatProformaAmount(getPartSalePrice(line.part, priceCurrency) * line.quantity, priceCurrency) : '—'}</td>
                      <td><button className="icon-button" type="button" onClick={() => removeLine(line.id)} aria-label={`Quitar ${line.code || 'línea vacía'}`}>×</button></td>
                    </tr>
                  ))}
                  {lines.length === 0 && <tr><td colSpan={7} className="empty-cell">Agrega una línea desde el buscador superior o con “Agregar línea”.</td></tr>}
                </tbody>
              </table>
            </div>
            <section className="labor-section" aria-labelledby="proforma-labor-title">
              <div className="card-heading labor-section-heading">
                <div>
                  <div className="eyebrow">MANO DE OBRA / SERVICIO</div>
                  <h2 id="proforma-labor-title">Trabajos opcionales</h2>
                </div>
                <span className="muted-note">Hasta {PROFORMA_LABOR_ROWS} renglones</span>
              </div>
              <p className="labor-help">Completa descripción, costo unitario y precio de venta. Si no indicas un precio, se usa la tarifa configurada.</p>
              <div className="proforma-table-wrap labor-table-wrap">
                <table className="proforma-table labor-table">
                <thead><tr><th>Ítem</th><th>Descripción del trabajo</th><th>Costo unit. {priceLabel}</th><th>Precio venta {priceLabel}</th></tr></thead>
                  <tbody>
                    {laborRows.map((row, index) => (
                      <tr key={row.id}>
                        <td className="code-cell">{String(index + 1).padStart(2, '0')}</td>
                        <td><input className="labor-input labor-description-input" id={`proforma-labor-${index + 1}-description`} name={`laborDescription-${index + 1}`} value={row.description} onChange={(event) => updateLaborRow(row.id, { description: event.target.value })} placeholder="Describe el trabajo realizado" /></td>
                        <td><input className="labor-input" id={`proforma-labor-${index + 1}-cost`} name={`laborCost-${index + 1}`} type="number" min="0" step="1" value={row.costLocal ?? ''} onChange={(event) => updateLaborRow(row.id, { costLocal: parseNonNegativeNumber(event.target.value) })} placeholder="0" /></td>
                        <td><input className="labor-input" id={`proforma-labor-${index + 1}-price`} name={`laborPrice-${index + 1}`} type="number" min="0" step="1" value={row.salePriceLocal ?? ''} onChange={(event) => updateLaborRow(row.id, { salePriceLocal: parseNonNegativeNumber(event.target.value) })} placeholder={pricing ? formatProformaAmount(getDefaultLaborSalePrice(pricing, priceCurrency), priceCurrency) : '0'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="labor-total-row"><span>Total mano de obra</span><strong>{priceLabel} {formatProformaAmount(laborTotal, priceCurrency)}</strong></div>
            </section>
          </section>
        </div>

        <aside className="proforma-sidebar">
          <section className="total-card">
            <div className="eyebrow">RESUMEN</div>
            <span className="total-label">Total estimado</span>
            <strong>{priceLabel} {formatProformaAmount(total, priceCurrency)}</strong>
            <div className="total-breakdown"><span>Repuestos</span><b>{priceLabel} {formatProformaAmount(partsTotal, priceCurrency)}</b></div>
            <div className="total-breakdown"><span>Mano de obra</span><b>{priceLabel} {formatProformaAmount(laborTotal, priceCurrency)}</b></div>
            <button className="primary-button full-button" type="button" onClick={() => void saveDraft()} disabled={saving || !pricing || lines.some((line) => !line.part)}>{saving ? 'Guardando…' : savedProforma ? 'Actualizar proforma' : 'Guardar proforma'}</button>
          </section>

          {header.mode === 'contrato-abierto' ? (
            <section className="sales-card contract-summary-card">
              <div className="eyebrow">FUENTE CONTRACTUAL</div>
              <h2>{openContract ? 'Lista activa' : 'Lista pendiente'}</h2>
              <p>{openContract ? openContract.meta.fileName : 'Todavía no hay un contrato abierto guardado.'}</p>
              {openContract ? (
                <div className="contract-summary-lines">
                  <span><b>{numberFormat.format(openContract.items.length)}</b> líneas</span>
                  <span>Precio original: <b>{currencyLabel(openContract.meta.priceCurrency)}</b></span>
                  <span>Última carga: <b>{formatDate(openContract.meta.updatedAt)}</b></span>
                  {openContract.meta.sourceBatchId && openContract.meta.sourceFileId ? <a className="text-button" href={`/api/imports/${encodeURIComponent(openContract.meta.sourceBatchId)}/files/${encodeURIComponent(openContract.meta.sourceFileId)}`} download={openContract.meta.fileName}>Descargar original</a> : null}
                </div>
              ) : null}
              <button className="secondary-button full-button" type="button" onClick={() => setContractImportOpen(true)}>{openContract ? 'Reemplazar contrato' : 'Importar contrato'}</button>
            </section>
          ) : null}

          {header.mode === 'sin-contrato' ? (
            <section className="sales-card sales-catalog-summary-card">
              <div className="eyebrow">CATÁLOGOS DE PROFORMAS</div>
              <h2>{loadedSalesCatalogCount === 2 ? 'Planillas operativas' : 'Planillas opcionales'}</h2>
              <p>Se guardan en la SQLite compartida y se conservan sus archivos originales.</p>
              <div className="sales-catalog-summary-list">
                {(['consumibles', 'repuestos'] as const).map((kind) => {
                  const meta = salesCatalogs[kind]?.meta;
                  return (
                    <div key={kind}>
                      <strong>{kind === 'consumibles' ? 'Consumibles' : 'Repuestos'}</strong>
                      <span>{meta ? `${numberFormat.format(meta.rowCount)} registros · ${meta.fileName}` : 'Sin planilla específica cargada'}</span>
                    </div>
                  );
                })}
              </div>
              <button className="secondary-button full-button" type="button" onClick={() => setSalesCatalogImportOpen(true)}>Actualizar catálogos</button>
            </section>
          ) : null}

          <section className="sales-card history-card">
            <div className="eyebrow">HISTORIAL LOCAL</div>
            <h2>Proformas guardadas</h2>
            <div className="history-list">
              {history.map((item) => (
                <button className={`history-item ${savedProforma?.id === item.id ? 'active' : ''}`} key={item.id} type="button" onClick={() => void loadSaved(item.id)}>
                  <span><strong>{item.customerName || 'Sin cliente'}</strong><small>{item.reference || 'Sin referencia'} · {formatDate(item.issuedAt)}</small></span>
                  <b>{item.currency === 'USD' ? 'USD' : 'Gs.'} {formatProformaAmount(item.currency === 'USD' ? item.totalUsd : item.totalLocal, item.currency === 'USD' ? 'usd' : 'local')}</b>
                </button>
              ))}
              {history.length === 0 && <p className="empty-inline">Todavía no hay proformas guardadas.</p>}
            </div>
          </section>
        </aside>
      </section>
      <OpenContractImportPanel
        isOpen={contractImportOpen}
        meta={openContract?.meta ?? null}
        onClose={() => setContractImportOpen(false)}
        onImport={handleContractImport}
      />
      <SalesCatalogImportPanel
        isOpen={salesCatalogImportOpen}
        catalogs={salesCatalogs}
        onClose={() => setSalesCatalogImportOpen(false)}
        onImport={handleSalesCatalogImport}
      />
      <ServiceReportImportPanel
        isOpen={reportImportOpen}
        catalogItems={reportCatalogItems}
        catalogLoading={reportCatalogLoading}
        priceCurrency={priceCurrency}
        onClose={() => setReportImportOpen(false)}
        onApply={handleApplyServiceReport}
      />
    </div>
  );

  async function findPart(code: string): Promise<SalesPricePart | null> {
    const response = await fetch(`/api/sales/price-list?query=${encodeURIComponent(code)}`);
    const matches = await readJson<SalesPricePart[]>(response);
    return matches.find((item) => item.code.toUpperCase() === code.toUpperCase()) ?? matches[0] ?? null;
  }
}

function createHeader(): ProformaHeader {
  return {
    customerName: '',
    customerContact: '',
    serviceReport: '',
    serviceReportNumber: '',
    reference: '',
    issuedAt: new Date().toISOString(),
    attendedBy: '',
    modelName: '',
    serialNumber: '',
    mode: 'sin-contrato',
  };
}

function timeInputValue(value: string): string {
  return /T(\d{2}:\d{2})/.exec(value)?.[1] ?? '';
}

function createLaborRow(): DraftLaborLine {
  return { id: crypto.randomUUID(), description: '', costLocal: null, salePriceLocal: null };
}

function createLaborRows(count = PROFORMA_LABOR_ROWS): DraftLaborLine[] {
  return Array.from({ length: Math.max(0, count) }, createLaborRow);
}

/** Hay una proforma a medio armar que todavía no se guardó (cada edición limpia savedProforma). */
export function hasProformaDraft(saved: Proforma | null, header: ProformaHeader, lines: readonly unknown[], laborRows: readonly DraftLaborLine[]): boolean {
  if (saved) return false;
  const { customerName, customerContact, serviceReport, serviceReportNumber, reference, attendedBy, modelName, serialNumber } = header;
  return lines.length > 0
    || laborRows.some(isLaborRowUsed)
    || [customerName, customerContact, serviceReport, serviceReportNumber, reference, attendedBy, modelName, serialNumber].some((value) => value.trim() !== '');
}

function isLaborRowUsed(row: DraftLaborLine): boolean {
  return Boolean(row.description.trim()) || row.costLocal !== null || row.salePriceLocal !== null;
}

function getLaborSalePrice(row: DraftLaborLine, pricing: PricingSettings | null, currency: ContractPriceCurrency): number {
  return row.salePriceLocal ?? getDefaultLaborSalePrice(pricing, currency);
}

function getDefaultLaborSalePrice(pricing: PricingSettings | null, currency: ContractPriceCurrency): number {
  if (!pricing) return 0;
  return currency === 'usd' ? roundNumber(pricing.laborPrice / pricing.exchangeRate, 2) : pricing.laborPrice;
}

function getPartSalePrice(part: SalesPricePart | null, currency: ContractPriceCurrency): number {
  if (!part) return 0;
  return currency === 'usd' ? part.salePriceUsd : part.salePriceLocal;
}

function parseNonNegativeNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function draftLineToInput(line: DraftLine): ProformaLineInput {
  if (!line.part) {
    throw new Error(`La línea ${line.code || 'sin código'} todavía no fue encontrada en un catálogo.`);
  }

  if (line.source === 'contract') {
    const currency = line.part.fixedPriceCurrency ?? 'local';
    return {
      kind: 'part',
      source: 'contract',
      catalogKind: line.part.catalogKind ?? line.kind,
      code: line.part.code,
      description: line.part.description,
      ...sourceCatalogMetadata(line.part),
      unitPriceUsd: currency === 'usd' ? line.part.priceUsd : null,
      unitPriceLocal: currency === 'local' ? line.part.priceLocal : null,
      quantity: line.quantity,
    };
  }

  if (line.source === 'legacy') {
    return {
      kind: 'part',
      source: 'proformas',
      catalogKind: line.part.catalogKind ?? line.kind,
      code: line.part.code,
      description: line.part.description,
      ...sourceCatalogMetadata(line.part),
      unitPriceUsd: line.part.priceUsd,
      unitPriceLocal: line.part.priceLocal,
      quantity: line.quantity,
    };
  }

  return {
    kind: 'part',
    source: 'shared',
    partId: line.part.id,
    catalogKind: line.part.catalogKind,
    ...sourceCatalogMetadata(line.part),
    quantity: line.quantity,
  };
}

function sourceCatalogMetadata(part: SalesPricePart): Pick<ProformaLineInput, 'sourceStock' | 'sourceDiscontinuedStatus'> {
  if (part.origin === 'contract' || part.fixedPriceCurrency) return {};
  return {
    sourceStock: part.catalogStock !== undefined ? part.catalogStock : part.stock,
    sourceDiscontinuedStatus: part.discontinuedStatus ?? (part.discontinuedAt ? 'discontinued' : 'unknown'),
  };
}

function toContractSalesPart(
  item: OpenContractSnapshot['items'][number],
  currency: ContractPriceCurrency,
  pricing: PricingSettings,
): SalesPricePart {
  const salePriceLocal = item.priceLocal ?? roundGs100((item.priceUsd ?? 0) * pricing.exchangeRate);
  const salePriceUsd = item.priceUsd ?? roundNumber((item.priceLocal ?? 0) / pricing.exchangeRate, 4);
  return {
    id: item.id,
    brand: 'Contrato abierto',
    code: item.code,
    description: item.description,
    catalogKind: item.kind,
    models: [],
    stock: 0,
    priceUsd: item.priceUsd ?? 0,
    priceLocal: item.priceLocal ?? salePriceLocal,
    markup: 0,
    discontinuedAt: null,
    salePriceUsd,
    salePriceLocal,
    fixedPriceCurrency: currency,
    origin: 'contract',
  };
}

function toSalesCatalogPart(
  item: SalesCatalogSnapshot['items'][number],
  pricing: PricingSettings,
): SalesPricePart {
  const salePriceLocal = item.priceLocal ?? roundGs100((item.priceUsd ?? 0) * pricing.exchangeRate);
  const salePriceUsd = item.priceUsd ?? roundNumber((item.priceLocal ?? 0) / pricing.exchangeRate, 4);
  return {
    id: item.id,
    brand: `Proformas · ${item.kind === 'consumibles' ? 'Consumibles' : 'Repuestos'}`,
    code: item.code,
    description: item.description,
    catalogKind: item.kind,
    models: [],
    stock: item.stock ?? 0,
    priceUsd: item.priceUsd ?? salePriceUsd,
    priceLocal: item.priceLocal ?? salePriceLocal,
    markup: 0,
    discontinuedAt: null,
    salePriceUsd,
    salePriceLocal,
    origin: 'proformas',
    catalogStock: item.stock,
    discontinuedStatus: item.discontinued,
  };
}

function savedLineToPart(line: ProformaLine, source: DraftLine['source'], currency: Proforma['currency'] = 'PYG'): SalesPricePart {
  return {
    id: line.partId ?? line.id,
    brand: 'Canon',
    code: line.code,
    description: line.description,
    ...(line.catalogKind ? { catalogKind: line.catalogKind } : {}),
    models: [],
    stock: line.sourceStock ?? 0,
    priceUsd: line.unitPriceUsd ?? 0,
    priceLocal: line.unitPriceLocal ?? 0,
    markup: 0,
    discontinuedAt: null,
    salePriceUsd: line.unitPriceUsd ?? 0,
    salePriceLocal: line.unitPriceLocal ?? 0,
    origin: source === 'contract' ? 'contract' : source === 'legacy' ? 'proformas' : 'shared',
    ...(line.sourceStock !== undefined ? { catalogStock: line.sourceStock } : {}),
    ...(line.sourceDiscontinuedStatus ? { discontinuedStatus: line.sourceDiscontinuedStatus } : {}),
    ...(source === 'contract' ? { fixedPriceCurrency: currency === 'USD' ? 'usd' as const : 'local' as const } : {}),
  };
}

function draftSourceForPart(part: SalesPricePart): DraftLine['source'] {
  if (part.origin === 'contract' || part.fixedPriceCurrency) return 'contract';
  if (part.origin === 'proformas') return 'legacy';
  return 'catalog';
}

function partSourceLabel(part: SalesPricePart): string {
  if (part.origin === 'contract' || part.fixedPriceCurrency) return 'Contrato abierto · precio fijo';
  if (part.origin === 'proformas') {
    const status = part.discontinuedStatus === 'discontinued'
      ? 'discontinuado'
      : part.discontinuedStatus === 'active'
        ? 'activo'
        : 'estado no indicado';
    const stock = part.catalogStock === null || part.catalogStock === undefined
      ? 'stock no indicado'
      : `${numberFormat.format(part.catalogStock)} en stock`;
    return `${part.brand.replace('Proformas · ', 'Planilla ')} · ${status} · ${stock}`;
  }
  return 'Catálogo común';
}

function partStatusLabel(part: SalesPricePart, mode: ProformaHeader['mode']): string {
  if (mode === 'contrato-abierto' || part.fixedPriceCurrency) return 'Precio contractual';
  if (part.discontinuedStatus === 'discontinued' || part.discontinuedAt) return 'Discontinuado';
  if (part.discontinuedStatus === 'active') return 'Activo';
  return 'Estado no indicado';
}

function partStatusTone(part: SalesPricePart, mode: ProformaHeader['mode']): string {
  if (mode === 'contrato-abierto' || part.fixedPriceCurrency) return 'contract';
  if (part.discontinuedStatus === 'discontinued' || part.discontinuedAt) return 'warning';
  if (part.discontinuedStatus === 'active') return 'ok';
  return 'neutral';
}

function partStockLabel(part: SalesPricePart, mode: ProformaHeader['mode']): string {
  if (mode === 'contrato-abierto' || part.fixedPriceCurrency) return `Precio fijo en ${currencyLabel(part.fixedPriceCurrency ?? 'local')}`;
  const stock = part.catalogStock !== undefined ? part.catalogStock : part.stock;
  if (stock === null || stock === undefined) return 'Stock no indicado';
  return stock > 0 ? `${numberFormat.format(stock)} en stock` : 'Sin stock';
}

function linePartSourceLabel(part: SalesPricePart): string {
  if (part.origin === 'contract' || part.fixedPriceCurrency) return 'Contrato abierto';
  if (part.origin === 'proformas') return part.brand.replace('Proformas · ', 'Planilla ');
  return 'Catálogo común';
}

function mergeSearchResults(primary: readonly SalesPricePart[], secondary: readonly SalesPricePart[]): SalesPricePart[] {
  const results: SalesPricePart[] = [];
  const seenCodes = new Set<string>();
  for (const item of [...primary, ...secondary]) {
    const normalizedCode = normalizePartCode(item.code);
    if (!normalizedCode || seenCodes.has(normalizedCode)) continue;
    seenCodes.add(normalizedCode);
    results.push(item);
    if (results.length === 30) break;
  }
  return results;
}

function matchesPart(part: SalesPricePart, query: string): boolean {
  return normalizeSearchValue(`${part.code} ${part.description} ${part.models.join(' ')}`).includes(normalizeSearchValue(query));
}

function findExactPart(parts: readonly SalesPricePart[], code: string): SalesPricePart | undefined {
  const normalizedCode = normalizePartCode(code);
  return parts.find((part) => normalizePartCode(part.code) === normalizedCode);
}

function toSummary(proforma: Proforma): ProformaSummary {
  return {
    id: proforma.id,
    customerName: proforma.customerName,
    reference: proforma.reference,
    issuedAt: proforma.issuedAt,
    status: proforma.status,
    currency: proforma.currency,
    totalLocal: proforma.totalLocal,
    totalUsd: proforma.lines.reduce((total, line) => total + (line.unitPriceUsd ?? 0) * line.quantity, 0),
    updatedAt: proforma.updatedAt,
  };
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : dateFormat.format(date);
}

function normalizeSearchValue(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function currencyLabel(currency: ContractPriceCurrency): string {
  return currency === 'usd' ? 'USD' : 'Gs.';
}

function formatProformaAmount(value: number, currency: ContractPriceCurrency): string {
  return (currency === 'usd' ? usdNumberFormat : numberFormat).format(value);
}

function roundGs100(value: number): number {
  return Math.round(value / 100) * 100;
}

function roundNumber(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

