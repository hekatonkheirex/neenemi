import { randomUUID } from 'node:crypto';
import type { SuiteDatabase } from './database';

export type ImportBatchStatus = 'staged' | 'applied' | 'failed';

export type ImportBatch = {
  id: string;
  domain: string;
  sourceName: string;
  sourceType: string | null;
  sourceHash: string | null;
  status: ImportBatchStatus;
  createdAt: string;
  appliedAt: string | null;
};

export type ImportFile = {
  id: string;
  batchId: string;
  fileName: string;
  storedPath: string;
  contentHash: string;
  contentType: string | null;
  sizeBytes: number;
  createdAt: string;
};

export type ImportFileContentStatus = {
  totalFiles: number;
  embeddedFiles: number;
  missingFiles: number;
  totalBytes: number;
  embeddedBytes: number;
};

export type ImportFileBackfillCandidate = Pick<ImportFile, 'id' | 'fileName' | 'storedPath' | 'contentHash' | 'sizeBytes'> & {
  archiveBatchId: string | null;
};

export type AddArchivedImportFileInput = {
  id: string;
  sourceBatchId: string;
  fileName: string;
  storedPath: string;
  contentHash: string;
  contentType?: string;
  sizeBytes: number;
  createdAt: string;
  contentBlob: Uint8Array;
};

export type ArchivedImportFileKey = {
  sourceBatchId: string;
  fileName: string;
  contentHashPrefix: string;
  sizeBytes: number;
};

export type SourceSheetRows = {
  name: string;
  rows: readonly unknown[][];
};

export type ImportSourceRow = {
  id: string;
  batchId: string;
  importFileId: string;
  fileName: string;
  sheetName: string;
  sheetIndex: number;
  rowNumber: number;
  values: unknown[];
  isEmpty: boolean;
};

export type ImportSourceSheet = {
  importFileId: string;
  fileName: string;
  sheetName: string;
  sheetIndex: number;
  rowCount: number;
  columnCount: number;
};

export type ImportBatchSummary = ImportBatch & {
  files: number;
  rawRows: number;
  rawSheets: number;
};

type ImportBatchRow = {
  id: string;
  domain: string;
  source_name: string;
  source_type: string | null;
  source_hash: string | null;
  status: ImportBatchStatus;
  created_at: string;
  applied_at: string | null;
};

type ImportFileRow = {
  id: string;
  batch_id: string;
  file_name: string;
  stored_path: string;
  content_hash: string;
  content_type: string | null;
  size_bytes: number;
  created_at: string;
};

type ImportBatchSummaryRow = ImportBatchRow & {
  files: number;
  raw_rows: number;
  raw_sheets: number;
};

type ImportSourceRowRow = {
  id: string;
  batch_id: string;
  import_file_id: string;
  file_name: string;
  sheet_name: string;
  sheet_index: number;
  row_number: number;
  values_json: string;
  is_empty: number;
};

export type CreateImportBatchInput = {
  id?: string;
  domain: string;
  sourceName: string;
  sourceType?: string;
  sourceHash?: string;
};

export type AddImportFileInput = {
  id?: string;
  batchId: string;
  fileName: string;
  storedPath: string;
  contentHash: string;
  contentType?: string;
  sizeBytes: number;
  contentBlob?: Uint8Array;
};

export class SettingsRepository {
  constructor(private readonly database: SuiteDatabase) {}

  get<T>(namespace: string, key: string, fallback: T): T {
    const row = this.database
      .prepare('SELECT value_json FROM app_settings WHERE namespace = ? AND key = ?')
      .get(namespace, key) as { value_json: string } | undefined;

    if (!row) {
      return fallback;
    }

    try {
      return JSON.parse(row.value_json) as T;
    } catch {
      return fallback;
    }
  }

  set<T>(namespace: string, key: string, value: T): void {
    const valueJson = JSON.stringify(value);
    if (valueJson === undefined) {
      throw new TypeError('La configuración debe poder serializarse como JSON.');
    }

    this.database
      .prepare(`
        INSERT INTO app_settings (namespace, key, value_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(namespace, key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
      `)
      .run(namespace, key, valueJson, new Date().toISOString());
  }

  remove(namespace: string, key: string): void {
    this.database
      .prepare('DELETE FROM app_settings WHERE namespace = ? AND key = ?')
      .run(namespace, key);
  }
}

export class ImportRepository {
  constructor(private readonly database: SuiteDatabase) {}

