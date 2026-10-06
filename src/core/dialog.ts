// Clases compartidas de los <dialog> nativos de la suite (confirmación, paleta, historial): foco atrapado, Esc y fondo vienen del navegador.
// Sin "display" en la clase: un <dialog> cerrado debe seguir oculto.
export const dialogPanel =
  'm-auto max-h-[calc(100vh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-navy/15 bg-white p-0 text-navy shadow-md ' +
  'backdrop:bg-navy/50 backdrop:backdrop-blur-sm motion-reduce:backdrop:backdrop-blur-none ' +
  'dark:border-sky/25 dark:bg-panel dark:text-white dark:backdrop:bg-black/60';
