import type { SlaAnalysis, SlaComplianceItem, SlaRisk, SlaStatus } from './types';

type SlaRule = Omit<SlaComplianceItem, 'clientSource'> & {
  keywords: readonly string[];
  match: 'any' | 'all';
};

const SLA_RULES: readonly SlaRule[] = [
  {
    id: 'support-24x7',
    category: 'Horario',
    keywords: ['24x7', '24/7', '24 horas', 'fines de semana'],
    match: 'any',
    clientRequirement: 'Atención técnica extendida las 24 horas, incluyendo fines de semana y feriados.',
    ourPosition: 'El SLA estándar es 8x5, de lunes a viernes de 08:00 a 17:30. La atención 24x7 requiere una cláusula móvil y coordinación de guardia.',
    ourSource: 'SLA §6',
    status: 'partial',
    advice: 'Cotizar la cláusula móvil 24x7 y aclarar la tarifa fuera del horario estándar.',
  },
  {
    id: 'paper-supply',
    category: 'Insumos',
    keywords: ['papel', 'resmas'],
    match: 'any',
    clientRequirement: 'Suministro ilimitado de tóner, cilindros y papel para garantizar la continuidad operativa.',
    ourPosition: 'El servicio incluye tóner y cilindros, pero excluye expresamente el papel.',
    ourSource: 'SLA §3',
    status: 'gap',
    advice: 'Presentar una aclaración formal que excluya el papel de los consumibles incluidos.',
  },
  {
    id: 'critical-asuncion',
    category: 'Tiempos / Asunción',
    keywords: ['4 horas', 'asuncion'],
    match: 'all',
    clientRequirement: 'Solución de incidentes críticos en Asunción y Gran Asunción dentro de 4 horas hábiles.',
    ourPosition: 'El tiempo estándar de solución crítica en Asunción y Gran Asunción es de 10 horas hábiles.',
    ourSource: 'SLA §6',
    status: 'gap',
    advice: 'Negociar el plazo estándar de 10 horas o cotizar un nivel premium de atención.',
  },
  {
    id: 'official-channels',
    category: 'Canales',
    keywords: ['correo', 'mesa de ayuda', 'telefono', 'reportar incidentes'],
    match: 'any',
    clientRequirement: 'Reporte de incidentes mediante correo corporativo y atención telefónica de mesa de ayuda.',
    ourPosition: 'El SLA acepta portal, correo, teléfono y WhatsApp corporativos como canales oficiales de reporte.',
    ourSource: 'SLA §5.2',
    status: 'complies',
    advice: 'Incluir únicamente los canales oficiales de Data Systems en el contrato.',
  },
  {
    id: 'backup-equipment',
    category: 'Back up',
    keywords: ['backup', 'contingencia', 'equipo de respaldo', 'respaldo'],
    match: 'any',
    clientRequirement: 'Equipo de contingencia de características similares cuando la reparación demore más de 24 horas.',
    ourPosition: 'El SLA contempla equipos de backup mediante una cláusula móvil con control mensual de contadores.',
    ourSource: 'SLA §6',
    status: 'complies',
    advice: 'Aceptar el requerimiento y asignar contractualmente el equipo de backup.',
  },
  {
    id: 'interior-response',
    category: 'Interior',
    keywords: ['interior', '12 horas'],
    match: 'all',
    clientRequirement: 'Solución de fallas críticas en sucursales del interior dentro de 12 horas hábiles.',
    ourPosition: 'Para el interior del país, el SLA estándar prevé 18 horas hábiles de solución crítica.',
    ourSource: 'SLA §6',
    status: 'gap',
    advice: 'Negociar 18 horas hábiles por restricciones logísticas o cotizar una cobertura especial.',
  },
  {
    id: 'meter-reading',
    category: 'Contadores',
    keywords: ['contadores', 'lectura', 'presencial', 'in situ'],
    match: 'any',
    clientRequirement: 'Lectura presencial de contadores físicos sin costo adicional.',
    ourPosition: 'La toma mensual preferida es remota o por correo/WhatsApp. La lectura in situ tiene un costo adicional por locación.',
    ourSource: 'SLA §6',
    status: 'partial',
    advice: 'Exigir el software cifrado de monitoreo o aclarar el costo de las lecturas presenciales.',
  },
  {
    id: 'confidentiality',
    category: 'Confidencialidad',
    keywords: ['confidencialidad', 'no divulgacion', 'nda', 'datos de usuarios'],
    match: 'any',
    clientRequirement: 'Acuerdo específico de confidencialidad y no divulgación de datos de usuarios.',
    ourPosition: 'El SLA limita el uso de la información del cliente a la resolución de incidencias y exige estricta confidencialidad.',
    ourSource: 'SLA §8',
    status: 'complies',
    advice: 'Firmar el NDA acordado y mantener la limitación de uso de la información.',
  },
];

