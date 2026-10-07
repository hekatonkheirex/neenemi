import { type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';

export type AnimatedTab<T extends string> = {
  id: T;
  label: string;
  /** Número de paso en mono ("01"). */
  step?: string;
  /** Contador en píldora. */
  count?: ReactNode;
  /** Icono en recuadro, como el de las tarjetas de módulos. */
  icon?: LucideIcon;
  /** Segunda línea bajo la etiqueta. */
  hint?: string;
};

type Props<T extends string> = {
  tabs: readonly AnimatedTab<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  /** Una sola fila con scroll horizontal en vez de envolver a varias filas. */
  scroll?: boolean;
};

type Box = { left: number; width: number };

/** scrollLeft que deja el botón centrado en la barra, sin pasar de los extremos (el navegador ya recorta al asignar, pero así el valor es verificable). */
export function centeredScrollLeft(nav: Box & { scrollLeft: number; scrollWidth: number }, button: Box): number {
  const target = nav.scrollLeft + (button.left - nav.left) - (nav.width - button.width) / 2;
  return Math.min(Math.max(target, 0), Math.max(nav.scrollWidth - nav.width, 0));
}

/** Los elementos que siguen a `self` dentro de su contenedor: el panel de la pestaña activa. */
export function followingSiblings<T>(children: readonly T[], self: T): T[] {
  const index = children.indexOf(self);
  return index < 0 ? [] : children.slice(index + 1);
}

/** Botones de navegación con feedback de pulsación e indicador activo compartido. */
export default function AnimatedTabs<T extends string>({ tabs, active, onChange, ariaLabel, scroll }: Props<T>) {
  const layoutId = useId();
  const still = useReducedMotion();
  const navRef = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    const nav = navRef.current;
    const button = nav?.querySelector<HTMLElement>('button.is-active');
    // Solo con scroll y no en el primer render: la barra nace en su posición, no se desliza.
    if (nav && button && scroll && mounted.current) {
      const n = nav.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      nav.scrollTo({ left: centeredScrollLeft({ left: n.left, width: n.width, scrollLeft: nav.scrollLeft, scrollWidth: nav.scrollWidth }, { left: b.left, width: b.width }), behavior: still ? 'auto' : 'smooth' });
    }
    // El panel de la pestaña son los hermanos que siguen a la barra: entran con un fundido corto (no en el primer render).
    if (nav && mounted.current && !still) {
      const panel = followingSiblings(Array.from(nav.parentElement?.children ?? []), nav);
      if (panel.length > 0) animate(panel as HTMLElement[], { opacity: [0, 1], y: [8, 0] }, { duration: 0.2, ease: 'easeOut' });
    }
    mounted.current = true;
  }, [active, scroll, still]);
  return (
    <nav ref={navRef} className={['anim-tabs', tabs.some((tab) => tab.hint) && 'has-hint', scroll && 'is-scroll'].filter(Boolean).join(' ')} aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <motion.button
          className={active === tab.id ? 'is-active' : ''}
          key={tab.id}
          type="button"
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
          whileHover={still ? undefined : { y: -1 }}
          whileTap={still ? undefined : { scale: 0.98, y: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        >
          {active === tab.id ? (
            <motion.span
              className="anim-tabs-indicator"
              layoutId={layoutId}
              aria-hidden="true"
              transition={still ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }}
            />
          ) : null}
          {tab.icon ? <span className="anim-tabs-icon" aria-hidden="true"><tab.icon size={15} /></span> : null}
          {tab.step ? <span>{tab.step}</span> : null}
          {tab.hint ? <span className="anim-tabs-text"><em>{tab.label}</em><small>{tab.hint}</small></span> : <em>{tab.label}</em>}
          {tab.count !== undefined ? <strong>{tab.count}</strong> : null}
        </motion.button>
      ))}
    </nav>
  );
}
