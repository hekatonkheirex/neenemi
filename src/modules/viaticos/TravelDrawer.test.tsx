import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TravelDrawer from './TravelDrawer';

describe('TravelDrawer', () => {
  it('es un diálogo con título enlazado, botón de cierre con nombre y el contenido dentro', () => {
    const markup = renderToStaticMarkup(
      <TravelDrawer eyebrow="NUEVO REGISTRO" title="Registrar viaje" onRequestClose={() => {}}><input name="cliente" /></TravelDrawer>,
    );
    expect(markup).toContain('<dialog');
    expect(markup).toContain('aria-labelledby="travel-drawer-title"');
    expect(markup).toContain('id="travel-drawer-title"');
    expect(markup).toContain('aria-label="Cerrar panel"');
    expect(markup).toContain('Registrar viaje');
    expect(markup).toContain('name="cliente"');
  });
});
