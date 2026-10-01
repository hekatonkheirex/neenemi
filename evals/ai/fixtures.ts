// Pliegos sintéticos (no son documentos de clientes) con la verdad esperada anotada a mano.
// `slaAnchors`: fragmentos que deben aparecer en algún requisito SLA devuelto (sin tildes ni mayúsculas).
// `features`: ids del catálogo de Software Selector (src/modules/software-selector/catalog.ts) que el pliego solicita sin ambigüedad.
export type EvalDocument = { id: string; text: string; slaAnchors: string[]; features: string[] };

export const EVAL_DOCUMENTS: EvalDocument[] = [
  {
    id: 'banco-central',
    text: `El oferente garantizará un tiempo de respuesta máximo de 4 horas hábiles ante fallas críticas. La disponibilidad mensual de los equipos será de 99,5%. Se aplicará una multa del 1% del canon mensual por cada hora de retraso. La solución debe incluir impresión segura con liberación mediante tarjeta RFID y reportes de costos de impresión por centro de costos.`,
    slaAnchors: ['4 horas', '99,5', 'multa'],
    features: ['secure_print_auth', 'cost_tracking'],
  },
  {
    id: 'ministerio-salud',
    text: `Tiempo de solución máximo: 24 horas corridas para incidentes de severidad alta. Se exige stock permanente de tóner y repuestos en sitio, con reposición en menos de 48 horas. Guardia técnica los sábados de 08:00 a 12:00. Se requiere digitalización con OCR en la nube y división automática de documentos, e inicio de sesión único con Microsoft 365 como proveedor de identidad.`,
    slaAnchors: ['24 horas', '48 horas', 'guardia'],
    features: ['cloud_ocr', 'sso_idp_integration'],
  },
  {
    id: 'universidad',
    text: `Respuesta en sitio dentro de 8 horas hábiles. Disponibilidad mínima del servicio de impresión de 98%. La plataforma permitirá impresión desde teléfonos y tabletas, impresión para invitados sin cuenta gestionada y límites presupuestarios con cuotas de impresión por usuario.`,
    slaAnchors: ['8 horas', '98%'],
    features: ['mobile_cloud_print', 'public_printing', 'budgeting'],
  },
  {
    id: 'municipalidad',
    text: `La contratista atenderá reclamos en un plazo de 2 horas para equipos de mesa de entrada. Penalidad de 0,5% del valor mensual por cada día de indisponibilidad superior a 3 días. Se solicita escaneo hacia SharePoint y OneDrive, escaneo hacia carpetas compartidas de servidores locales e impresión directa desde Chromebooks.`,
    slaAnchors: ['2 horas', 'penalidad', '3 dias'],
    features: ['scan_cloud_destinations', 'scan_local_dms', 'chromebook_print'],
  },
  {
    id: 'aseguradora',
    text: `Tiempo máximo de respuesta de 6 horas y de solución de 12 horas para fallas que detengan la operación. Disponibilidad anual del 99%. La solución debe mantener la liberación local de impresiones ante la caída del enlace WAN, sincronizar usuarios y grupos con Active Directory y funcionar sin servidores locales, 100% en la nube.`,
    slaAnchors: ['6 horas', '12 horas', '99%'],
    features: ['remote_resilience_rps', 'ad_integration', 'serverless_no_infra'],
  },
  {
    id: 'hospital',
    text: `Atención en sitio en 3 horas para áreas de urgencias, las 24 horas, todos los días. Reemplazo temporal del equipo en 24 horas si la reparación excede ese plazo. Se solicita liberar trabajos con tarjeta de proximidad, poder retirarlos en cualquier impresora de la red y operar los equipos multifunción sin contacto físico.`,
    slaAnchors: ['3 horas', 'reemplazo', '24 horas'],
    features: ['secure_print_auth', 'print_anywhere', 'touchless_mfp'],
  },
  {
    id: 'colegio',
    text: `Mantenimiento preventivo trimestral obligatorio. Respuesta ante fallas dentro de 1 día hábil. La contratante podrá rescindir el contrato si la disponibilidad cae por debajo de 95% durante dos meses consecutivos. Se piden informes de costo por departamento, actualización remota de firmware y avisos por correo de tóner bajo y atascos.`,
    slaAnchors: ['trimestral', '1 dia', '95%'],
    features: ['cost_tracking', 'firmware_remote_update', 'device_status_alerts'],
  },
  {
    id: 'financiera',
    text: `Tiempo de respuesta de 4 horas en casa matriz y de 8 horas en sucursales del interior. Multa de 2% del canon por incumplimiento reiterado del plazo de solución de 48 horas. Inicio de sesión único con Okta, operación en un entorno Zero Trust sin puertos de entrada abiertos y transmisión por conexiones TLS exclusivamente salientes.`,
    slaAnchors: ['4 horas', '8 horas', '48 horas', 'multa'],
    features: ['sso_idp_integration', 'zero_trust', 'secure_data_transmission'],
  },
  {
    id: 'empresa-energia',
    text: `Disponibilidad de 99,9% medida mensualmente sobre el servicio de impresión. Ventana de mantenimiento programado fuera del horario laboral. Stock mínimo de consumibles para 30 días en depósito del oferente. Lectura automática de contadores de los equipos, consola unificada para equipos de múltiples fabricantes y alertas proactivas al proveedor de servicio antes de una interrupción.`,
    slaAnchors: ['99,9', 'stock', '30 dias'],
    features: ['meter_capture_auto', 'central_device_management', 'proactive_service_monitoring'],
  },
  {
    id: 'poder-judicial',
    text: `Respuesta en 2 horas hábiles y solución en 8 horas hábiles para equipos de despacho. Guardia técnica permanente durante audiencias. Penalidad de 1% del monto mensual por cada incumplimiento. Se requiere control de acceso por roles a las funciones de los equipos, acceso remoto a las pantallas de los dispositivos para la mesa de ayuda y distribución remota de configuraciones y agendas de direcciones.`,
    slaAnchors: ['2 horas', '8 horas', 'guardia', 'penalidad'],
    features: ['rbac_access_policies', 'remote_helpdesk', 'device_settings_distribution'],
  },
];
