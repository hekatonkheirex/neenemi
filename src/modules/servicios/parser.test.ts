import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseServicesWorkbook } from './parser';

type XlsxCell = string | number | Date | undefined;

async function makeWorkbook(headers: XlsxCell[], rows: XlsxCell[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Servicios');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe('parseServicesWorkbook', () => {
  it('normalizes service rows from every worksheet using each sheet headers', async () => {
    const workbook = new ExcelJS.Workbook();
    const firstHeaders: XlsxCell[] = Array.from({ length: 10 }, (_, index) => `unused-${index}`);
    firstHeaders[0] = 'Nº I.S.';
    firstHeaders[4] = 'Fecha';
    firstHeaders[6] = 'Nº Serie';
    firstHeaders[7] = 'Equipo';
    const firstRow: XlsxCell[] = Array.from({ length: 10 }, () => undefined);
    firstRow[0] = 9011;
    firstRow[4] = new Date('2026-08-01');
    firstRow[6] = 'SER-SERVICE-011';
    firstRow[7] = 'iR ADV C3325i';
    const firstSheet = workbook.addWorksheet('Agosto');
    firstSheet.addRow(firstHeaders);
    firstSheet.addRow(firstRow);

    const secondHeaders: XlsxCell[] = Array.from({ length: 10 }, (_, index) => `other-${index}`);
    secondHeaders[2] = 'Nº I.S.';
    secondHeaders[3] = 'Nº Serie';
    secondHeaders[4] = 'Equipo';
    secondHeaders[5] = 'Fecha';
    const secondRow: XlsxCell[] = Array.from({ length: 10 }, () => undefined);
    secondRow[2] = 9012;
    secondRow[3] = 'SER-SERVICE-012';
    secondRow[4] = 'iR ADV C3325i';
    secondRow[5] = new Date('2026-09-01');
    const secondSheet = workbook.addWorksheet('Septiembre');
    secondSheet.addRow(secondHeaders);
    secondSheet.addRow(secondRow);

    const parsed = await parseServicesWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows.map((row) => [row.serviceNumber, row.serialNumber, row.recordedAt, row.sourceSheetName, row.sourceRowNumber])).toEqual([
      [9011, 'SER-SERVICE-011', '2026-08-01', 'Agosto', 2],
      [9012, 'SER-SERVICE-012', '2026-09-01', 'Septiembre', 2],
    ]);
  });

  it('resolves the current export columns by header and prefers the start date', async () => {
    const headers: XlsxCell[] = Array.from({ length: 31 }, (_, index) => `unused-${index}`);
    headers[1] = 'Nº I.S.';
    headers[4] = 'Cliente';
    headers[5] = 'Fecha';
    headers[6] = 'Nº OV';
    headers[7] = 'Nº Serie';
    headers[8] = 'Equipo';
    headers[16] = 'Tipo Servicio';
    headers[18] = 'Fch/Hora Inicio';
    headers[20] = 'Tipo Contrato';
    headers[21] = 'Tipo Tarea';
    headers[25] = 'Técnico';
    headers[29] = 'Tarea realizada';
    headers[30] = 'Repuestos utilizados';

    const row: XlsxCell[] = Array.from({ length: 31 }, () => undefined);
    row[1] = 9003;
    row[4] = 'Cliente LAM';
    row[5] = new Date('2026-06-02');
    row[6] = 'OV-SERVICE-001';
    row[7] = 'SER-SERVICE-001';
    row[8] = 'iR ADV C3325i';
    row[16] = 'En Sitio';
    row[18] = new Date('2026-06-01');
    row[20] = 'Alquiler';
    row[21] = 'Reparación';
    row[25] = 'Tec Uno';
    row[29] = 'Se reemplazó el fusor';
    row[30] = 'Fusor';

    const parsed = await parseServicesWorkbook(await makeWorkbook(headers, [row]));

    expect(parsed).toMatchObject({
      skippedOutOfScope: 0,
      rows: [expect.objectContaining({
        serviceNumber: 9003,
        orderReference: 'OV-SERVICE-001',
        recordedAt: '2026-06-01',
        month: '2026-06',
        serviceType: 'En Sitio',
        taskType: 'Reparación',
        sourceContractType: 'Alquiler',
        technician: 'Tec Uno',
        taskCompleted: 'Se reemplazó el fusor',
        partsUsed: 'Fusor',
        modelLabel: 'iR ADV C3325i',
        serialNumber: 'SER-SERVICE-001',
        sourceCustomerName: 'Cliente LAM',
        sourceDetails: expect.arrayContaining([
          { label: 'Nº I.S.', value: '9003' },
          { label: 'Cliente', value: 'Cliente LAM' },
          { label: 'Fecha', value: '2026-06-02T00:00:00.000Z' },
          { label: 'Nº OV', value: 'OV-SERVICE-001' },
          { label: 'Nº Serie', value: 'SER-SERVICE-001' },
          { label: 'Equipo', value: 'iR ADV C3325i' },
          { label: 'Tipo Servicio', value: 'En Sitio' },
          { label: 'Fch/Hora Inicio', value: '2026-06-01T00:00:00.000Z' },
          { label: 'Tipo Contrato', value: 'Alquiler' },
          { label: 'Tipo Tarea', value: 'Reparación' },
          { label: 'Tarea realizada', value: 'Se reemplazó el fusor' },
          { label: 'Repuestos utilizados', value: 'Fusor' },
        ]),
        family: 'GPR53',
        sourceSheetName: 'Servicios',
        sourceRowNumber: 2,
      })],
    });
  });

  it('skips equipment outside the supported families', async () => {
    const headers = Array.from({ length: 30 }, (_, index) => `header-${index}`);
    const row: XlsxCell[] = Array.from({ length: 30 }, () => undefined);
    row[0] = 9002;
    row[6] = 'SER-OUTSIDE';
    row[7] = 'iR 2530';

    const parsed = await parseServicesWorkbook(await makeWorkbook(headers, [row]));

    expect(parsed).toEqual({ rows: [], skippedOutOfScope: 1 });
  });

  it('keeps the operational columns from the LAM export', async () => {
    const headers: XlsxCell[] = Array.from({ length: 34 }, (_, index) => `unused-${index}`);
    headers[0] = 'Nº I.S.';
    headers[1] = 'División';
    headers[2] = 'Tipo de Recepción';
    headers[3] = 'Cliente';
    headers[4] = 'Fecha';
    headers[5] = 'Nº OV';
    headers[6] = 'Nº Serie';
    headers[7] = 'Equipo';
    headers[8] = 'T.Resp';
    headers[9] = 'Sucursal';
    headers[10] = 'H.Trab';
    headers[11] = 'Resp';
    headers[12] = 'T.Serv';
    headers[13] = 'Serv';
    headers[14] = 'Cierre';
    headers[15] = 'Tipo Servicio';
    headers[16] = 'Servicio Solicitado';
    headers[17] = 'Fch/Hora Inicio';
    headers[18] = 'Fch/Hora Fin';
    headers[19] = 'Tipo Contrato';
    headers[20] = 'Tipo Tarea';
    headers[21] = 'Estado';
    headers[22] = 'ES interior';
    headers[23] = 'Cerr Mob';
    headers[24] = 'Técnico';
    headers[25] = 'Es Retrab';
    headers[26] = 'Nº IS "viene"';
    headers[27] = 'Técnico "viene"';
    headers[28] = 'Tarea realizada';
    headers[29] = 'Repuestos utilizados';
    headers[30] = 'Ciudad Sucursal';
    headers[31] = 'Ciudad Cliente';
    headers[32] = 'Papeles';
    headers[33] = 'Contadores';
    const row: XlsxCell[] = Array.from({ length: 34 }, () => undefined);
    row[0] = 9010;
    row[1] = 'Central';
    row[2] = 'Correctivo';
    row[3] = 'Cliente LAM';
    row[4] = new Date('2026-07-01');
    row[5] = 'OV-LAM-010';
    row[6] = 'SER-LAM-010';
    row[7] = 'iR ADV C3325i';
    row[8] = '4h';
    row[9] = 'Sucursal Norte';
    row[10] = '2h';
    row[11] = 'Dentro SLA';
    row[12] = '1h';
    row[13] = 'Sí';
    row[14] = 'Cerrado';
    row[15] = 'En sitio';
    row[16] = 'Atasco de papel';
    row[17] = new Date('2026-07-01T08:00:00');
    row[18] = new Date('2026-07-01T10:00:00Z');
    row[19] = 'Mantenimiento';
    row[20] = 'Reparación';
    row[21] = 'Finalizado';
    row[22] = 'No';
    row[23] = 'Sí';
    row[24] = 'Tec Dos';
    row[25] = 'No';
    row[26] = 9009;
    row[27] = 'Tec Uno';
    row[28] = 'Se limpió el fusor';
    row[29] = 'Ninguno';
    row[30] = 'Asunción';
    row[31] = 'San Lorenzo';
    row[32] = 'Completos';
    row[33] = '12.345';

    const parsed = await parseServicesWorkbook(await makeWorkbook(headers, [row]));

    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      sourceOperational: {
        division: 'Central',
        receptionType: 'Correctivo',
        responseTime: '4h',
        branch: 'Sucursal Norte',
        workTime: '2h',
        responseCompliance: 'Dentro SLA',
        serviceTime: '1h',
        serviceCompliance: 'Sí',
        closed: 'Cerrado',
        requestedService: 'Atasco de papel',
        finishedAt: '2026-07-01T10:00:00.000Z',
        status: 'Finalizado',
        interior: 'No',
        mobileClosed: 'Sí',
        rework: 'No',
        previousServiceNumber: '9009',
        previousTechnician: 'Tec Uno',
        branchCity: 'Asunción',
        customerCity: 'San Lorenzo',
        papers: 'Completos',
        counters: '12.345',
      },
      sourceDetails: expect.arrayContaining([
        { label: 'División', value: 'Central' },
        { label: 'Tipo de recepción', value: 'Correctivo' },
        { label: 'T. Resp', value: '4h' },
        { label: 'Sucursal', value: 'Sucursal Norte' },
        { label: 'H. Trab', value: '2h' },
        { label: 'Resp', value: 'Dentro SLA' },
        { label: 'T. Serv', value: '1h' },
        { label: 'Serv', value: 'Sí' },
        { label: 'Cierre', value: 'Cerrado' },
        { label: 'Servicio solicitado', value: 'Atasco de papel' },
        { label: 'Fch/Hora Fin', value: '2026-07-01T10:00:00.000Z' },
        { label: 'Estado', value: 'Finalizado' },
        { label: 'ES interior', value: 'No' },
        { label: 'Cerr Mob', value: 'Sí' },
        { label: 'Es Retrab', value: 'No' },
        { label: 'Nº IS "viene"', value: '9009' },
        { label: 'Técnico "viene"', value: 'Tec Uno' },
        { label: 'Ciudad Sucursal', value: 'Asunción' },
        { label: 'Ciudad Cliente', value: 'San Lorenzo' },
        { label: 'Papeles', value: 'Completos' },
        { label: 'Contadores', value: '12.345' },
      ]),
    }));
  });

  it('recognizes common LAM header variants without losing the operational projection', async () => {
    const headers: XlsxCell[] = Array.from({ length: 34 }, (_, index) => `unused-${index}`);
    headers[0] = 'Nº de I.S.';
    headers[1] = 'Unidad de negocio';
    headers[2] = 'Recepción';
    headers[3] = 'Razón social';
    headers[4] = 'Fecha de servicio';
    headers[5] = 'Nº de O.V.';
    headers[6] = 'Nº de serie del equipo';
    headers[7] = 'Modelo del equipo';
    headers[8] = 'Tiempo de respuesta';
    headers[9] = 'Sede';
    headers[10] = 'Horas de trabajo';
    headers[11] = 'Cumple respuesta';
    headers[12] = 'Tiempo de servicio';
    headers[13] = 'Cumple servicio';
    headers[14] = 'Cerrado';
    headers[15] = 'Tipo de servicio';
    headers[16] = 'Solicitud de servicio';
    headers[17] = 'Fecha/Hora de inicio';
    headers[18] = 'Fecha/Hora de fin';
    headers[19] = 'Tipo de contrato';
    headers[20] = 'Tipo de tarea';
    headers[21] = 'Situación';
    headers[22] = 'Interior';
    headers[23] = 'Cierre móvil';
    headers[24] = 'Técnico responsable';
    headers[25] = 'Es retrabajo';
    headers[26] = 'Servicio anterior';
    headers[27] = 'Técnico anterior';
    headers[28] = 'Trabajo realizado';
    headers[29] = 'Piezas utilizadas';
    headers[30] = 'Ciudad sede';
    headers[31] = 'Localidad cliente';
    headers[32] = 'Documentación';
    headers[33] = 'Lecturas';
    const row: XlsxCell[] = Array.from({ length: 34 }, () => undefined);
    row[0] = 9014;
    row[1] = 'Central';
    row[2] = 'Correctivo';
    row[3] = 'Cliente variante';
    row[4] = new Date('2026-09-10');
    row[5] = 'OV-SERVICE-VARIANT-001';
    row[6] = 'SER-SERVICE-VARIANT-001';
    row[7] = 'iR ADV C3325i';
    row[8] = '4h';
    row[9] = 'Sucursal Norte';
    row[10] = '2h';
    row[11] = 'Dentro SLA';
    row[12] = '1h';
    row[13] = 'Sí';
    row[14] = 'Cerrado';
    row[15] = 'En sitio';
    row[16] = 'Atasco de papel';
    row[17] = new Date('2026-09-09T08:00:00');
    row[18] = new Date('2026-09-09T10:00:00');
    row[19] = 'Mantenimiento';
    row[20] = 'Reparación';
    row[21] = 'Finalizado';
    row[22] = 'No';
    row[23] = 'Sí';
    row[24] = 'Tec Variante';
    row[25] = 'No';
    row[26] = 9008;
    row[27] = 'Tec Anterior';
    row[28] = 'Se limpió el fusor';
    row[29] = 'Fusor';
    row[30] = 'Asunción';
    row[31] = 'San Lorenzo';
    row[32] = 'Completos';
    row[33] = '12.345';

    const parsed = await parseServicesWorkbook(await makeWorkbook(headers, [row]));

    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      serviceNumber: 9014,
      orderReference: 'OV-SERVICE-VARIANT-001',
      recordedAt: '2026-09-09',
      serviceType: 'En sitio',
      taskType: 'Reparación',
      technician: 'Tec Variante',
      taskCompleted: 'Se limpió el fusor',
      partsUsed: 'Fusor',
      sourceCustomerName: 'Cliente variante',
      sourceOperational: expect.objectContaining({
        division: 'Central',
        receptionType: 'Correctivo',
        responseTime: '4h',
        responseCompliance: 'Dentro SLA',
        serviceTime: '1h',
        serviceCompliance: 'Sí',
        branch: 'Sucursal Norte',
        previousServiceNumber: '9008',
        previousTechnician: 'Tec Anterior',
        customerCity: 'San Lorenzo',
        counters: '12.345',
      }),
    }));
  });

  it('detects the service header after introductory rows and keeps the original row number', async () => {
    const headers: XlsxCell[] = ['Nº I.S.', 'Cliente', 'Fecha', 'Nº OV', 'Nº Serie', 'Equipo'];
    const row: XlsxCell[] = [
      9013, 'Cliente cabecera', new Date('2026-08-12'), 'OV-HEADER-001',
      'SER-SERVICE-HEADER-001', 'iR ADV C3325i',
    ];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Agosto');
    sheet.addRow(['Servicios técnicos']);
    sheet.addRow(['Exportado desde el gestor legado']);
    sheet.addRow(headers);
    sheet.addRow(row);

    const parsed = await parseServicesWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));

    expect(parsed.rows).toEqual([expect.objectContaining({
      serviceNumber: 9013,
      orderReference: 'OV-HEADER-001',
      recordedAt: '2026-08-12',
      month: '2026-08',
      sourceCustomerName: 'Cliente cabecera',
      serialNumber: 'SER-SERVICE-HEADER-001',
      sourceSheetName: 'Agosto',
      sourceRowNumber: 4,
    })]);
  });
});
