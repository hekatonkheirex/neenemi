import type { SuiteDatabase } from '../db/database';
import { serializeSourceDetails, type SourceDetail } from './source-details';

export type NormalizedSourceMetadataTable =
  | 'consumables_usage_records'
  | 'consumables_output_records'
  | 'service_records';

export type SourceMetadataCandidate = {
  recordKey: string;
  sourceDetails?: readonly SourceDetail[];
  sourceOperationalJson?: string;
  sourceSheetName?: string;
  sourceRowNumber?: number;
};

export function backfillNormalizedSourceMetadata(
  database: SuiteDatabase,
  table: NormalizedSourceMetadataTable,
  batchId: string,
  candidates: readonly SourceMetadataCandidate[],
): number {
  const hasOperationalFields = table === 'service_records' || table === 'consumables_output_records';
  const operationalSet = hasOperationalFields
    ? `
      source_operational_json = CASE
        WHEN source_operational_json = '{}' AND ? <> '{}' THEN ?
        ELSE source_operational_json
      END`
    : '';
  const operationalCondition = hasOperationalFields
    ? `
        OR (source_operational_json = '{}' AND ? <> '{}')`
    : '';
  const update = database.prepare(`
    UPDATE ${table}
    SET
      source_sheet_name = CASE WHEN source_sheet_name = '' THEN ? ELSE source_sheet_name END,
      source_row_number = CASE WHEN source_row_number = 0 THEN ? ELSE source_row_number END,
      source_details_json = CASE WHEN source_details_json = '[]' THEN ? ELSE source_details_json END${operationalSet ? `,${operationalSet}` : ''}
    WHERE source_batch_id = ?
      AND record_key = ?
      AND (
        source_sheet_name = ''
        OR source_row_number = 0
        OR source_details_json = '[]'
        ${operationalCondition}
      )
  `);
  const seenKeys = new Set<string>();

  return database.transaction(() => {
    let updated = 0;
    for (const candidate of candidates) {
      const recordKey = candidate.recordKey.trim();
      const sourceSheetName = candidate.sourceSheetName?.trim() ?? '';
      const sourceRowNumber = Number.isInteger(candidate.sourceRowNumber) && (candidate.sourceRowNumber ?? 0) >= 0
        ? candidate.sourceRowNumber ?? 0
        : 0;
      const sourceDetailsJson = serializeSourceDetails(candidate.sourceDetails);
      const sourceOperationalJson = candidate.sourceOperationalJson?.trim() || '{}';
      if (!recordKey || seenKeys.has(recordKey)) continue;
      if (!sourceSheetName && sourceRowNumber === 0 && sourceDetailsJson === '[]'
        && (!hasOperationalFields || sourceOperationalJson === '{}')) continue;
      seenKeys.add(recordKey);

      const parameters = hasOperationalFields
        ? [sourceSheetName, sourceRowNumber, sourceDetailsJson, sourceOperationalJson, sourceOperationalJson, batchId, recordKey, sourceOperationalJson]
        : [sourceSheetName, sourceRowNumber, sourceDetailsJson, batchId, recordKey];
      const result = update.run(...parameters);
      if (result.changes > 0) updated += 1;
    }
    return updated;
  })();
}
