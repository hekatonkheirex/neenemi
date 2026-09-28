const UTF8_DECODER = new TextDecoder('utf-8');

type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const MAX_UNCOMPRESSED_XML_BYTES = 25 * 1024 * 1024;

/**
 * Extracts the text-bearing parts of a DOCX without adding a ZIP/XML runtime
 * dependency to the desktop bundle. DOCX is a ZIP container and the relevant
 * WordprocessingML parts are plain XML after decompression.
 */
export async function extractDocxTextFromBytes(data: Uint8Array): Promise<string> {
  const entries = readZipEntries(data);
  const textEntries = entries
    .filter((entry) => /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/i.test(entry.name))
    .sort((left, right) => documentPartOrder(left.name) - documentPartOrder(right.name) || left.name.localeCompare(right.name));

  if (textEntries.length === 0) {
    throw new Error('El DOCX no contiene una parte de texto Word legible.');
  }

  const xmlParts: string[] = [];
  for (const entry of textEntries) {
    const xmlBytes = await readZipEntry(data, entry);
    xmlParts.push(UTF8_DECODER.decode(xmlBytes));
  }

  const text = xmlParts.map(xmlToText).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('El DOCX no contiene texto legible.');
  return text;
}

function readZipEntries(data: Uint8Array): ZipEntry[] {
  const endOffset = findEndOfCentralDirectory(data);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const centralDirectorySize = view.getUint32(endOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  if (centralDirectoryEnd > data.byteLength || centralDirectoryOffset < 0) {
    throw new Error('El DOCX tiene una tabla ZIP inválida.');
  }

  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;
  while (offset < centralDirectoryEnd && entries.length < entryCount) {
    if (readUint32(view, offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error('El DOCX tiene una entrada ZIP inválida.');
    }

    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const entryEnd = nameEnd + extraLength + commentLength;

    if (entryEnd > centralDirectoryEnd || nameEnd > data.byteLength) {
      throw new Error('El DOCX tiene una entrada ZIP truncada.');
    }

    entries.push({
      name: UTF8_DECODER.decode(data.slice(nameStart, nameEnd)),
      compressionMethod: view.getUint16(offset + 10, true),
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = entryEnd;
  }

  if (entries.length !== entryCount || offset !== centralDirectoryEnd) {
    throw new Error('El DOCX tiene una tabla ZIP incompleta.');
  }
  return entries;
}

function findEndOfCentralDirectory(data: Uint8Array): number {
  const minimumOffset = Math.max(0, data.byteLength - 65_557);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let offset = data.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (readUint32(view, offset) !== ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength <= data.byteLength) return offset;
  }
  throw new Error('El archivo seleccionado no es un DOCX ZIP válido.');
}

async function readZipEntry(data: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.uncompressedSize > MAX_UNCOMPRESSED_XML_BYTES) {
    throw new Error('La parte de texto del DOCX supera el límite de seguridad permitido.');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const localOffset = entry.localHeaderOffset;
  if (localOffset < 0 || localOffset + 30 > data.byteLength || readUint32(view, localOffset) !== ZIP_LOCAL_FILE_SIGNATURE) {
    throw new Error('El DOCX tiene una cabecera de archivo inválida.');
  }

  const fileNameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const contentStart = localOffset + 30 + fileNameLength + extraLength;
  const contentEnd = contentStart + entry.compressedSize;
  if (contentStart < 0 || contentEnd > data.byteLength) {
    throw new Error('El DOCX tiene una parte de texto truncada.');
  }

  const compressed = data.slice(contentStart, contentEnd);
  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod !== 8) {
    throw new Error('El DOCX usa una compresión no compatible para su texto.');
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este entorno no puede descomprimir el DOCX. Usa una versión actualizada de Electron.');
  }

  const copy = new ArrayBuffer(compressed.byteLength);
  new Uint8Array(copy).set(compressed);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const decompressed = new Uint8Array(await new Response(stream).arrayBuffer());
  if (decompressed.byteLength > MAX_UNCOMPRESSED_XML_BYTES) {
    throw new Error('La parte de texto descomprimida del DOCX supera el límite de seguridad permitido.');
  }
  return decompressed;
}

function xmlToText(xml: string): string {
  return xml
    .replace(/<w:(?:br|cr)\b[^>]*\/?>/gi, '\n')
    .replace(/<w:tab\b[^>]*\/?>/gi, '\t')
    .replace(/<\/w:p\s*>/gi, '\n')
    .replace(/<\/w:tr\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, decodeXmlEntity)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function decodeXmlEntity(_match: string, entity: string): string {
  const normalized = entity.toLowerCase();
  if (normalized === 'amp') return '&';
  if (normalized === 'lt') return '<';
  if (normalized === 'gt') return '>';
  if (normalized === 'quot') return '"';
  if (normalized === 'apos') return "'";
  const codePoint = normalized.startsWith('#x')
    ? Number.parseInt(normalized.slice(2), 16)
    : Number.parseInt(normalized.slice(1), 10);
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : '';
}

function documentPartOrder(name: string): number {
  if (/^word\/document\.xml$/i.test(name)) return 0;
  if (/^word\/header/i.test(name)) return 1;
  if (/^word\/footer/i.test(name)) return 2;
  if (/^word\/footnotes/i.test(name)) return 3;
  if (/^word\/endnotes/i.test(name)) return 4;
  return 5;
}

function readUint32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) return -1;
  return view.getUint32(offset, true);
}
