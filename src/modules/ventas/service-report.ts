import type { ProformaHeader, SalesPricePart } from './types';

export interface ParsedServiceReport {
  fileName: string;
  sourceText: string;
  header: Partial<Pick<ProformaHeader, 'customerName' | 'customerContact' | 'serviceReportNumber' | 'reference' | 'attendedBy' | 'modelName' | 'serialNumber'>>;
  reportDate: string;
  reportTime: string;
  model: string;
  problemDescription: string;
  taskDescription: string;
  usedPartsDescription: string;
  suggestionText: string;
}

export interface ServiceReportCatalogMatch {
  item: SalesPricePart;
  score: number;
  reason: string;
  explicit: boolean;
}

const PDF_SYNTAX_DECODER = new TextDecoder('latin1');
const PDF_TEXT_DECODER = new TextDecoder('windows-1252');

interface PdfTextFragment {
  text: string;
  x: number;
  y: number;
  streamOrder: number;
  order: number;
}

function decodePdfLiteralString(value: string): string {
  const content = value.slice(1, -1);
  let decoded = '';

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character !== '\\') {
      decoded += character;
      continue;
    }

    const next = content[index + 1];
    if (!next) break;

    if (/[0-7]/.test(next)) {
      let octal = next;
      index += 1;
      while (octal.length < 3 && /[0-7]/.test(content[index + 1] ?? '')) {
        octal += content[index + 1];
        index += 1;
      }
      decoded += String.fromCharCode(Number.parseInt(octal, 8));
      continue;
    }

    const escapedCharacters: Record<string, string> = {
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      '(': '(',
      ')': ')',
      '\\': '\\',
    };
    if (next === '\r' && content[index + 2] === '\n') {
      index += 2;
      continue;
    }
    if (next === '\n' || next === '\r') {
      index += 1;
      continue;
    }
    decoded += escapedCharacters[next] ?? next;
    index += 1;
  }

  return decoded;
}

function extractTextFragments(content: string, streamOrder: number): PdfTextFragment[] {
  const fragments: PdfTextFragment[] = [];
  const number = '-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
  const textOperator = new RegExp(
    `(${number})\\s+(${number})\\s+(${number})\\s+(${number})\\s+(${number})\\s+(${number})\\s+Tm\\b|(\\((?:\\\\[\\s\\S]|[^\\\\()])*\\))\\s*Tj\\b|(\\[(?:\\\\[\\s\\S]|[^\\]])*\\])\\s*TJ\\b`,
    'g',
  );
  const literalString = /\((?:\\[\s\S]|[^\\()])*\)/g;
  let x = 0;
  let y = 0;
  let order = 0;
  let match: RegExpExecArray | null;

  while ((match = textOperator.exec(content)) !== null) {
    if (match[1] !== undefined) {
      x = Number(match[5]);
      y = Number(match[6]);
      continue;
    }

    const text = match[7]
      ? decodePdfLiteralString(match[7])
      : (match[8]?.match(literalString) ?? []).map(decodePdfLiteralString).join('');
    if (text.trim()) fragments.push({ text, x, y, streamOrder, order: order++ });
  }

  return fragments;
}

async function inflatePdfStream(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador no puede descomprimir el PDF. Usa una versión actualizada de Chrome o Edge.');
  }

  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  const compressed = new Blob([copy]);
  const decompressed = compressed.stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(decompressed).arrayBuffer());
}

async function extractPdfTextFragmentsFromBytes(data: Uint8Array): Promise<PdfTextFragment[]> {
  const syntax = PDF_SYNTAX_DECODER.decode(data);
  const objectPattern = /([0-9]+)\s+([0-9]+)\s+obj\b/g;
  const fragments: PdfTextFragment[] = [];
  let streamOrder = 0;
  let objectMatch: RegExpExecArray | null;

  while ((objectMatch = objectPattern.exec(syntax)) !== null) {
    const bodyStart = objectMatch.index + objectMatch[0].length;
    const objectEnd = syntax.indexOf('endobj', bodyStart);
    if (objectEnd === -1) break;

    const body = syntax.slice(bodyStart, objectEnd);
    const streamMatch = /\bstream\r?\n/.exec(body);
    if (!streamMatch) continue;

    const dictionary = body.slice(0, streamMatch.index);
    const streamStart = bodyStart + streamMatch.index + streamMatch[0].length;
    const lengthMatch = /\/Length\s+([0-9]+)/.exec(dictionary);
    const declaredLength = lengthMatch ? Number(lengthMatch[1]) : Number.NaN;
    const fallbackEnd = syntax.indexOf('endstream', streamStart);
    const streamEnd = Number.isFinite(declaredLength) && streamStart + declaredLength <= data.length
      ? streamStart + declaredLength
      : fallbackEnd;

    if (streamEnd <= streamStart || streamEnd === -1) continue;

    try {
      let streamData = data.slice(streamStart, streamEnd);
      if (dictionary.includes('/FlateDecode')) {
        streamData = await inflatePdfStream(streamData);
      } else if (dictionary.includes('/Filter')) {
        continue;
      }

      const content = PDF_TEXT_DECODER.decode(streamData);
      if (/\bBT\b/.test(content) && /\bT[Jj]\b/.test(content)) {
        fragments.push(...extractTextFragments(content, streamOrder));
      }
    } catch {
      // Otros streams del PDF pueden ser imágenes o perfiles de color.
    }

    streamOrder += 1;
  }

  return fragments;
}

