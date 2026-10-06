import { Button } from '../core/ui/button';
import type { Theme } from './theme';

type TopbarProps = { label: string; theme: Theme; onOpenPalette: () => void; onToggleTheme: () => void };

// ponytail: <span> sin color propio en .app-shell hereda el gris del CSS heredado (tema claro); por eso el texto va en <div>/<kbd>/<strong>.
export default function Topbar({ label, theme, onOpenPalette, onToggleTheme }: TopbarProps) {
  const next = theme === 'light' ? 'oscuro' : 'claro';
  return (
    // "topbar" se conserva: los estilos de impresión ocultan .content > .topbar y el CSS heredado le da la posición y el borde.
    <header className="topbar">
      <div className="breadcrumb">DCSS Suite / {label}</div>
      <div className="topbar-actions">
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={onOpenPalette}
          aria-keyshortcuts="Control+K Meta+K"
          title="Ir a un módulo (Ctrl/⌘ K)"
        >
          Ir a…
          <kbd className="rounded-md border border-current/30 px-1.5 py-0.5 font-sans text-[0.65rem] opacity-80">Ctrl K</kbd>
        </Button>
        <button
          type="button"
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label={`Cambiar a modo ${next}`}
          title={`Cambiar a modo ${next}`}
          onClick={onToggleTheme}
          className="inline-flex h-8 items-center gap-2 rounded-full border border-navy/20 bg-white px-2.5 text-xs font-bold text-navy transition-colors hover:bg-sky/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky dark:border-sky/30 dark:bg-transparent dark:text-white dark:hover:bg-sky/15"
        >
          <div aria-hidden="true" className="relative h-4 w-8 rounded-full bg-navy/15 dark:bg-white/25">
            <div className="absolute left-0.5 top-0.5 size-3 rounded-full bg-brand transition-transform duration-150 motion-reduce:transition-none dark:translate-x-4 dark:bg-sky" />
          </div>
          <strong className="font-bold">{theme === 'light' ? 'Claro' : 'Oscuro'}</strong>
        </button>
      </div>
    </header>
  );
}
