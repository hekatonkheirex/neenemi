import { randomUUID } from 'node:crypto';
import type { SuiteDatabase } from '../../db/database';
import { MAX_LIST_LIMIT } from '../../core/list-limit';
import { DEFAULT_TRAVEL_COST_CATALOG } from './catalog';
import {
  createTravelIdentityKey,
  parseTravelWorkbook,
  TRAVEL_COST_CATALOG_PARSER_REVISION,
  type ParsedTravelWorkbook,
} from './parser';
import { TRAVEL_SOURCE_OPERATIONAL_FIELDS } from './source-operational';
import type {
  HistoricalSummary,
  ParsedTravelTrip,
  TravelCostCatalog,
  TravelImportResult,
  TravelQuery,
  TravelStatus,
  TravelSummary,
  TravelTrip,
  TravelTripInput,
  TravelTransport,
} from './types';

type TravelTripRow = {
  id: string;
  recorded_at: string;
  service_number: string;
  customer_name: string;
  destination: string;
  transport: TravelTransport;
  technician: string;
  driver: string;
  advance: number;
  allowance: number;
  lodging: number;
  tolls: number;
  other_cost: number;
  vehicle_payment: number;
  technician_payment: number;
  distance_km: number;
  fuel_cost: number;
  total_cost: number;
  status: TravelStatus;
  source: 'xlsx' | 'manual';
  notes: string;
  record_key: string;
  source_batch_id: string | null;
  source_file_name: string;
  source_sheet_name: string;
  source_row_number: number;
  source_operational_json: string;
  created_at: string;
  updated_at: string;
};

type ExistingTravelTripRow = Pick<TravelTripRow, 'record_key' | 'source' | 'status' | 'source_batch_id' | 'source_file_name'> & {
  id: string;
};

type SummaryRow = {
  records: number;
  total_cost: number;
  average_cost: number;
  pending: number;
  review: number;
  approved: number;
  first_date: string | null;
  last_date: string | null;
};

type YearRow = { year: string | null };
type MonthlyRow = { month: string; total_cost: number };
type TransportRow = { transport: TravelTransport; records: number; total_cost: number };
type DestinationRow = { destination: string; records: number; total_cost: number };

const VALID_TRANSPORTS = new Set<TravelTransport>(['MOVIL PROPIO', 'MOVIL DATA', 'MOVIL RENTADO', 'BUS']);
const VALID_STATUSES = new Set<TravelStatus>(['pending', 'review', 'approved']);

export class TravelRepository {
  constructor(private readonly database: SuiteDatabase) {}

  async importWorkbook(
    batchId: string,
    sourceFileName: string,
    contents: Uint8Array,
    replaceBatchId?: string,
  ): Promise<TravelImportResult> {
    const parsed = await parseTravelWorkbook(contents, sourceFileName);
    return this.importParsedWorkbook(batchId, sourceFileName, parsed, replaceBatchId);
  }

