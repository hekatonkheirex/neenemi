import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TravelRenditionsView } from './TravelViews';
import type { TravelTrip } from './types';

function makeTrip(index: number): TravelTrip {
  return {
    id: `trip-${index}`,
    recordedAt: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    serviceNumber: String(index),
    customerName: `Cliente ${index}`,
    destination: 'Asunción',
    transport: 'MOVIL PROPIO',
    technician: 'Técnico',
    driver: '',
    advance: 0, allowance: 0, lodging: 0, tolls: 0, otherCost: 0, vehiclePayment: 0, technicianPayment: 0,
    distanceKm: 0, fuelCost: 0, notes: '',
    totalCost: 1000 + index,
    status: 'pending',
    source: 'manual',
    sourceFileName: '', sourceSheetName: '', sourceRowNumber: 0, sourceBatchId: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  } as TravelTrip;
}

describe('Rendiciones: la bandeja se pagina', () => {
  const trips = Array.from({ length: 120 }, (_, index) => makeTrip(index + 1));
  const markup = renderToStaticMarkup(<TravelRenditionsView trips={trips} onEdit={() => {}} onStatusChange={() => {}} />);

  it('renderiza solo 50 filas de 120 y no las 120', () => {
    expect(markup.match(/<tr[ >]/g)?.length).toBe(50 + 1); // 50 viajes + la fila de encabezado
    expect(markup).toContain('Página 1 de 3');
    expect(markup).toContain('1–50 de 120');
    expect(markup).toContain('aria-label="Paginación de rendiciones"');
  });

  it('con pocos registros muestra todo y la página 1 de 1', () => {
    const few = renderToStaticMarkup(<TravelRenditionsView trips={trips.slice(0, 7)} onEdit={() => {}} onStatusChange={() => {}} />);
    expect(few.match(/<tr[ >]/g)?.length).toBe(7 + 1);
    expect(few).toContain('Página 1 de 1');
  });

  it('sin viajes no muestra el control de paginación', () => {
    const none = renderToStaticMarkup(<TravelRenditionsView trips={[]} onEdit={() => {}} onStatusChange={() => {}} />);
    expect(none).not.toContain('Paginación de rendiciones');
  });
});
