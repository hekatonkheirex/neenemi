import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { extractDocxTextFromBytes } from './document-text';

describe('extractDocxTextFromBytes', () => {
  it('extracts paragraphs, tabs and XML entities from a compressed DOCX entry', async () => {
    const documentXml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:body><w:p><w:r><w:t>Cliente &amp; proyecto</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Horario</w:t><w:tab/><w:t>8:00 a 17:00</w:t></w:r></w:p>',
      '</w:body></w:document>',
    ].join('');
    const bytes = makeZip([{ name: 'word/document.xml', content: deflateRawSync(Buffer.from(documentXml)), method: 8, uncompressedSize: Buffer.byteLength(documentXml) }]);

    await expect(extractDocxTextFromBytes(bytes)).resolves.toBe('Cliente & proyecto\nHorario\t8:00 a 17:00');
  });

  it('rejects a ZIP without Word text parts', async () => {
    const bytes = makeZip([{ name: 'word/styles.xml', content: new Uint8Array(), method: 0, uncompressedSize: 0 }]);

    await expect(extractDocxTextFromBytes(bytes)).rejects.toThrow('no contiene una parte de texto');
  });
});

type TestZipEntry = {
  name: string;
  content: Uint8Array;
  method: number;
  uncompressedSize: number;
};

function makeZip(entries: readonly TestZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(8, entry.method, true);
    localView.setUint16(26, name.length, true);
    localHeader.set(name, 30);
    localParts.push(localHeader, entry.content);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(10, entry.method, true);
    centralView.setUint32(20, entry.content.byteLength, true);
    centralView.setUint32(24, entry.uncompressedSize, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.byteLength + entry.content.byteLength;
  }

  const centralDirectory = concat(centralParts);
  const localDirectory = concat(localParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.byteLength, true);
  endView.setUint32(16, localDirectory.byteLength, true);
  return concat([localDirectory, centralDirectory, end]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}