const STATUS_WEIGHT: Record<SlaStatus, number> = {
  complies: 100,
  partial: 50,
  gap: 0,
  na: 0,
};

export function stripSlaAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalize(value: string): string {
  return stripSlaAccents(value.toLowerCase());
}

function getRisk(gaps: number, partial: number, matched: number): SlaRisk {
  if (matched === 0) return 'medium';
  if (gaps >= 3) return 'critical';
  if (gaps > 0) return 'high';
  if (partial > 0) return 'medium';
  return 'low';
}

function makeFallbackItem(fileName: string): SlaComplianceItem {
  return {
    id: 'manual-review',
    category: 'Revisión manual',
    clientRequirement: 'No se detectaron cláusulas comparables en el texto recibido.',
    clientSource: fileName,
    ourPosition: 'El SLA de referencia está disponible por secciones 3, 5.2, 6, 7 y 8 para revisión manual.',
    ourSource: 'SLA de referencia',
    status: 'na',
    advice: 'Revisar el documento o pegar un fragmento que contenga horarios, consumibles, contadores, backup o confidencialidad.',
  };
}

export function analyzeSlaRequirements(textExcerpt: string, fileName = 'pliego.txt'): SlaAnalysis {
  const text = textExcerpt.trim().slice(0, 250_000);
  const content = normalize(text);
  const items: SlaComplianceItem[] = [];

  for (const rule of SLA_RULES) {
    const matchedKeywords = rule.keywords.filter((keyword) => content.includes(normalize(keyword)));
    const matched = rule.match === 'all'
      ? matchedKeywords.length === rule.keywords.length
      : matchedKeywords.length > 0;
    if (!matched) continue;
    items.push({
      id: rule.id,
      category: rule.category,
      clientRequirement: rule.clientRequirement,
      clientSource: `${fileName} · coincidencia: ${matchedKeywords.join(', ')}`,
      ourPosition: rule.ourPosition,
      ourSource: rule.ourSource,
      status: rule.status,
      advice: rule.advice,
    });
  }

  const usedFallback = items.length === 0;
  const finalItems = usedFallback ? [makeFallbackItem(fileName)] : items;
  const gaps = finalItems.filter((item) => item.status === 'gap').length;
  const partial = finalItems.filter((item) => item.status === 'partial').length;
  const score = usedFallback
    ? 0
    : Math.round(finalItems.reduce((total, item) => total + STATUS_WEIGHT[item.status], 0) / finalItems.length);
  const risk = getRisk(gaps, partial, usedFallback ? 0 : finalItems.length);
  const criticalGaps = finalItems
    .filter((item) => item.status === 'gap')
    .map((item) => `${item.clientRequirement} ${item.ourPosition}`);

  return {
    fileName: fileName.trim() || 'pliego.txt',
    textExcerpt: text,
    source: 'reglas locales',
    usedFallback,
    analyzedAt: new Date().toISOString(),
    overallRisk: risk,
    complianceScore: score,
    summary: usedFallback
      ? 'No se encontraron cláusulas suficientes para calcular una compatibilidad automática. La matriz queda lista para revisión manual.'
      : `Se compararon ${finalItems.length} requisitos detectables contra el SLA estándar. El análisis encontró ${gaps} brechas y ${partial} condiciones parciales que requieren revisión comercial o legal.`,
    items: finalItems,
    criticalGaps,
    recommendations: finalItems
      .filter((item) => item.status !== 'complies' && item.status !== 'na')
      .map((item) => item.advice),
    negotiationPoints: finalItems
      .filter((item) => item.status === 'gap' || item.status === 'partial')
      .map((item) => `Negociar el alcance de ${item.category.toLowerCase()} según ${item.ourSource}.`),
  };
}
