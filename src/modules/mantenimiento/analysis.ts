import type { SourceDetail } from '../../core/source-details';

export type MaintenanceStatus = 'NORMAL' | 'ATENCIÓN' | 'CRÍTICO' | 'NO_RECONOCIDO';

export type MaintenanceModelRule = {
  id: string;
  modelLabel: string;
  usefulLife: number;
  optimalBase: number;
  maxWaste: number;
};

export type MaintenanceCounterRecord = {
  id: string;
  customerName: string;
  contractReference: string;
  modelLabel: string;
  serialNumber: string;
  period: string;
  paperType: string;
  copies: number;
  counter: number;
  maintenanceModelRuleId: string | null;
  sourceSheetName?: string;
  sourceRowNumber?: number;
  sourceDetails?: SourceDetail[];
};

export type MaintenancePeriodDetail = {
  period: string;
  paperType: string;
  copies: number;
  counter: number;
  appliedWaste: number;
  optimalMonthly: number;
  ratio: number;
  status: MaintenanceStatus;
  sourceSheetName?: string;
  sourceRowNumber?: number;
  sourceDetails?: SourceDetail[];
};

export type MaintenanceAnalysis = {
  serialNumber: string;
  modelLabel: string;
  customerName: string;
  contractReference: string;
  periods: MaintenancePeriodDetail[];
  averageCopies: number;
  matchedModelLabel: string | null;
  usefulLife: number;
  optimalBase: number;
  maxWaste: number;
  appliedWaste: number;
  optimalMonthly: number;
  ratio: number;
  status: MaintenanceStatus;
  recommendedAction: string;
  latestCounter: number;
  usefulLifePercent: number;
};

