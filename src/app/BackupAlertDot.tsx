/**
 * Punto rojo de la barra lateral: entra con un resorte y un anillo se expande en cada latido. Las animaciones son CSS
 * (transform y opacity corren en el compositor): la versión con framer-motion repetía infinitamente desde JavaScript y,
 * con el aviso activo, mantenía ocupado el hilo principal incluso en reposo (~65 % del tiempo en Listado de precios).
 * Con "reducir movimiento" no hay anillo ni latido (ver .nav-alert-* en styles).
 */
export default function BackupAlertDot() {
  return (
    <span
      className="nav-alert"
      role="img"
      aria-label="Respaldo pendiente"
      title="Respaldo pendiente: abre Inicio para descargarlo"
    >
      <span className="nav-alert-ring" aria-hidden="true" />
      <span className="nav-alert-core" aria-hidden="true" />
    </span>
  );
}
