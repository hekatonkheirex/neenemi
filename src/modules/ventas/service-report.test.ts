import { describe, expect, it } from 'vitest';
import type { SalesPricePart } from './types';
import {
  extractPdfTextFromBytes,
  findServiceReportCatalogMatches,
  mergeReportDateTime,
  parseServiceReportText,
} from './service-report';

const REPORT_TEXT = `
Informe de Servicio Fecha/Hora: 07/09/2026 16:58 N°: 2921689
Cliente: N E X O SAECA - Judiciales Dir/Tel: Guido Spano 3050 c/Concejal varga / /
Observ.: María Auxiliadora Aguilera | Departamento Judicial
Servicio Solicitado / Descripción del Problema / Descripción del Equipo VERIFICACION DE EQUIPO
Equipo: FOTOCOPIADORA / Marca:CANON / Modelo:IRADV 500iF Situación:
Nro Serie: QLL00749- Recibido Matias Sebastián Hoppe Delgado
Tecnico(s): Diego Miguel Martinez Ojeda Area: Fotocopiadoras
Tarea realizada Verificacion de equipo, el mismo requiere del cambio de la unidad de cilindro, unidad reveladora, engranaje del fusor y mantenimiento preventivo. Contadores Papel Contador
Repuestos Utilizados T. Traslado
Contacto : Nombre y Apellido María Auxiliadora Data Systems S.A.E.C.A.
`;

function makeSalesPricePart(id: string, code: string, description: string, models: string[] = []): SalesPricePart {
  return {
    id,
    brand: 'Canon',
    code,
    description,
    models,
    stock: 0,
    priceUsd: 0,
    priceLocal: 0,
    markup: 0,
    discontinuedAt: null,
    salePriceUsd: 0,
    salePriceLocal: 0,
  };
}

describe('parseServiceReportText', () => {
  it('extrae los campos principales del informe de servicio', () => {
    const report = parseServiceReportText(REPORT_TEXT);

    expect(report.header).toMatchObject({
      customerName: 'NEXO SAECA - Judiciales',
      customerContact: 'María Auxiliadora',
      serviceReportNumber: '2921689',
      attendedBy: 'Diego Miguel Martinez Ojeda',
      modelName: 'IRADV 500iF',
      serialNumber: 'QLL00749-',
    });
    expect(report.reportDate).toBe('2026-09-07');
    expect(report.reportTime).toBe('16:58');
    expect(report.taskDescription).toContain('unidad de cilindro');
    expect(report.problemDescription).toBe('VERIFICACION DE EQUIPO');
  });
});

describe('mergeReportDateTime', () => {
  it('traslada fecha y hora del informe al valor de emisión de la proforma', () => {
    expect(mergeReportDateTime('2026-09-17T10:30:00.000Z', '2026-09-07', '16:58'))
      .toBe('2026-09-07T16:58:00.000Z');
    expect(mergeReportDateTime('2026-09-17T10:30:00.000Z', '2026-09-07', ''))
      .toBe('2026-09-07T10:30:00.000Z');
  });
});

describe('findServiceReportCatalogMatches', () => {
  it('prioriza las partes que coinciden con la tarea y el modelo', () => {
    const report = parseServiceReportText(REPORT_TEXT);
    const matches = findServiceReportCatalogMatches(report, [
      makeSalesPricePart('cylinder', '0488C003BA', 'CILINDRO GPR-55 IR ADV 500iF'),
      makeSalesPricePart('developer', 'FM4-1234', 'UNIDAD REVELADORA IRADV 500iF'),
      makeSalesPricePart('toner', 'CEXV-55', 'TONER NEGRO'),
    ]);

    expect(matches.map((match) => match.item.id)).toEqual(expect.arrayContaining(['developer', 'cylinder']));
    expect(matches).toHaveLength(2);
    expect(matches.every((match) => match.reason.length > 0)).toBe(true);
  });
});

describe('extractPdfTextFromBytes', () => {
  it('lee texto de un stream PDF sin compresión', async () => {
    const content = 'BT\n(Cliente: ACME) Tj\nET\n';
    const pdf = `%PDF-1.4\n1 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n%%EOF`;

    await expect(extractPdfTextFromBytes(new TextEncoder().encode(pdf))).resolves.toBe('Cliente: ACME');
  });
});