function renderVisualLines(fragments: PdfTextFragment[]): string[] {
  const sorted = [...fragments].sort(
    (left, right) => right.y - left.y || left.x - right.x || left.streamOrder - right.streamOrder || left.order - right.order,
  );
  const lines: Array<{ y: number; fragments: PdfTextFragment[] }> = [];

  for (const fragment of sorted) {
    const currentLine = lines.at(-1);
    if (currentLine && Math.abs(currentLine.y - fragment.y) <= 1.5) {
      currentLine.fragments.push(fragment);
    } else {
      lines.push({ y: fragment.y, fragments: [fragment] });
    }
  }

  return lines
    .map((line) => line.fragments
      .sort((left, right) => left.x - right.x || left.order - right.order)
      .map((fragment) => fragment.text.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' '))
    .filter(Boolean)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function renderVisualText(fragments: PdfTextFragment[]): string {
  return renderVisualLines(fragments).join(' ').replace(/\s+/g, ' ').trim();
}

function extractTaskDescriptionFromFragments(fragments: PdfTextFragment[]): string {
  const normalized = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  const taskHeading = fragments.find((fragment) => normalized(fragment.text) === 'tarea realizada');
  const partsHeading = fragments.find((fragment) => normalized(fragment.text) === 'repuestos utilizados');
  if (!taskHeading || !partsHeading) return '';

  return renderVisualText(fragments.filter((fragment) => (
    fragment.x < 466
    && fragment.y < taskHeading.y
    && fragment.y > partsHeading.y
  )));
}

export async function extractPdfTextFromBytes(data: Uint8Array): Promise<string> {
  return renderVisualText(await extractPdfTextFragmentsFromBytes(data));
}

export async function extractPdfTextLinesFromBytes(data: Uint8Array): Promise<string[]> {
  return renderVisualLines(await extractPdfTextFragmentsFromBytes(data));
}

function cleanValue(value: string | undefined): string {
  return (value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\|$/, '')
    .trim();
}

function capture(text: string, pattern: RegExp): string {
  return cleanValue(pattern.exec(text)?.[1]);
}

function collapseSpacedAcronyms(value: string): string {
  return value.replace(/\b(?:[A-ZÁÉÍÓÚÑ]\s+){2,}[A-ZÁÉÍÓÚÑ]\b/g, (acronym) => acronym.replace(/\s+/g, ''));
}

function toDateInputValue(value: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return '';
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

export function mergeReportDateTime(issuedAt: string, reportDate: string, reportTime: string): string {
  if (!reportDate && !reportTime) return issuedAt;

  const currentDate = /^(\d{4}-\d{2}-\d{2})/.exec(issuedAt)?.[1] ?? '';
  const currentTime = /T(\d{2}:\d{2})/.exec(issuedAt)?.[1] ?? '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(reportDate) ? reportDate : currentDate;
  const time = /^\d{2}:\d{2}$/.test(reportTime) ? reportTime : currentTime;

  if (!date || !time) return issuedAt;
  return `${date}T${time}:00.000Z`;
}

export function parseServiceReportText(text: string, fileName = 'Informe de Servicio.pdf'): ParsedServiceReport {
  const normalized = text.replace(/[\u0000\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
  const dateTime = /Fecha\s*\/\s*Hora\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})/i.exec(normalized);
  const client = collapseSpacedAcronyms(capture(normalized, /\bCliente\s*:\s*(.*?)\s+(?=Dir\s*\/\s*Tel\s*:)/i));
  const contact = capture(normalized, /\bContacto\s*:\s*Nombre\s+y\s+Apellido\s+(.*?)\s+Data\s+Systems\b/i);
  const reportNumber = capture(normalized, /\bN\s*[°º]\s*:\s*([A-Z0-9-]+)/i) || capture(normalized, /\bN(?:ro)?\.?\s*:\s*([A-Z0-9-]+)/i);
  const model = capture(normalized, /\bModelo\s*:\s*(.*?)\s+Situaci[oó]n\s*:/i) || capture(normalized, /\bModelo\s*:\s*(.*?)\s+Nro\s+Serie\s*:/i);
  const serial = capture(normalized, /\bNro\s+Serie\s*:\s*(.*?)\s+Recibido\b/i);
  const technician = capture(normalized, /\bTecnico(?:\(s\))?\s*:\s*(.*?)\s+Area\s*:/i);
  const problemDescription = capture(
    normalized,
    /\bServicio\s+Solicitado\s*\/\s*Descripci[oó]n\s+del\s+Problema\s*\/\s*Descripci[oó]n\s+del\s+Equipo\s+(.*?)\s+\bEquipo\s*:/i,
  );
  const taskDescription = capture(normalized, /\bTarea\s+realizada\s+(.*?)\s+\bContadores\b/i)
    || capture(normalized, /\bTarea\s+realizada\s+(.*?)\s+\bRepuestos\s+Utilizados\b/i);
  const usedPartsDescription = capture(normalized, /\bRepuestos\s+Utilizados\s*(.*?)\s+T\.\s*Traslado\b/i);

  const header: ParsedServiceReport['header'] = {};
  if (client) header.customerName = client;
  if (contact) header.customerContact = contact;
  if (reportNumber) header.serviceReportNumber = reportNumber;
  if (technician) header.attendedBy = technician;
  if (model) header.modelName = model;
  if (serial) header.serialNumber = serial;

  const reportDate = dateTime ? toDateInputValue(dateTime[1]) : '';
  const reportTime = dateTime ? dateTime[2].padStart(5, '0') : '';
  const suggestionText = [problemDescription, taskDescription, usedPartsDescription].filter(Boolean).join(' ');
  if (Object.keys(header).length === 0 && !suggestionText) {
    throw new Error('No se reconocieron campos de un informe de servicio en el PDF seleccionado.');
  }

  return {
    fileName,
    sourceText: normalized,
    header,
    reportDate,
    reportTime,
    model,
    problemDescription,
    taskDescription,
    usedPartsDescription,
    suggestionText,
  };
}

export async function parseServiceReportFile(file: File): Promise<ParsedServiceReport> {
  const fragments = await extractPdfTextFragmentsFromBytes(new Uint8Array(await file.arrayBuffer()));
  const text = renderVisualText(fragments);
  if (!text) {
    throw new Error('El PDF no contiene una capa de texto legible. Los informes escaneados como imagen todavía no se pueden extraer automáticamente.');
  }
  const report = parseServiceReportText(text, file.name);
  const taskDescription = extractTaskDescriptionFromFragments(fragments) || report.taskDescription;
  if (taskDescription === report.taskDescription) return report;

  return {
    ...report,
    taskDescription,
    suggestionText: [report.problemDescription, taskDescription, report.usedPartsDescription].filter(Boolean).join(' '),
  };
}

const MATCH_STOP_WORDS = new Set([
  'a', 'al', 'area', 'algunos', 'algunas', 'con', 'contadores', 'cambio', 'cambiar', 'como', 'de', 'del', 'descrip',
  'descripcion', 'diagnostico', 'el', 'en', 'equipo', 'esta', 'este', 'la', 'las', 'lo', 'los', 'mantenimiento', 'mismo',
  'necesita', 'para', 'preventivo', 'problema', 'que', 'realizada', 'requiere', 'se', 'servicio', 'su', 'tarea', 'una', 'unidad',
  'verificacion', 'y',
]);

function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/[^a-z0-9]/g, '');
}