  createBatch(input: CreateImportBatchInput): string {
    const id = input.id ?? randomUUID();
    this.database
      .prepare(`
        INSERT INTO import_batches (
          id, domain, source_name, source_type, source_hash, status, created_at
        ) VALUES (?, ?, ?, ?, ?, 'staged', ?)
      `)
      .run(id, input.domain, input.sourceName, input.sourceType ?? null, input.sourceHash ?? null, new Date().toISOString());
    return id;
  }

  getBatch(id: string): ImportBatch | undefined {
    const row = this.database
      .prepare('SELECT * FROM import_batches WHERE id = ?')
      .get(id) as ImportBatchRow | undefined;

    return row ? this.toBatch(row) : undefined;
  }

  findAppliedByHash(domain: string, sourceHash: string): ImportBatch | undefined {
    const row = this.database
      .prepare(`
        SELECT * FROM import_batches
        WHERE domain = ? AND source_hash = ? AND status = 'applied'
        ORDER BY applied_at DESC, id DESC
        LIMIT 1
      `)
      .get(domain, sourceHash) as ImportBatchRow | undefined;

    return row ? this.toBatch(row) : undefined;
  }

  findLatestApplied(domain: string): ImportBatch | undefined {
    const row = this.database
      .prepare(`
        SELECT * FROM import_batches
        WHERE domain = ? AND status = 'applied'
        ORDER BY applied_at DESC, id DESC
        LIMIT 1
      `)
      .get(domain) as ImportBatchRow | undefined;

    return row ? this.toBatch(row) : undefined;
  }

  findLatestAppliedBySourceType(domain: string, sourceType: string): ImportBatch | undefined {
    const row = this.database
      .prepare(`
        SELECT * FROM import_batches
        WHERE domain = ? AND source_type = ? AND status = 'applied'
        ORDER BY applied_at DESC, id DESC
        LIMIT 1
      `)
      .get(domain, sourceType) as ImportBatchRow | undefined;

    return row ? this.toBatch(row) : undefined;
  }

  listAppliedBySourceType(domain: string, sourceType: string): ImportBatch[] {
    const rows = this.database
      .prepare(`
        SELECT * FROM import_batches
        WHERE domain = ? AND source_type = ? AND status = 'applied'
        ORDER BY applied_at DESC, id DESC
      `)
      .all(domain, sourceType) as ImportBatchRow[];

    return rows.map((row) => this.toBatch(row));
  }

  listApplied(domain: string): ImportBatch[] {
    const rows = this.database
      .prepare(`
        SELECT * FROM import_batches
        WHERE domain = ? AND status = 'applied'
        ORDER BY applied_at DESC, id DESC
      `)
      .all(domain) as ImportBatchRow[];

    return rows.map((row) => this.toBatch(row));
  }

