import { useId, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';

export type AnimatedTab<T extends string> = {
  id: T;
  label: string;
  /** Número de paso en mono ("01"). */
  step?: string;
  /** Contador en píldora. */
  count?: ReactNode;
  /** Icono en recuadro, como el de las tarjetas de módulos. */
  icon?: IconSvgElement;
  /** Segunda línea bajo la etiqueta. */
  hint?: string;
};

type Props<T extends string> = {
  tabs: readonly AnimatedTab<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
};

/** Botones de navegación con feedback de pulsación e indicador activo compartido. */
export default function AnimatedTabs<T extends string>({ tabs, active, onChange, ariaLabel }: Props<T>) {
  const layoutId = useId();
  const still = useReducedMotion();
  return (
    <nav className={tabs.some((tab) => tab.hint) ? 'anim-tabs has-hint' : 'anim-tabs'} aria-label={ariaLabel}>
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
          {tab.icon ? <span className="anim-tabs-icon" aria-hidden="true"><HugeiconsIcon icon={tab.icon} size={15} /></span> : null}
          {tab.step ? <span>{tab.step}</span> : null}
          {tab.hint ? <span className="anim-tabs-text"><em>{tab.label}</em><small>{tab.hint}</small></span> : <em>{tab.label}</em>}
          {tab.count !== undefined ? <strong>{tab.count}</strong> : null}
        </motion.button>
      ))}
    </nav>
  );
}