  importParsedWorkbook(
    batchId: string,
    sourceFileName: string,
    parsed: ParsedTravelWorkbook,
    replaceBatchId?: string,
  ): TravelImportResult {
    const batch = this.database
      .prepare('SELECT id, domain FROM import_batches WHERE id = ?')
      .get(batchId) as { id: string; domain: string } | undefined;
    if (!batch) throw new Error(`No existe la importación ${batchId}.`);
    if (batch.domain !== 'viaticos') throw new Error('La importación no pertenece a Viáticos.');
    if (replaceBatchId === batchId) throw new Error('Una importación no puede reemplazarse a sí misma.');

    return this.database.transaction(() => {
      const preservedTrips = new Map<string, { status: TravelStatus; notes: string }>();
      const preservedTripsByIdentity = new Map<string, Array<{ status: TravelStatus; notes: string }>>();
      if (replaceBatchId) {
        const replacementBatch = this.database
          .prepare('SELECT id, domain, status FROM import_batches WHERE id = ?')
          .get(replaceBatchId) as { id: string; domain: string; status: string } | undefined;
        if (!replacementBatch || replacementBatch.domain !== 'viaticos' || replacementBatch.status !== 'applied') {
          throw new Error('La fuente de Viáticos que se quiere reemplazar no está disponible.');
        }

        const existingTrips = this.database
          .prepare('SELECT record_key, recorded_at, service_number, customer_name, transport, status, notes FROM travel_trips WHERE source_batch_id = ?')
          .all(replaceBatchId) as Array<{
            record_key: string;
            recorded_at: string;
            service_number: string;
            customer_name: string;
            transport: TravelTransport;
            status: TravelStatus;
            notes: string;
          }>;
        existingTrips.forEach((trip) => {
          const preserved = { status: trip.status, notes: trip.notes };
          preservedTrips.set(trip.record_key, preserved);
          const identityKey = createTravelIdentityKey({
            recordedAt: trip.recorded_at,
            serviceNumber: trip.service_number,
            customerName: trip.customer_name,
            transport: trip.transport,
          });
          const matches = preservedTripsByIdentity.get(identityKey) ?? [];
          matches.push(preserved);
          preservedTripsByIdentity.set(identityKey, matches);
        });
        this.database.prepare('DELETE FROM travel_trips WHERE source_batch_id = ?').run(replaceBatchId);
        this.database.prepare('DELETE FROM travel_cost_catalog WHERE source_batch_id = ?').run(replaceBatchId);
        this.database.prepare('DELETE FROM travel_historical_snapshots WHERE source_batch_id = ?').run(replaceBatchId);
        this.database.prepare('DELETE FROM import_batches WHERE id = ?').run(replaceBatchId);
      }

      const now = new Date().toISOString();
      const findDuplicate = this.database.prepare('SELECT id FROM travel_trips WHERE record_key = ? LIMIT 1');
      const insertTrip = this.database.prepare(`
        INSERT INTO travel_trips (
          id, recorded_at, service_number, customer_name, destination, transport,
          technician, driver, advance, allowance, lodging, tolls, other_cost,
          vehicle_payment, technician_payment, distance_km, fuel_cost, total_cost,
          status, source, notes, record_key, source_batch_id, source_file_name,
          source_sheet_name, source_row_number, source_operational_json, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);
      let accepted = 0;
      let duplicates = 0;

      for (const trip of parsed.trips) {
        if (findDuplicate.get(trip.sourceRecordKey)) {
          duplicates += 1;
          continue;
        }
        const identityMatches = preservedTripsByIdentity.get(createTravelIdentityKey(trip));
        const preserved = preservedTrips.get(trip.sourceRecordKey)
          ?? (identityMatches?.length === 1 ? identityMatches[0] : undefined);
        insertTrip.run(
          randomUUID(),
          trip.recordedAt,
          trip.serviceNumber,
          trip.customerName,
          trip.destination,
          trip.transport,
          trip.technician,
          trip.driver,
          trip.advance,
          trip.allowance,
          trip.lodging,
          trip.tolls,
          trip.otherCost,
          trip.vehiclePayment,
          trip.technicianPayment,
          trip.distanceKm,
          trip.fuelCost,
          trip.totalCost,
          preserved?.status ?? 'approved',
          'xlsx',
          preserved?.notes ?? trip.notes,
          trip.sourceRecordKey,
          batchId,
          sourceFileName,
          trip.sourceSheetName ?? '',
          trip.sourceRow,
          JSON.stringify(trip.sourceOperational ?? {}),
          now,
          now,
        );
        accepted += 1;
      }

      const insertCatalog = this.database.prepare(`
        INSERT INTO travel_cost_catalog (
          id, source, daily_allowance, hotel_per_night, catalog_json,
          source_batch_id, created_at, parser_revision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertCatalog.run(
        randomUUID(),
        parsed.costCatalog.source,
        parsed.costCatalog.dailyAllowance,
        parsed.costCatalog.hotelPerNight,
        JSON.stringify(parsed.costCatalog),
        batchId,
        now,
        TRAVEL_COST_CATALOG_PARSER_REVISION,
      );

      const insertSnapshot = this.database.prepare(`
        INSERT INTO travel_historical_snapshots (
          id, year, partial, summary_json, source_batch_id, source_file_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const summary of parsed.historical) {
        insertSnapshot.run(
          randomUUID(),
          summary.year,
          summary.partial ? 1 : 0,
          JSON.stringify(summary),
          batchId,
          sourceFileName,
          now,
        );
      }

      this.database
        .prepare('UPDATE import_batches SET status = \'applied\', applied_at = ? WHERE id = ?')
        .run(now, batchId);

      return {
        sourceType: 'viaticos' as const,
        accepted,
        duplicates,
        historicalSnapshots: parsed.historical.length,
        sourceSheets: parsed.sourceSheetNames.length,
      };
    })();
  }

  importRows(
    batchId: string,
    sourceFileName: string,
    trips: readonly ParsedTravelTrip[],
    historical: readonly HistoricalSummary[] = [],
    costCatalog: TravelCostCatalog = DEFAULT_TRAVEL_COST_CATALOG,
    sourceSheetCount = 1,
    replaceBatchId?: string,
  ): TravelImportResult {
    return this.importParsedWorkbook(batchId, sourceFileName, {
      trips: [...trips],
      historical: [...historical],
      costCatalog,
      primarySheetName: 'Viajes',
      sourceSheetNames: Array.from({ length: sourceSheetCount }, (_, index) => `Hoja ${index + 1}`),
      sourceYear: null,
    }, replaceBatchId);
  }

  backfillSourceOperational(batchId: string, trips: readonly ParsedTravelTrip[]): number {
    const update = this.database.prepare(`
      UPDATE travel_trips
      SET source_sheet_name = CASE WHEN source_sheet_name = '' THEN ? ELSE source_sheet_name END,
          source_row_number = CASE WHEN source_row_number = 0 THEN ? ELSE source_row_number END,
          source_operational_json = CASE WHEN source_operational_json = '{}' THEN ? ELSE source_operational_json END
      WHERE source_batch_id = ?
        AND record_key = ?
        AND (
          source_sheet_name = ''
          OR source_row_number = 0
          OR source_operational_json = '{}'
        )
    `);
    const seenKeys = new Set<string>();
    return this.database.transaction(() => {
      let updated = 0;
      trips.forEach((trip) => {
        const recordKey = trip.sourceRecordKey.trim();
        if (!recordKey || seenKeys.has(recordKey)) return;
        seenKeys.add(recordKey);
        const sourceSheetName = trip.sourceSheetName?.trim() ?? '';
        const sourceRowNumber = Number.isInteger(trip.sourceRow) && trip.sourceRow >= 0 ? trip.sourceRow : 0;
        const result = update.run(sourceSheetName, sourceRowNumber, JSON.stringify(trip.sourceOperational ?? {}), batchId, recordKey);
        if (result.changes > 0) updated += 1;
      });
      return updated;
    })();
  }

  needsCostCatalogRefresh(batchId: string): boolean {
    const row = this.database.prepare(`
      SELECT catalog.parser_revision
      FROM travel_cost_catalog catalog
      JOIN import_batches batch ON batch.id = catalog.source_batch_id
      WHERE catalog.source_batch_id = ?
        AND batch.domain = 'viaticos'
        AND batch.status = 'applied'
      ORDER BY catalog.created_at DESC, catalog.id DESC
      LIMIT 1
    `).get(batchId) as { parser_revision: number } | undefined;
    return !row || row.parser_revision < TRAVEL_COST_CATALOG_PARSER_REVISION;
  }

  refreshCostCatalog(batchId: string, catalog: TravelCostCatalog): boolean {
    if (!isTravelCostCatalog(catalog)) throw new Error('El catálogo de costos de Viáticos no es válido.');
    const catalogJson = JSON.stringify(catalog);

    return this.database.transaction(() => {
      const batch = this.database
        .prepare('SELECT id, domain, status FROM import_batches WHERE id = ?')
        .get(batchId) as { id: string; domain: string; status: string } | undefined;
      if (!batch || batch.domain !== 'viaticos' || batch.status !== 'applied') {
        throw new Error('La importación de Viáticos no está disponible para actualizar su catálogo.');
      }

      const existing = this.database.prepare(`
        SELECT id, catalog_json, parser_revision
        FROM travel_cost_catalog
        WHERE source_batch_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `).get(batchId) as { id: string; catalog_json: string; parser_revision: number } | undefined;

      if (existing
        && existing.parser_revision >= TRAVEL_COST_CATALOG_PARSER_REVISION
        && existing.catalog_json === catalogJson) {
        return false;
      }

      const now = new Date().toISOString();
      if (existing) {
        this.database.prepare(`
          UPDATE travel_cost_catalog
          SET source = ?, daily_allowance = ?, hotel_per_night = ?, catalog_json = ?, parser_revision = ?
          WHERE id = ?
        `).run(
          catalog.source,
          catalog.dailyAllowance,
          catalog.hotelPerNight,
          catalogJson,
          TRAVEL_COST_CATALOG_PARSER_REVISION,
          existing.id,
        );
      } else {
        this.database.prepare(`
          INSERT INTO travel_cost_catalog (
            id, source, daily_allowance, hotel_per_night, catalog_json,
            source_batch_id, created_at, parser_revision
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          catalog.source,
          catalog.dailyAllowance,
          catalog.hotelPerNight,
          catalogJson,
          batchId,
          now,
          TRAVEL_COST_CATALOG_PARSER_REVISION,
        );
      }
      return true;
    })();
  }

  saveTrip(input: TravelTripInput, id?: string): TravelTrip {
    const cleaned = normalizeTripInput(input);
    const now = new Date().toISOString();
    if (id) {
      const existing = this.database
        .prepare('SELECT id, record_key, source, status, source_batch_id, source_file_name FROM travel_trips WHERE id = ?')
        .get(id) as ExistingTravelTripRow | undefined;
      if (!existing) throw new Error('El viaje no existe.');
      this.database.prepare(`
        UPDATE travel_trips
        SET recorded_at = ?, service_number = ?, customer_name = ?, destination = ?,
          transport = ?, technician = ?, driver = ?, advance = ?, allowance = ?,
          lodging = ?, tolls = ?, other_cost = ?, vehicle_payment = ?,
          technician_payment = ?, distance_km = ?, fuel_cost = ?, total_cost = ?,
          notes = ?, updated_at = ?
        WHERE id = ?
      `).run(
        cleaned.recordedAt,
        cleaned.serviceNumber,
        cleaned.customerName,
        cleaned.destination,
        cleaned.transport,
        cleaned.technician,
        cleaned.driver,
        cleaned.advance,
        cleaned.allowance,
        cleaned.lodging,
        cleaned.tolls,
        cleaned.otherCost,
        cleaned.vehiclePayment,
        cleaned.technicianPayment,
        cleaned.distanceKm,
        cleaned.fuelCost,
        calculateTotal(cleaned),
        cleaned.notes,
        now,
        id,
      );
      const saved = this.get(id);
      if (!saved) throw new Error('No se pudo recuperar el viaje actualizado.');
      return saved;
    }

    const tripId = randomUUID();
    this.database.prepare(`
      INSERT INTO travel_trips (
        id, recorded_at, service_number, customer_name, destination, transport,
        technician, driver, advance, allowance, lodging, tolls, other_cost,
        vehicle_payment, technician_payment, distance_km, fuel_cost, total_cost,
        status, source, notes, record_key, source_batch_id, source_file_name,
        source_sheet_name, source_row_number, source_operational_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'manual', ?, ?, NULL, '', '', 0, '{}', ?, ?)
    `).run(
      tripId,
      cleaned.recordedAt,
      cleaned.serviceNumber,
      cleaned.customerName,
      cleaned.destination,
      cleaned.transport,
      cleaned.technician,
      cleaned.driver,
      cleaned.advance,
      cleaned.allowance,
      cleaned.lodging,
      cleaned.tolls,
      cleaned.otherCost,
      cleaned.vehiclePayment,
      cleaned.technicianPayment,
      cleaned.distanceKm,
      cleaned.fuelCost,
      calculateTotal(cleaned),
      cleaned.notes,
      `manual:${tripId}`,
      now,
      now,
    );
    const saved = this.get(tripId);
    if (!saved) throw new Error('No se pudo recuperar el viaje guardado.');
    return saved;
  }

  updateStatus(id: string, status: TravelStatus): TravelTrip {
    if (!VALID_STATUSES.has(status)) throw new Error('El estado de la rendición no es válido.');
    const result = this.database
      .prepare('UPDATE travel_trips SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id);
    if (result.changes === 0) throw new Error('El viaje no existe.');
    const trip = this.get(id);
    if (!trip) throw new Error('No se pudo recuperar el viaje actualizado.');
    return trip;
  }

  deleteTrip(id: string): boolean {
    const result = this.database
      .prepare('DELETE FROM travel_trips WHERE id = ?')
      .run(id);
    if (result.changes === 0) throw new Error('El viaje no existe.');
    return true;
  }

  get(id: string): TravelTrip | undefined {
    const row = this.database.prepare('SELECT * FROM travel_trips WHERE id = ?').get(id) as TravelTripRow | undefined;
    return row ? toTravelTrip(row) : undefined;
  }

  list(query: TravelQuery = {}): TravelTrip[] {
    const conditions: string[] = [];
    const parameters: Array<string | number> = [];
    if (query.status) {
      conditions.push('trip.status = ?');
      parameters.push(query.status);
    }
    if (query.transport) {
      conditions.push('trip.transport = ?');
      parameters.push(query.transport);
    }
    if (query.month?.trim()) {
      conditions.push('trip.recorded_at LIKE ?');
      parameters.push(`${query.month.trim()}%`);
    }
    if (query.query?.trim()) {
      const value = `%${query.query.trim().toLocaleLowerCase()}%`;
      conditions.push(`(
        lower(trip.service_number) LIKE ? OR lower(trip.customer_name) LIKE ?
        OR lower(trip.destination) LIKE ? OR lower(trip.technician) LIKE ?
        OR lower(trip.driver) LIKE ? OR lower(trip.notes) LIKE ?
        OR lower(trip.source_operational_json) LIKE ?
      )`);
      parameters.push(value, value, value, value, value, value, value);
    }
    const limit = Number.isInteger(query.limit) ? Math.max(1, Math.min(MAX_LIST_LIMIT, query.limit as number)) : undefined;
    if (limit !== undefined) parameters.push(limit);
    const rows = this.database.prepare(`
      SELECT *
      FROM travel_trips trip
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY trip.recorded_at DESC, trip.updated_at DESC, trip.id DESC
      ${limit === undefined ? '' : 'LIMIT ?'}
    `).all(...parameters) as TravelTripRow[];
    return rows.map(toTravelTrip);
  }

  getSummary(): TravelSummary {
    const yearRow = this.database
      .prepare("SELECT MAX(substr(recorded_at, 1, 4)) AS year FROM travel_trips WHERE recorded_at <> ''")
      .get() as YearRow;
    const operationalYear = yearRow.year ? Number(yearRow.year) : null;
    const yearCondition = operationalYear ? 'WHERE substr(trip.recorded_at, 1, 4) = ?' : '';
    const yearParameter = operationalYear ? [String(operationalYear)] : [];
    const summary = this.database
      .prepare(`
        SELECT
          COUNT(trip.id) AS records,
          COALESCE(SUM(trip.total_cost), 0) AS total_cost,
          COALESCE(AVG(trip.total_cost), 0) AS average_cost,
          SUM(CASE WHEN trip.status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN trip.status = 'review' THEN 1 ELSE 0 END) AS review,
          SUM(CASE WHEN trip.status = 'approved' THEN 1 ELSE 0 END) AS approved,
          MIN(NULLIF(trip.recorded_at, '')) AS first_date,
          MAX(NULLIF(trip.recorded_at, '')) AS last_date
        FROM travel_trips trip
        ${yearCondition}
      `)
      .get(...yearParameter) as SummaryRow;
    const monthlyRows = this.database.prepare(`
      SELECT substr(trip.recorded_at, 6, 2) AS month, COALESCE(SUM(trip.total_cost), 0) AS total_cost
      FROM travel_trips trip
      ${yearCondition}
      GROUP BY substr(trip.recorded_at, 6, 2)
    `).all(...yearParameter) as MonthlyRow[];
    const monthlyTotals = Array.from({ length: 12 }, () => 0);
    monthlyRows.forEach((row) => {
      const month = Number(row.month);
      if (month >= 1 && month <= 12) monthlyTotals[month - 1] = row.total_cost;
    });
    const transportRows = this.database.prepare(`
      SELECT trip.transport, COUNT(trip.id) AS records, COALESCE(SUM(trip.total_cost), 0) AS total_cost
      FROM travel_trips trip
      ${yearCondition}
      GROUP BY trip.transport
      ORDER BY total_cost DESC
    `).all(...yearParameter) as TransportRow[];
    const destinationRows = this.database.prepare(`
      SELECT CASE WHEN trim(trip.destination) = '' THEN 'Sin destino' ELSE trip.destination END AS destination,
        COUNT(trip.id) AS records, COALESCE(SUM(trip.total_cost), 0) AS total_cost
      FROM travel_trips trip
      ${yearCondition}
      GROUP BY CASE WHEN trim(trip.destination) = '' THEN 'Sin destino' ELSE trip.destination END
      ORDER BY total_cost DESC, destination COLLATE NOCASE
      LIMIT 5
    `).all(...yearParameter) as DestinationRow[];
    const transportTotals = transportRows.map((row) => ({
      key: row.transport,
      records: row.records,
      totalCost: row.total_cost,
    }));
    const topDestinations = destinationRows.map((row) => ({
      destination: row.destination,
      records: row.records,
      totalCost: row.total_cost,
    }));
    const source = this.database
      .prepare("SELECT source_name, created_at FROM import_batches WHERE domain = 'viaticos' AND status = 'applied' ORDER BY applied_at DESC, id DESC LIMIT 1")
      .get() as { source_name: string; created_at: string } | undefined;

    return {
      operationalYear,
      sourceName: source?.source_name ?? null,
      sourceImportedAt: source?.created_at ?? null,
      records: summary.records,
      totalCost: summary.total_cost,
      averageCost: summary.average_cost,
      pending: summary.pending,
      review: summary.review,
      approved: summary.approved,
      firstDate: summary.first_date,
      lastDate: summary.last_date,
      monthlyTotals,
      transportTotals,
      topDestinations,
    };
  }

  listHistorical(): HistoricalSummary[] {
    const rows = this.database.prepare(`
      SELECT snapshot.summary_json
      FROM travel_historical_snapshots snapshot
      JOIN import_batches batch ON batch.id = snapshot.source_batch_id
      WHERE batch.domain = 'viaticos' AND batch.status = 'applied'
        AND snapshot.id = (
          SELECT candidate.id
          FROM travel_historical_snapshots candidate
          JOIN import_batches candidate_batch ON candidate_batch.id = candidate.source_batch_id
          WHERE candidate.year = snapshot.year
            AND candidate_batch.domain = 'viaticos'
            AND candidate_batch.status = 'applied'
          ORDER BY candidate.created_at DESC, candidate.id DESC
          LIMIT 1
        )
      ORDER BY snapshot.year
    `).all() as Array<{ summary_json: string }>;
    return rows.flatMap((row) => {
      try {
        const parsed = JSON.parse(row.summary_json) as HistoricalSummary;
        return Number.isInteger(parsed.year) ? [parsed] : [];
      } catch {
        return [];
      }
    });
  }

  getCostCatalog(): TravelCostCatalog {
    const row = this.database.prepare(`
      SELECT catalog_json
      FROM travel_cost_catalog catalog
      JOIN import_batches batch ON batch.id = catalog.source_batch_id
      WHERE batch.domain = 'viaticos' AND batch.status = 'applied'
      ORDER BY catalog.created_at DESC, catalog.id DESC
      LIMIT 1
    `).get() as { catalog_json: string } | undefined;
    if (!row) return DEFAULT_TRAVEL_COST_CATALOG;
    try {
      const parsed = JSON.parse(row.catalog_json) as TravelCostCatalog;
      return isTravelCostCatalog(parsed) ? parsed : DEFAULT_TRAVEL_COST_CATALOG;
    } catch {
      return DEFAULT_TRAVEL_COST_CATALOG;
    }
  }
}

function normalizeTripInput(input: TravelTripInput): TravelTripInput {
  if (!input.recordedAt.trim()) throw new Error('El viaje debe tener una fecha.');
  if (!input.customerName.trim()) throw new Error('El viaje debe tener un cliente.');
  if (!input.destination.trim()) throw new Error('El viaje debe tener un destino.');
  if (!VALID_TRANSPORTS.has(input.transport)) throw new Error('El medio de transporte no es válido.');
  if (!Number.isFinite(input.advance)) throw new Error('El campo advance debe ser un número válido.');
  const nonNegativeNumbers = ['allowance', 'lodging', 'tolls', 'otherCost', 'vehiclePayment', 'technicianPayment', 'distanceKm', 'fuelCost'] as const;
  for (const field of nonNegativeNumbers) {
    if (!Number.isFinite(input[field]) || input[field] < 0) throw new Error(`El campo ${field} debe ser un número no negativo.`);
  }
  return {
    recordedAt: input.recordedAt.trim().slice(0, 10),
    serviceNumber: input.serviceNumber.trim(),
    customerName: input.customerName.trim(),
    destination: input.destination.trim(),
    transport: input.transport,
    technician: input.technician.trim(),
    driver: input.driver.trim(),
    advance: input.advance,
    allowance: input.allowance,
    lodging: input.lodging,
    tolls: input.tolls,
    otherCost: input.otherCost,
    vehiclePayment: input.vehiclePayment,
    technicianPayment: input.technicianPayment,
    distanceKm: input.distanceKm,
    fuelCost: input.fuelCost,
    notes: input.notes.trim(),
  };
}

function calculateTotal(input: Pick<TravelTripInput, 'allowance' | 'lodging' | 'tolls' | 'otherCost' | 'vehiclePayment' | 'technicianPayment' | 'fuelCost'>): number {
  return input.allowance + input.lodging + input.tolls + input.otherCost + input.vehiclePayment + input.technicianPayment + input.fuelCost;
}

function toTravelTrip(row: TravelTripRow): TravelTrip {
  return {
    id: row.id,
    recordedAt: row.recorded_at,
    serviceNumber: row.service_number,
    customerName: row.customer_name,
    destination: row.destination,
    transport: row.transport,
    technician: row.technician,
    driver: row.driver,
    advance: row.advance,
    allowance: row.allowance,
    lodging: row.lodging,
    tolls: row.tolls,
    otherCost: row.other_cost,
    vehiclePayment: row.vehicle_payment,
    technicianPayment: row.technician_payment,
    distanceKm: row.distance_km,
    fuelCost: row.fuel_cost,
    totalCost: row.total_cost,
    status: row.status,
    source: row.source,
    notes: row.notes,
    sourceFileName: row.source_file_name,
    sourceSheetName: row.source_sheet_name,
    sourceRowNumber: row.source_row_number,
    sourceBatchId: row.source_batch_id,
    sourceOperational: parseTravelSourceOperational(row.source_operational_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseTravelSourceOperational(value: string | null | undefined): TravelTrip['sourceOperational'] {
  if (!value || value === '{}') return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const sourceOperational: NonNullable<TravelTrip['sourceOperational']> = {};
    TRAVEL_SOURCE_OPERATIONAL_FIELDS.forEach(({ key }) => {
      const candidate = (parsed as Record<string, unknown>)[key];
      if (typeof candidate === 'string' && candidate.trim()) sourceOperational[key] = candidate.trim();
    });
    return Object.keys(sourceOperational).length > 0 ? sourceOperational : undefined;
  } catch {
    return undefined;
  }
}

function isTravelCostCatalog(value: unknown): value is TravelCostCatalog {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TravelCostCatalog>;
  return typeof candidate.source === 'string'
    && typeof candidate.dailyAllowance === 'number'
    && Number.isFinite(candidate.dailyAllowance)
    && typeof candidate.hotelPerNight === 'number'
    && Number.isFinite(candidate.hotelPerNight)
    && Array.isArray(candidate.busFares)
    && Array.isArray(candidate.tollRoutes);
}
