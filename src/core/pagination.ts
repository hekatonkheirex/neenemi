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