  addFile(input: AddImportFileInput): string {
    const id = input.id ?? randomUUID();
    this.database
      .prepare(`
        INSERT INTO import_files (
          id, batch_id, file_name, stored_path, content_hash,
          content_type, size_bytes, created_at, content_blob
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.batchId,
        input.fileName,
        input.storedPath,
        input.contentHash,
        input.contentType ?? null,
        input.sizeBytes,
        new Date().toISOString(),
        input.contentBlob === undefined ? null : Buffer.from(input.contentBlob),
      );
    return id;
  }

  getFileContent(fileId: string): Uint8Array | null {
    const row = this.database
      .prepare(`
        SELECT content_blob FROM import_files WHERE id = ?
        UNION ALL
        SELECT content_blob FROM archived_import_files WHERE id = ?
        LIMIT 1
      `)
      .get(fileId, fileId) as { content_blob: Buffer | null } | undefined;
    return row?.content_blob ? new Uint8Array(row.content_blob) : null;
  }

  storeFileContent(fileId: string, contents: Uint8Array): boolean {
    const bytes = Buffer.from(contents);
    const result = this.database
      .prepare('UPDATE import_files SET content_blob = ? WHERE id = ? AND content_blob IS NULL')
      .run(bytes, fileId);
    if (result.changes > 0) return true;

    return this.database
      .prepare('UPDATE archived_import_files SET content_blob = ? WHERE id = ? AND content_blob IS NULL')
      .run(bytes, fileId).changes > 0;
  }

  listFilesMissingContent(): ImportFileBackfillCandidate[] {
    return this.database
      .prepare(`
        SELECT id, file_name, stored_path, content_hash, size_bytes, created_at, NULL AS archive_batch_id
        FROM import_files
        WHERE content_blob IS NULL
        UNION ALL
        SELECT id, file_name, stored_path, content_hash, size_bytes, created_at, source_batch_id AS archive_batch_id
        FROM archived_import_files
        WHERE content_blob IS NULL
        ORDER BY created_at, id
      `)
      .all()
      .map((row) => {
        const file = row as {
          id: string;
          file_name: string;
          stored_path: string;
          content_hash: string;
          size_bytes: number;
          archive_batch_id: string | null;
        };
        return {
          id: file.id,
          fileName: file.file_name,
          storedPath: file.stored_path,
          contentHash: file.content_hash,
          sizeBytes: file.size_bytes,
          archiveBatchId: file.archive_batch_id,
        };
      });
  }

  addArchivedFile(input: AddArchivedImportFileInput): boolean {
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO archived_import_files (
        id, source_batch_id, file_name, stored_path, content_hash, content_type,
        size_bytes, created_at, archived_at, content_blob
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.sourceBatchId,
      input.fileName,
      input.storedPath,
      input.contentHash,
      input.contentType ?? null,
      input.sizeBytes,
      input.createdAt,
      new Date().toISOString(),
      Buffer.from(input.contentBlob),
    );
    return result.changes > 0;
  }

  listArchivedFileKeys(): ArchivedImportFileKey[] {
    return this.database.prepare(`
      SELECT source_batch_id, file_name, substr(content_hash, 1, 16) AS content_hash_prefix, size_bytes
      FROM archived_import_files
    `).all().map((row) => {
      const file = row as { source_batch_id: string; file_name: string; content_hash_prefix: string; size_bytes: number };
      return {
        sourceBatchId: file.source_batch_id,
        fileName: file.file_name,
        contentHashPrefix: file.content_hash_prefix,
        sizeBytes: file.size_bytes,
      };
    });
  }

  getFileContentStatus(): ImportFileContentStatus {
    const row = this.database
      .prepare(`
        SELECT
          COUNT(*) AS total_files,
          COUNT(content_blob) AS embedded_files,
          COALESCE(SUM(size_bytes), 0) AS total_bytes,
          COALESCE(SUM(CASE WHEN content_blob IS NOT NULL THEN size_bytes ELSE 0 END), 0) AS embedded_bytes
        FROM (
          SELECT size_bytes, content_blob FROM import_files
          UNION ALL
          SELECT size_bytes, content_blob FROM archived_import_files
        )
      `)
      .get() as {
      total_files: number;
      embedded_files: number;
      total_bytes: number;
      embedded_bytes: number;
    };
    return {
      totalFiles: row.total_files,
      embeddedFiles: row.embedded_files,
      missingFiles: row.total_files - row.embedded_files,
      totalBytes: row.total_bytes,
      embeddedBytes: row.embedded_bytes,
    };
  }

  listFiles(batchId: string): ImportFile[] {
    const rows = this.database
      .prepare(`
        SELECT id, batch_id, file_name, stored_path, content_hash,
          content_type, size_bytes, created_at
        FROM import_files WHERE batch_id = ? ORDER BY created_at, id
      `)
      .all(batchId) as ImportFileRow[];

    return rows.map((row) => this.toFile(row));
  }

  listBatches(limit = 200): ImportBatchSummary[] {
    const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
    const rows = this.database
      .prepare(`
        SELECT
          batch.*,
          COUNT(DISTINCT file.id) AS files,
          COUNT(DISTINCT raw.id) AS raw_rows,
          COUNT(DISTINCT raw.import_file_id || ':' || raw.sheet_name) AS raw_sheets
        FROM import_batches batch
        LEFT JOIN import_files file ON file.batch_id = batch.id
        LEFT JOIN import_source_rows raw ON raw.batch_id = batch.id
        GROUP BY batch.id
        ORDER BY batch.created_at DESC, batch.id DESC
        LIMIT ?
      `)
      .all(safeLimit) as ImportBatchSummaryRow[];

    return rows.map((row) => ({
      ...this.toBatch(row),
      files: row.files,
      rawRows: row.raw_rows,
      rawSheets: row.raw_sheets,
    }));
  }

  listNonManualBatches(): ImportBatch[] {
    const rows = this.database
      .prepare(`
        SELECT * FROM import_batches
        WHERE source_type IS NULL OR source_type <> 'manual'
        ORDER BY created_at DESC, id DESC
      `)
      .all() as ImportBatchRow[];

    return rows.map((row) => this.toBatch(row));
  }

  addSourceRows(batchId: string, importFileId: string, sheets: readonly SourceSheetRows[]): { sheets: number; rows: number } {
    const batch = this.database
      .prepare('SELECT id FROM import_batches WHERE id = ?')
      .get(batchId) as { id: string } | undefined;
    if (!batch) throw new Error(`No existe la importación ${batchId}.`);

    const file = this.database
      .prepare('SELECT id FROM import_files WHERE id = ? AND batch_id = ?')
      .get(importFileId, batchId) as { id: string } | undefined;
    if (!file) throw new Error(`No existe el archivo de origen de la importación ${batchId}.`);

    const insertRow = this.database.prepare(`
      INSERT INTO import_source_rows (
        id, batch_id, import_file_id, sheet_name, sheet_index,
        row_number, values_json, is_empty, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    let rowCount = 0;

    const insertRows = this.database.transaction(() => {
      sheets.forEach((sheet, sheetIndex) => {
        sheet.rows.forEach((values, rowIndex) => {
          const normalizedValues = [...values];
          const isEmpty = normalizedValues.every((value) => value === undefined || value === null || value === '');
          insertRow.run(
            randomUUID(),
            batchId,
            importFileId,
            sheet.name,
            sheetIndex,
            rowIndex + 1,
            JSON.stringify(normalizedValues),
            isEmpty ? 1 : 0,
            now,
          );
          rowCount += 1;
        });
      });
    });
    insertRows();

    return {
      sheets: sheets.length,
      rows: rowCount,
    };
  }

  listSourceSheets(batchId: string): ImportSourceSheet[] {
    const rows = this.database
      .prepare(`
        SELECT
          raw.import_file_id,
          file.file_name,
          raw.sheet_name,
          raw.sheet_index,
          COUNT(raw.id) AS row_count,
          MAX(json_array_length(raw.values_json)) AS column_count
        FROM import_source_rows raw
        JOIN import_files file ON file.id = raw.import_file_id
        WHERE raw.batch_id = ?
        GROUP BY raw.import_file_id, file.file_name, raw.sheet_name, raw.sheet_index
        ORDER BY raw.sheet_index, raw.sheet_name, file.file_name
      `)
      .all(batchId) as Array<{
      import_file_id: string;
      file_name: string;
      sheet_name: string;
      sheet_index: number;
      row_count: number;
      column_count: number;
    }>;

    return rows.map((row) => ({
      importFileId: row.import_file_id,
      fileName: row.file_name,
      sheetName: row.sheet_name,
      sheetIndex: row.sheet_index,
      rowCount: row.row_count,
      columnCount: row.column_count,
    }));
  }

  listSourceRows(
    batchId: string,
    options: { importFileId?: string; sheetName?: string; limit?: number; offset?: number } = {},
  ): ImportSourceRow[] {
    const conditions = ['raw.batch_id = ?'];
    const parameters: Array<string | number> = [batchId];
    if (options.importFileId) {
      conditions.push('raw.import_file_id = ?');
      parameters.push(options.importFileId);
    }
    if (options.sheetName) {
      conditions.push('raw.sheet_name = ?');
      parameters.push(options.sheetName);
    }
    const limit = Number.isInteger(options.limit) ? Math.max(1, Math.min(500, options.limit!)) : 100;
    const offset = Number.isInteger(options.offset) ? Math.max(0, Math.min(1_000_000, options.offset!)) : 0;
    parameters.push(limit, offset);
    const rows = this.database
      .prepare(`
        SELECT
          raw.id, raw.batch_id, raw.import_file_id, file.file_name,
          raw.sheet_name, raw.sheet_index, raw.row_number,
          raw.values_json, raw.is_empty
        FROM import_source_rows raw
        JOIN import_files file ON file.id = raw.import_file_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY raw.sheet_index, raw.row_number, raw.id
        LIMIT ? OFFSET ?
      `)
      .all(...parameters) as ImportSourceRowRow[];

    return rows.map((row) => ({
      id: row.id,
      batchId: row.batch_id,
      importFileId: row.import_file_id,
      fileName: row.file_name,
      sheetName: row.sheet_name,
      sheetIndex: row.sheet_index,
      rowNumber: row.row_number,
      values: parseSourceValues(row.values_json),
      isEmpty: row.is_empty === 1,
    }));
  }

  markApplied(batchId: string): void {
    this.database
      .prepare(`
        UPDATE import_batches
        SET status = 'applied', applied_at = ?
        WHERE id = ?
      `)
      .run(new Date().toISOString(), batchId);
  }

  markFailed(batchId: string): void {
    this.database
      .prepare(`
        UPDATE import_batches
        SET status = 'failed', applied_at = NULL
        WHERE id = ?
      `)
      .run(batchId);
  }

  removeBatch(id: string): { batch: ImportBatch; files: ImportFile[] } | undefined {
    const batch = this.getBatch(id);
    if (!batch) return undefined;
    const files = this.listFiles(id);
    this.database.prepare('DELETE FROM import_batches WHERE id = ?').run(id);
    return { batch, files };
  }

  clearImportedBatches(batchIds: readonly string[]): void {
    const uniqueBatchIds = [...new Set(batchIds.filter((batchId) => batchId.trim()))];
    if (uniqueBatchIds.length === 0) return;

    const clearImportedData = this.database.transaction(() => {
      this.database
        .prepare('DELETE FROM contract_equipment WHERE source_sheet_name <> \'\' OR source_row_number > 0')
        .run();

      const removeCustomer = this.database.prepare(`
        DELETE FROM customers
        WHERE id = ?
          AND NOT EXISTS (SELECT 1 FROM contracts WHERE contracts.customer_id = customers.id)
      `);

      for (let offset = 0; offset < uniqueBatchIds.length; offset += 500) {
        const batchIds = uniqueBatchIds.slice(offset, offset + 500);
        const placeholders = batchIds.map(() => '?').join(', ');
        const importedCustomerIds = this.database
          .prepare(`
            SELECT id
            FROM customers
            WHERE source_details_json <> '[]'
            UNION
            SELECT DISTINCT customer_id
            FROM contracts
            WHERE source_batch_id IN (${placeholders})
          `)
          .all(...batchIds) as Array<{ id: string }>;

        this.database
          .prepare(`DELETE FROM maintenance_model_rules WHERE source_batch_id IN (${placeholders})`)
          .run(...batchIds);
        this.database
          .prepare(`DELETE FROM travel_trips WHERE source_batch_id IN (${placeholders})`)
          .run(...batchIds);
        this.database
          .prepare(`DELETE FROM travel_cost_catalog WHERE source_batch_id IN (${placeholders})`)
          .run(...batchIds);
        this.database
          .prepare(`DELETE FROM travel_historical_snapshots WHERE source_batch_id IN (${placeholders})`)
          .run(...batchIds);
        this.database
          .prepare(`
            DELETE FROM contracts
            WHERE source_batch_id IN (${placeholders})
               OR source_sheet_name <> ''
               OR source_row_number > 0
          `)
          .run(...batchIds);

        for (const customer of importedCustomerIds) removeCustomer.run(customer.id);
        this.database
          .prepare(`DELETE FROM import_batches WHERE id IN (${placeholders})`)
          .run(...batchIds);
      }

      this.database.prepare('DELETE FROM parts').run();
      this.database
        .prepare(`
          DELETE FROM app_settings
          WHERE namespace = 'sales'
            AND key IN ('catalog-consumibles', 'catalog-repuestos', 'open-contract')
        `)
        .run();

      this.database
        .prepare(`
          DELETE FROM equipment_models
          WHERE id NOT IN (SELECT model_id FROM contract_equipment WHERE model_id IS NOT NULL)
            AND id NOT IN (SELECT model_id FROM model_mps_profiles WHERE model_id IS NOT NULL)
            AND id NOT IN (SELECT model_id FROM maintenance_model_rules WHERE model_id IS NOT NULL)
        `)
        .run();
    });

    clearImportedData();
  }

  private toBatch(row: ImportBatchRow): ImportBatch {
    return {
      id: row.id,
      domain: row.domain,
      sourceName: row.source_name,
      sourceType: row.source_type ?? null,
      sourceHash: row.source_hash,
      status: row.status,
      createdAt: row.created_at,
      appliedAt: row.applied_at,
    };
  }

  private toFile(row: ImportFileRow): ImportFile {
    return {
      id: row.id,
      batchId: row.batch_id,
      fileName: row.file_name,
      storedPath: row.stored_path,
      contentHash: row.content_hash,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
    };
  }
}

function parseSourceValues(valueJson: string): unknown[] {
  try {
    const values = JSON.parse(valueJson) as unknown;
    return Array.isArray(values) ? values : [];
  } catch {
    return [];
  }
}
