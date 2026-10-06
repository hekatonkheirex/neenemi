import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PaginationControls from './PaginationControls';
import { usePagedList } from './usePagedList';

function Probe({ items, size }: { items: readonly number[]; size: number }) {
  const paged = usePagedList(items, size);
  return <p data-total={paged.total} data-pages={paged.totalPages} data-page={paged.page}>{paged.items.join(',')}</p>;
}

describe('usePagedList', () => {
  it('muestra solo la primera página de una lista grande', () => {
    const markup = renderToStaticMarkup(<Probe items={Array.from({ length: 1000 }, (_, index) => index)} size={100} />);
    expect(markup).toContain('data-total="1000"');
    expect(markup).toContain('data-pages="10"');
    expect(markup).toContain('data-page="1"');
    expect(markup).toContain('>0,1,2,');
    expect(markup).toContain(',99<');
    expect(markup).not.toContain(',100');
  });

  it('una lista corta cabe en una sola página y una vacía no falla', () => {
    expect(renderToStaticMarkup(<Probe items={[1, 2, 3]} size={100} />)).toContain('data-pages="1"');
    expect(renderToStaticMarkup(<Probe items={[]} size={100} />)).toContain('data-pages="0"');
  });
});

describe('PaginationControls', () => {
  const base = { page: 1, pageSize: 100, total: 1000, onPageChange: () => undefined, onPageSizeChange: () => undefined };

  it('ofrece 25/50/100 por defecto y admite otras opciones', () => {
    const defaults = renderToStaticMarkup(<PaginationControls {...base} />);
    expect([...defaults.matchAll(/<option value="(\d+)"/g)].map((match) => match[1])).toEqual(['25', '50', '100']);
    const custom = renderToStaticMarkup(<PaginationControls {...base} pageSizeOptions={[50, 100, 250]} />);
    expect(custom).toContain('<option value="250">250</option>');
    expect(custom).not.toContain('<option value="25">');
  });

  it('muestra el rango y la página actual', () => {
    const markup = renderToStaticMarkup(<PaginationControls {...base} page={2} />);
    expect(markup).toContain('101–200 de 1.000');
    expect(markup).toContain('Página 2 de 10');
  });
});