export function findMatchingRule(
  equipmentName: string,
  rules: readonly MaintenanceModelRule[],
): MaintenanceModelRule | null {
  if (!equipmentName) return null;

  const lower = equipmentName.toLowerCase().replace(/focop|fotocopiadora|impresora|canon|pantum|epson/gi, '').trim();
  const clean = lower.replace(/[^a-z0-9]/g, '');
  const includesRule = (rule: MaintenanceModelRule, value: string) => rule.modelLabel.toLowerCase().includes(value);
  const first = (predicate: (rule: MaintenanceModelRule) => boolean) => rules.find(predicate) ?? null;

  if (clean.includes('1435')) return first((rule) => includesRule(rule, '1435'));
  if (clean.includes('1643')) return first((rule) => includesRule(rule, '1643'));
  if (clean.includes('1730') || clean.includes('1740')) return first((rule) => includesRule(rule, '1730') || includesRule(rule, '1740'));

  if (clean.includes('4745') && (clean.includes('dx') || clean.includes('iradvdx'))) {
    const specific = first((rule) => includesRule(rule, 'dx 4745'));
    if (specific) return specific;
  }

  if (['400', '4245', '4535', '4551', '4745'].some((number) => clean.includes(number))) {
    if (clean.includes('4535i') || clean.includes('4551i')) {
      const specific = first((rule) => includesRule(rule, '4535i') || includesRule(rule, '4551i'));
      if (specific) return specific;
    }
    const family = first((rule) => ['400', '4245', '4535', '4551', '4745'].some((number) => includesRule(rule, number)));
    if (family) return family;
  }

  if (clean.includes('500') && !clean.includes('c5100') && !clean.includes('5100')) {
    const family = first((rule) => includesRule(rule, '500') && !includesRule(rule, '525') && !includesRule(rule, '527') && !includesRule(rule, '529'));
    if (family) return family;
  }

  if (clean.includes('525') || clean.includes('527') || clean.includes('529')) {
    const family = first((rule) => includesRule(rule, '525') || includesRule(rule, '527') || includesRule(rule, '529'));
    if (family) return family;
  }

  if (clean.includes('715') || clean.includes('717')) {
    const family = first((rule) => includesRule(rule, '715') || includesRule(rule, '717'));
    if (family) return family;
  }

  if (clean.includes('8295')) {
    const rule = first((candidate) => includesRule(candidate, '8295'));
    if (rule) return rule;
  }

  if (clean.includes('8795')) {
    const rule = first((candidate) => includesRule(candidate, '8795'));
    if (rule) return rule;
  }

  if (
    ['c3025', 'c3125', 'c3226', 'c3326', '3025', '3125', '3226', '3326'].some((number) => clean.includes(number)) &&
    (clean.includes('c') || clean.includes('irc'))
  ) {
    const family = first((rule) => ['c3025', 'c3125', 'c3226', 'c3326'].some((number) => includesRule(rule, number)));
    if (family) return family;
  }

  if (['c356', 'c3525', 'c3535', 'c3935', 'c5235', 'c5535', 'c5540', 'c5550', 'c5560'].some((number) => clean.includes(number))) {
    const family = first((rule) => ['c356', 'c3525', 'c3535', 'c3935', 'c5235', 'c5535', 'c5540', 'c5550', 'c5560'].some((number) => includesRule(rule, number)));
    if (family) return family;
  }

  if (clean.includes('c750') || clean.includes('750')) {
    const rule = first((candidate) => includesRule(candidate, 'c750'));
    if (rule) return rule;
  }

  if (clean.includes('c5840') || clean.includes('5840')) {
    const rule = first((candidate) => includesRule(candidate, 'c5840'));
    if (rule) return rule;
  }

  if (clean.includes('c1538') || clean.includes('1538')) {
    const rule = first((candidate) => includesRule(candidate, 'c1538') || includesRule(candidate, '1538'));
    if (rule) return rule;
  }

  if (clean.includes('253') || clean.includes('352') || clean.includes('1238')) {
    const rule = first((candidate) => includesRule(candidate, 'lbp253') || includesRule(candidate, 'lbp352') || includesRule(candidate, '1238'));
    if (rule) return rule;
  }

  if (clean.includes('2630') || clean.includes('617')) {
    const rule = first((candidate) => includesRule(candidate, '2630') || includesRule(candidate, '617'));
    if (rule) return rule;
  }

  if (clean.includes('if710') || (clean.includes('if') && clean.includes('710'))) {
    const rule = first((candidate) => includesRule(candidate, 'if 710'));
    if (rule) return rule;
  }

  if (clean.includes('ifc5100') || clean.includes('c5100')) {
    const rule = first((candidate) => includesRule(candidate, 'if c5100'));
    if (rule) return rule;
  }

  if (equipmentName.toLowerCase().includes('pantum')) {
    const rule = first((candidate) => candidate.modelLabel.toLowerCase().includes('pantum'));
    if (rule) return rule;
  }

  let bestRule: MaintenanceModelRule | null = null;
  let highestScore = 0;
  const inputNumbers = clean.match(/\d+/g) ?? [];
  for (const rule of rules) {
    const normalizedRule = rule.modelLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean === normalizedRule) return rule;

    let score = 0;
    if (clean.includes(normalizedRule) || normalizedRule.includes(clean)) score += 50;
    const ruleNumbers: string[] = rule.modelLabel.match(/\d+/g) ?? [];
    score += inputNumbers.filter((number) => ruleNumbers.includes(number)).length * 20;
    if (score > highestScore) {
      highestScore = score;
      bestRule = rule;
    }
  }

  return highestScore > 30 ? bestRule : null;
}

export function calcAppliedWaste(counter: number, usefulLife: number, maxWaste: number): number {
  if (!(counter > 0) || !Number.isFinite(counter)) return 0;
  return Math.min(maxWaste * (counter / usefulLife), maxWaste);
}

