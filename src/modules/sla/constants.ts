import type { SlaReferenceSection } from './types';

export const SLA_REFERENCE_SECTIONS: readonly SlaReferenceSection[] = [
  {
    section: '3',
    title: 'Servicios ofrecidos',
    coverage: 'Mantenimiento correctivo y partes requeridas. Incluye tóner y cilindros; excluye expresamente el papel.',
  },
  {
    section: '5.2',
    title: 'Responsabilidades del cliente',
    coverage: 'El cliente reporta por canales oficiales, provee acceso remoto y activa el software de monitoreo de contadores.',
  },
  {
    section: '6',
    title: 'Horario y tiempos',
    coverage: 'Asistencia estándar 8x5. Fuera de horario: USD 60 + IVA por hora. Asunción: 10 horas de solución crítica; interior: 18 horas.',
  },
  {
    section: '6',
    title: 'Contadores y backup',
    coverage: 'Toma mensual por software cifrado, correo/WhatsApp o lectura in situ con costo adicional. Equipos de backup mediante cláusula móvil.',
  },
  {
    section: '7',
    title: 'Fuerza mayor',
    coverage: 'Incluye quiebre de stock y retrasos de proveedores, con aviso por correo dentro de cinco días hábiles.',
  },
  {
    section: '8',
    title: 'Confidencialidad',
    coverage: 'La información del cliente se usa exclusivamente para resolver incidencias y queda sujeta a estricta confidencialidad.',
  },
];

export const DEMO_SLA_TEXT = `
El cliente requiere atención técnica las 24 horas, incluyendo fines de semana y feriados nacionales.
Solicita suministro ilimitado de tóner, cilindros y resmas de papel.
En Asunción y Gran Asunción exige solución de incidentes críticos en un máximo de 4 horas hábiles.
Los incidentes deben reportarse por correo corporativo y mediante una mesa de ayuda dedicada.
Debe suministrarse un equipo de contingencia si el equipo principal demora más de 24 horas.
Las sucursales del interior del país, incluyendo CDE y Encarnación, deben resolverse en 12 horas hábiles.
El contratista tomará presencialmente los contadores físicos sin costo adicional.
Se debe firmar un acuerdo de confidencialidad y no divulgación de datos de usuarios.
`;

export const SLA_BASELINE_NOTE = 'El análisis local compara expresiones detectables del pliego con las cláusulas estándar de Data Systems S.A.E.C.A.';
