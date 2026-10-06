import { memoizeString } from '../../core/memoize';
import type { ModelDiscontinuationRecord } from './repository';

const modelVoltageAnnotationPattern = /\s*\(\s*\d{2,6}(?:-\d{2,6})?\s*V\s*\)\s*$/i;
const modelVoltagePattern = /\b\d{2,6}(?:-\d{2,6})?\s*V\b/g;
const modelFrequencyPattern = /\b\d{2,6}HZ\b/g;
const imageRunnerAdvancePattern = /IMAGE\s*RUNNER\s*ADVANCE?/g;
const imageRunnerPattern = /IMAGE\s*RUNNER/g;
const imageRunnerShortPattern = /I\s*-?\s*R\s*-?\s*ADV/g;
const imageRunnerCanonPattern = /\bIRC(?=\s*\d)/g;
const equipmentNamePattern = /\b(?:CANON|IMPRESORA|FOTOCOPIADORA|MULTIFUNCIONAL|COPIADORA|PRINTER|LASER|DIGITAL|SCANNER|ESCANER)\b/g;
const stockNoisePattern = /\b(?:SISTEMA|SER|USED|USADO|USADA|USADOS|USADAS|SR|LTN)\b/g;
const modelCodePattern = /(?:IRADV|IR|IMAGEPRESS|VARIOPRINT|PLOTWAVE|COLORWAVE|LBP|MF|PIXMA|MAXIFY)?[A-Z]*\d{3,5}[A-Z0-9]*/;

export function findModelSupport(modelLabel: string, items: readonly ModelDiscontinuationRecord[]): ModelDiscontinuationRecord | undefined {
  let best: ModelDiscontinuationRecord | undefined;
  let bestScore = 0;
  for (const item of items) {
    const score = modelMatchScore(modelLabel, item.modelLabel);
    if (score > bestScore || (score === bestScore && best && item.modelLabel.length > best.modelLabel.length)) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

export function createModelSupportLookup(
  modelLabels: readonly string[],
  items: readonly ModelDiscontinuationRecord[],
): ReadonlyMap<string, ModelDiscontinuationRecord | undefined> {
  const lookup = new Map<string, ModelDiscontinuationRecord | undefined>();
  for (const modelLabel of new Set(modelLabels)) {
    lookup.set(modelLabel, findModelSupport(modelLabel, items));
  }
  return lookup;
}

export function modelMatchScore(left: string, right: string): number {
  let bestScore = 0;
  for (const leftKey of modelAliases(left)) {
    for (const rightKey of modelAliases(right)) {
      if (!leftKey || !rightKey) continue;
      if (leftKey === rightKey) {
        bestScore = Math.max(bestScore, 3);
      } else if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) {
        bestScore = Math.max(bestScore, 2);
      } else {
        const leftCode = modelCode(leftKey);
        const rightCode = modelCode(rightKey);
        if (leftCode && rightCode && leftCode === rightCode) bestScore = Math.max(bestScore, 1);
      }
    }
  }
  return bestScore;
}

// findModelSupport compara cada modelo de la cartera con todo el catálogo (~1 M de pares): sin memoria repetía la
// normalización por regex de ambos lados en cada par (~10 s de ventana congelada en Discontinuador).
const modelCode = memoizeString((key) => key.match(modelCodePattern)?.[0]);

export function comparableModelKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(modelVoltageAnnotationPattern, ' ')
    .toUpperCase()
    .replace(imageRunnerAdvancePattern, 'IR ADV ')
    .replace(imageRunnerPattern, 'IR ')
    .replace(imageRunnerShortPattern, 'IR ADV ')
    .replace(imageRunnerCanonPattern, 'IR ADV C')
    .replace(equipmentNamePattern, ' ')
    .replace(modelVoltagePattern, (voltage, offset: number, label: string) =>
      modelCodePattern.test(label.slice(0, offset)) ? ' ' : voltage)
    .replace(modelFrequencyPattern, ' ')
    .replace(stockNoisePattern, ' ')
    .replace(/[^A-Z0-9]+/g, '');
}

const modelAliases = memoizeString((value) => {
  const key = comparableModelKey(value);
  return [...new Set([
    key,
    key.replace(/^IRADVC(?=\d)/, 'IRADV'),
    key.replace(/^IRADV(?=\d)/, 'IRADVC'),
  ])];
});