export function analyzeEquipmentCounters(
  records: readonly MaintenanceCounterRecord[],
  rules: readonly MaintenanceModelRule[],
  limitMonths = 3,
): MaintenanceAnalysis[] {
  const grouped = new Map<string, MaintenanceCounterRecord[]>();
  for (const record of records) {
    const key = `${record.serialNumber}::${record.modelLabel}`;
    const group = grouped.get(key) ?? [];
    group.push(record);
    grouped.set(key, group);
  }

  const analyses: MaintenanceAnalysis[] = [];
  for (const deviceRecords of grouped.values()) {
    const sortedRecords = [...deviceRecords].sort((left, right) => left.period.localeCompare(right.period));
    const targetRecords = sortedRecords.slice(-limitMonths);
    if (targetRecords.length === 0) continue;

    const latest = targetRecords[targetRecords.length - 1];
    const matched = findMatchingRule(latest.modelLabel, rules);
    const isUnrecognized = !matched;
    const usefulLife = matched?.usefulLife ?? 1_000_000;
    const optimalBase = matched?.optimalBase ?? 10_000;
    const maxWaste = matched?.maxWaste ?? 0.7;
    const periods = targetRecords.map((record) => {
      const appliedWaste = calcAppliedWaste(record.counter, usefulLife, maxWaste);
      const optimalMonthly = Math.round(optimalBase * (1 - appliedWaste));
      const ratio = optimalMonthly > 0 ? record.copies / optimalMonthly : 0;
      const wearRatio = maxWaste > 0 ? appliedWaste / maxWaste : 0;
      let status: MaintenanceStatus = 'NORMAL';
      if (isUnrecognized) status = 'NO_RECONOCIDO';
      else if (record.copies > optimalBase || wearRatio >= 1) status = 'CRÍTICO';
      else if (record.copies > optimalMonthly || wearRatio >= 0.8) status = 'ATENCIÓN';

      return {
        period: record.period,
        paperType: record.paperType,
        copies: record.copies,
        counter: record.counter,
        appliedWaste,
        optimalMonthly,
        ratio,
        status,
        sourceSheetName: record.sourceSheetName,
        sourceRowNumber: record.sourceRowNumber,
        sourceDetails: record.sourceDetails,
      };
    });

    const averageCopies = Math.round(periods.reduce((total, period) => total + period.copies, 0) / periods.length);
    const latestCounter = periods[periods.length - 1].counter;
    const appliedWaste = calcAppliedWaste(latestCounter, usefulLife, maxWaste);
    const optimalMonthly = Math.round(optimalBase * (1 - appliedWaste));
    const ratio = optimalMonthly > 0 ? averageCopies / optimalMonthly : 0;
    const wearRatio = maxWaste > 0 ? appliedWaste / maxWaste : 0;

    let status: MaintenanceStatus = 'NORMAL';
    let recommendedAction = 'Rendimiento óptimo. Continuar con monitoreo estándar de lecturas y mantenimiento regular por ciclo.';
    if (isUnrecognized) {
      status = 'NO_RECONOCIDO';
      recommendedAction = 'MODELO NO RECONOCIDO: registrar la regla de vida útil antes de calcular.';
    } else if (averageCopies > optimalBase || wearRatio >= 1) {
      status = 'CRÍTICO';
      recommendedAction = wearRatio >= 1
        ? 'CRÍTICO: la merma máxima fue alcanzada. Evaluar recambio o descarte del activo.'
        : 'CRÍTICO: el volumen superó la capacidad base recomendada. Planificar recambio o redistribución.';
    } else if (averageCopies > optimalMonthly || wearRatio >= 0.8) {
      status = 'ATENCIÓN';
      recommendedAction = wearRatio >= 0.8
        ? 'ATENCIÓN: el desgaste supera el 80% de la merma máxima. Programar mantenimiento integral.'
        : 'ATENCIÓN: el volumen promedio excede el óptimo mensual degradado. Inspeccionar el equipo.';
    }

    analyses.push({
      serialNumber: latest.serialNumber,
      modelLabel: latest.modelLabel,
      customerName: latest.customerName,
      contractReference: latest.contractReference,
      periods,
      averageCopies,
      matchedModelLabel: matched?.modelLabel ?? null,
      usefulLife,
      optimalBase,
      maxWaste,
      appliedWaste,
      optimalMonthly,
      ratio,
      status,
      recommendedAction,
      latestCounter,
      usefulLifePercent: latestCounter / usefulLife,
    });
  }

  return analyses.sort((left, right) => {
    const statusOrder: Record<MaintenanceStatus, number> = { 'CRÍTICO': 0, 'ATENCIÓN': 1, 'NO_RECONOCIDO': 2, NORMAL: 3 };
    return statusOrder[left.status] - statusOrder[right.status] || left.customerName.localeCompare(right.customerName) || left.serialNumber.localeCompare(right.serialNumber);
  });
}
