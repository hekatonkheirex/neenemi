/**
 * Memoriza una función pura de texto. Las pantallas grandes (Discontinuador: ~10 mil equipos contra ~1,5 mil modelos;
 * Listado de precios: decenas de miles de ítems) normalizan las mismas cadenas miles de veces por filtrado. El tope evita
 * crecer sin límite: al llenarse se vacía y se vuelve a llenar con lo que se use.
 */
export function memoizeString<T>(compute: (key: string) => T, limit = 20_000): (key: string) => T {
  const cache = new Map<string, T>();
  return (key) => {
    if (cache.has(key)) return cache.get(key) as T;
    if (cache.size >= limit) cache.clear();
    const value = compute(key);
    cache.set(key, value);
    return value;
  };
}
