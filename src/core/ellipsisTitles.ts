/** Texto recortado con "…" sin forma de leerlo completo: al pasar el cursor, el elemento recibe como `title` su texto entero. */

type TruncatableLike = { scrollWidth: number; clientWidth: number; title: string; textContent: string | null };

/** Título a poner en el elemento, o null si no hace falta (no está recortado, ya tiene título o no tiene texto). */
export function titleForTruncated(el: TruncatableLike): string | null {
  if (el.title) return null;
  if (el.scrollWidth <= el.clientWidth + 1) return null;
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

const MAX_DEPTH = 4;

export function installEllipsisTitles(root: Document = document): () => void {
  const onOver = (event: Event) => {
    let el = event.target instanceof HTMLElement ? event.target : null;
    for (let depth = 0; el && depth < MAX_DEPTH; depth += 1, el = el.parentElement) {
      if (getComputedStyle(el).textOverflow !== 'ellipsis') continue;
      const title = titleForTruncated(el);
      if (title) el.title = title;
      return;
    }
  };
  root.addEventListener('mouseover', onOver, true);
  return () => root.removeEventListener('mouseover', onOver, true);
}
