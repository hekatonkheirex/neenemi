import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import RouteMap, { project, unproject } from './RouteMap';
import type { Coordinate, RouteEvent, SiteReference, TravelLeg } from './types';

const event = (n: number, coordinate: Coordinate | null, kind: 'in' | 'out' = 'in'): RouteEvent => ({ key: `e${n}`, visitKey: `v${n}`, reportId: String(n), customer: 'Cliente', kind, timestamp: '2026-09-01T08:30:00', coordinate });
const asuncion = { latitude: -25.3, longitude: -57.6 };
const render = (props: Partial<Parameters<typeof RouteMap>[0]> = {}) => renderToStaticMarkup(
  <RouteMap events={[]} sites={[]} selectedVisit={null} candidate={null} editing={false} onPick={vi.fn()} onSelect={vi.fn()} {...props} />,
);

describe('project / unproject', () => {
  it('round-trips coordinates across hemispheres', () => {
    for (const c of [{ latitude: 0, longitude: 0 }, { latitude: 51.5, longitude: -0.12 }, { latitude: -33.9, longitude: 151.2 }, asuncion]) {
      const p = project(c);
      const back = unproject(p.x, p.y);
      expect(back.latitude).toBeCloseTo(c.latitude, 6);
      expect(back.longitude).toBeCloseTo(c.longitude, 6);
    }
  });
  it('clamps latitudes beyond the Web Mercator limit and y outside [0, 1]', () => {
    expect(project({ latitude: 90, longitude: 0 }).y).toBeCloseTo(0, 6);
    expect(project({ latitude: -90, longitude: 0 }).y).toBeCloseTo(1, 6);
    expect(unproject(0.5, -5).latitude).toBeCloseTo(85.0511, 3);
    expect(unproject(0.5, 5).latitude).toBeCloseTo(-85.0511, 3);
  });
});

describe('RouteMap rendering', () => {
  it('shows the empty-state notice and a tile layer at the default Asunción view', () => {
    const markup = render();
    expect(markup).toContain('No hay coordenadas de marcaciones en este día');
    expect(markup).toContain('https://tile.openstreetmap.org/12/');
    expect(markup).not.toContain('Usar centro del mapa');
  });
  it('labels pins in Spanish and numbers only located events consecutively', () => {
    const markup = render({ events: [event(1, asuncion), event(2, null), event(3, { latitude: -25.31, longitude: -57.61 }, 'out')] });
    expect(markup).toContain('1. Entrada I.S. 1, 08:30');
    expect(markup).toContain('2. Salida I.S. 3, 08:30');
    expect(markup).not.toContain('No hay coordenadas');
  });
  it('draws one polyline per contiguous run of located events', () => {
    const near = (d: number) => ({ latitude: -25.3 + d, longitude: -57.6 });
    const markup = render({ events: [event(1, near(0)), event(2, near(0.01)), event(3, null), event(4, near(0.02)), event(5, null), event(6, near(0.03)), event(7, near(0.04))] });
    expect(markup.match(/<polyline/g)).toHaveLength(2);
  });
  it('replaces any straight segment between consecutive events with its road geometry', () => {
    const near = (d: number) => ({ latitude: -25.3 + d, longitude: -57.6 });
    const events = [event(1, near(0), 'in'), event(1, near(0.01), 'out'), event(2, near(0.02), 'out')];
    const markup = render({ events, roadSegments: { 'e1>e1': [near(0), near(0.005), near(0.01)] } });
    expect(markup.match(/tracking-road-line/g)).toHaveLength(1);
    expect(markup.match(/tracking-route-line/g)).toHaveLength(1);
  });
  it('draws segments touching a suspect visit in red, along the road when there is one', () => {
    const near = (d: number) => ({ latitude: -25.3 + d, longitude: -57.6 });
    const events = [event(1, near(0), 'in'), event(2, near(0.1), 'in'), event(2, near(0.2), 'out')];
    const markup = render({ events, suspectVisitKeys: ['v2'], roadSegments: { 'e1>e2': [near(0), near(0.05), near(0.1)] } });
    expect(markup.match(/tracking-suspect-line/g)).toHaveLength(2);
    expect(markup).toContain(`points="${markup.match(/points="([^"]+)" class="tracking-suspect-line"/)![1]}"`);
    expect(markup).not.toContain('tracking-road-line');
  });
  it('marks the selected visit and renders confirmed sites and the candidate pin', () => {
    const site: SiteReference = { ...asuncion, key: 's', customer: 'Acme', branch: 'Centro', address: '', confirmedAt: 'now' };
    const markup = render({ events: [event(1, asuncion), event(2, asuncion)], selectedVisit: 'v2', sites: [site], candidate: asuncion });
    expect(markup.match(/tracking-event-pin in selected/g)).toHaveLength(1);
    expect(markup).toContain('tracking-candidate-pin');
    expect(markup).toContain('<title>Sede confirmada: Acme Centro</title>');
    expect(markup).toContain('<title>Cliente · I.S. 1 · 2026-09-01 08:30:00</title>');
  });
  it('offers center-as-site only in edit mode', () => {
    expect(render({ editing: true })).toContain('Usar centro del mapa como sede propuesta');
    expect(render({ editing: true })).toContain('is-editing');
  });
});
