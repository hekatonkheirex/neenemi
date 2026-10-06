import { useState } from 'react';
import { paginateItems, type PaginatedResult } from './pagination';

export type PagedList<T> = PaginatedResult<T> & {
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
};

/**
 * Pagina en memoria una lista grande para no pintar miles de filas a la vez (Listado de precios llegaba a ~103 mil nodos).
 * Vuelve a la página 1 cuando cambia la lista (otro filtro o búsqueda) y ajusta la página al rango válido.
 */
export function usePagedList<T>(items: readonly T[], initialPageSize: number): PagedList<T> {
  const [state, setState] = useState({ source: items, page: 1, pageSize: initialPageSize });
  let { page } = state;
  if (state.source !== items) {
    // Derivar estado durante el render (patrón de React): evita un render intermedio con la página vieja.
    page = 1;
    setState({ source: items, page: 1, pageSize: state.pageSize });
  }
  const result = paginateItems(items, page, state.pageSize);
  return {
    ...result,
    setPage: (next) => setState((current) => ({ ...current, page: next })),
    setPageSize: (next) => setState((current) => ({ ...current, page: 1, pageSize: next })),
  };
}
