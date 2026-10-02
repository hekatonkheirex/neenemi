export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type PageRequest = {
  page: number;
  pageSize: number;
};

export function buildPaginatedUrl(
  path: string,
  baseQuery: string,
  request: PageRequest,
  filters: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams(baseQuery);
  params.set('page', String(request.page));
  params.set('pageSize', String(request.pageSize));
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return `${path}?${params.toString()}`;
}

/** Pagina una lista en memoria. La página se ajusta al rango válido (p. ej. tras borrar o filtrar). */
export function paginateItems<T>(items: readonly T[], page: number, pageSize: number): PaginatedResult<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.ceil(items.length / size);
  const current = Math.min(Math.max(1, Math.floor(page) || 1), Math.max(totalPages, 1));
  return {
    items: items.slice((current - 1) * size, current * size),
    total: items.length,
    page: current,
    pageSize: size,
    totalPages,
  };
}
