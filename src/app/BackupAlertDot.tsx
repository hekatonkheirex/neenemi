import { motion, useReducedMotion } from 'framer-motion';

/** Un latido: el núcleo crece, el anillo se expande hasta desvanecerse y queda un reposo antes del siguiente. Ambos comparten el período para no desfasarse. */
const PERIOD = 2.4;

/** Punto rojo de la barra lateral: entra con un resorte y emite un anillo que se expande. */
export default function BackupAlertDot() {
  const still = useReducedMotion();
  return (
    <motion.span
      className="nav-alert"
      role="img"
      aria-label="Respaldo pendiente"
      title="Respaldo pendiente: abre Inicio para descargarlo"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 18 }}
    >
      {still ? null : (
        <motion.span
          className="nav-alert-ring"
          aria-hidden="true"
          animate={{ scale: [1, 2.8, 2.8], opacity: [0.55, 0, 0] }}
          transition={{ duration: PERIOD, times: [0, 0.65, 1], ease: 'easeOut', repeat: Infinity }}
        />
      )}
      <motion.span
        className="nav-alert-core"
        aria-hidden="true"
        animate={still ? undefined : { scale: [1, 1.2, 1, 1] }}
        transition={{ duration: PERIOD, times: [0, 0.2, 0.5, 1], ease: 'easeInOut', repeat: Infinity }}
      />
    </motion.span>
  );
}
