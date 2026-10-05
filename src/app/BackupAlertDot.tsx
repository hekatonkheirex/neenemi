import { motion, useReducedMotion } from 'framer-motion';

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
          animate={{ scale: [1, 2.8], opacity: [0.6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <motion.span
        className="nav-alert-core"
        aria-hidden="true"
        animate={still ? undefined : { scale: [1, 1.18, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.span>
  );
}