function searchTokens(value: string): string[] {
  return normalizeSearchText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !MATCH_STOP_WORDS.has(token));
}

export function findServiceReportCatalogMatches(report: ParsedServiceReport, items: SalesPricePart[]): ServiceReportCatalogMatch[] {
  const requestedTokens = [...new Set(searchTokens(report.suggestionText))];
  const modelCompact = compactSearchText(report.model);
  const sourceCompact = compactSearchText(report.sourceText);
  const matches: ServiceReportCatalogMatch[] = [];

  for (const item of items) {
    const candidateText = `${item.code} ${item.description} ${item.models.join(' ')}`;
    const candidateTokens = new Set(searchTokens(candidateText));
    const candidateCompact = compactSearchText(candidateText);
    const explicitCode = compactSearchText(item.code);
    const explicit = explicitCode.length >= 5 && sourceCompact.includes(explicitCode);
    const matchedTerms: string[] = [];
    let score = explicit ? 1000 : 0;

    for (const token of requestedTokens) {
      if (candidateTokens.has(token) || candidateCompact.includes(token)) {
        matchedTerms.push(token);
        score += token.length >= 7 ? 3 : 2;
      }
    }

    const modelMatched = modelCompact.length >= 4 && candidateCompact.includes(modelCompact);
    if (modelMatched) score += 5;

    if (!explicit && score < 2) continue;

    const reasons = explicit ? ['Código indicado en el informe'] : [];
    if (matchedTerms.length > 0) reasons.push(`coincide con ${matchedTerms.slice(0, 4).join(', ')}`);
    if (modelMatched) reasons.push(`modelo ${report.model}`);

    matches.push({
      item,
      score,
      reason: reasons.join(' · '),
      explicit,
    });
  }

  return matches
    .sort((left, right) => right.score - left.score || left.item.code.localeCompare(right.item.code))
    .slice(0, 12);
}
