import { DatabaseSync, backup, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, openSync, closeSync, writeSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Meeting, MeetingDetail, Segment, SummaryDocument } from '../../src/shared/contracts';
import { z } from 'zod';
import { validateSummary } from './summarizer';

const schema = `
CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,normalized_name TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS equipment_models(id TEXT PRIMARY KEY,brand TEXT NOT NULL,model_name TEXT NOT NULL,normalized_name TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(brand,normalized_name));
CREATE TABLE IF NOT EXISTS meetings(id TEXT PRIMARY KEY,title TEXT NOT NULL,recorded_at TEXT NOT NULL,duration_s INTEGER,customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,status TEXT NOT NULL CHECK(status IN ('grabando','interrumpida','en_cola','transcribiendo','listo','error')),progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),error TEXT,transcribe_seconds INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meeting_audio_chunks(meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,seq INTEGER NOT NULL CHECK(seq>=0),data BLOB NOT NULL,PRIMARY KEY(meeting_id,seq));
CREATE TABLE IF NOT EXISTS meeting_segments(meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,seq INTEGER NOT NULL CHECK(seq>=0),start_ms INTEGER NOT NULL,end_ms INTEGER NOT NULL,text TEXT NOT NULL,PRIMARY KEY(meeting_id,seq));`;
const select = `SELECT m.id,m.title,m.recorded_at AS recordedAt,m.duration_s AS durationS,m.status,m.progress,m.error,m.transcribe_seconds AS transcribeSeconds,
(SELECT COUNT(*) FROM meeting_audio_chunks c WHERE c.meeting_id=m.id) AS chunkCount,m.created_at AS createdAt,m.updated_at AS updatedAt,
COALESCE(s.status,'none') AS summaryStatus,s.error AS summaryError FROM meetings m LEFT JOIN meeting_summaries s ON s.meeting_id=m.id`;
const storedSummarySchema = z.object({ document: z.string(), model: z.string().min(1), generatedAt: z.string().min(1) });
export class MeetingsRepository {
  readonly db: DatabaseSync;
  readonly path: string;
  private readonly statements = new Map<string, StatementSync>();
  constructor(path: string) {
    this.path = resolve(path); mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path, { timeout: 10000 });
    try {
      this.rejectIncompatible(this.db);
      if (Number(this.db.prepare('PRAGMA user_version').get()!.user_version) === 1 && !existsSync(this.path + '.before-native-v2.bak')) this.db.prepare('VACUUM INTO ?').run(this.path + '.before-native-v2.bak');
      this.transaction(() => {
        this.db.exec(schema);
        const columns = this.db.prepare('PRAGMA table_info(meetings)').all();
        if (!columns.some(row => row.name === 'audio_format')) this.db.exec("ALTER TABLE meetings ADD COLUMN audio_format TEXT NOT NULL DEFAULT 'webm'");
        if (!columns.some(row => row.name === 'sample_rate')) this.db.exec('ALTER TABLE meetings ADD COLUMN sample_rate INTEGER NOT NULL DEFAULT 16000');
        this.db.exec("CREATE TABLE IF NOT EXISTS meeting_summaries(meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'none' CHECK(status IN ('none','queued','running','ready','error')),error TEXT,document TEXT,model TEXT,generated_at TEXT); PRAGMA user_version=2;");
      });
      this.db.exec('PRAGMA journal_mode=WAL');
    } catch (error) { this.db.close(); throw error; }
  }
  private rejectIncompatible(db: DatabaseSync): void {
    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()) throw new Error('Esta es una base DCSS, no una base de Ñe’eñemi. Usa Importar grabaciones.');
    if (Number(db.prepare('PRAGMA user_version').get()!.user_version) > 2) throw new Error('La base pertenece a una versión posterior de Ñe’eñemi.');
  }
  private statement(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) { statement = this.db.prepare(sql); this.statements.set(sql, statement); }
    return statement;
  }
  private run(sql: string, ...values: SQLInputValue[]): void { this.statement(sql).run(...values); }
  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  list(): Meeting[] { return this.statement(select + ' ORDER BY m.created_at DESC,m.rowid DESC').all() as unknown as Meeting[]; }
  get(id: string): Meeting {
    const meeting = this.statement(select + ' WHERE m.id=?').get(id);
    if (!meeting) throw new Error('Grabación inexistente.');
    return meeting as unknown as Meeting;
  }
  detail(id: string): MeetingDetail {
    const meeting = this.get(id);
    const segments = this.statement('SELECT seq,start_ms AS startMs,end_ms AS endMs,text FROM meeting_segments WHERE meeting_id=? ORDER BY seq').all(id) as unknown as Segment[];
    const stored = this.statement('SELECT document,model,generated_at AS generatedAt FROM meeting_summaries WHERE meeting_id=? AND document IS NOT NULL').get(id);
    const summary = stored ? storedSummarySchema.parse(stored) : null;
    return { meeting, segments, summary: summary ? { ...summary, document: validateSummary(JSON.parse(summary.document), new Set(segments.map(segment => segment.seq))) } : null };
  }
  create(title: string): Meeting {
    title = title.trim(); if (!title || title.length > 300) throw new Error('Escribe un nombre de hasta 300 caracteres.');
    const id = randomUUID(), now = new Date().toISOString();
    this.run("INSERT INTO meetings(id,title,recorded_at,status,created_at,updated_at,audio_format,sample_rate) VALUES(?,?,?,'grabando',?,?,'pcm_s16le',16000)", id, title, now, now, now);
    return this.get(id);
  }
  addChunk(id: string, seq: number, data: Uint8Array): void {
    const meeting = this.get(id);
    if (meeting.status !== 'grabando' || seq !== meeting.chunkCount || !data.byteLength || data.byteLength % 2 || data.byteLength > 960000) throw new Error('Bloque de audio inválido o grabación cerrada.');
    this.run('INSERT INTO meeting_audio_chunks VALUES(?,?,?)', id, seq, data);
  }
  finish(id: string): void {
    const meeting = this.get(id);
    if (!['grabando','interrumpida'].includes(meeting.status) || !meeting.chunkCount) throw new Error('No hay audio conservado o la grabación ya está cerrada.');
    const format = this.statement('SELECT audio_format,sample_rate FROM meetings WHERE id=?').get(id)!;
    const bytes = Number(this.statement('SELECT SUM(length(data)) AS bytes FROM meeting_audio_chunks WHERE meeting_id=?').get(id)!.bytes);
    this.run("UPDATE meetings SET status='en_cola',progress=0,error=NULL,duration_s=COALESCE(?,duration_s),updated_at=? WHERE id=?", format.audio_format === 'pcm_s16le' ? Math.ceil(bytes / (Number(format.sample_rate) * 2)) : null, new Date().toISOString(), id);
  }
  retry(id: string): void {
    const meeting = this.get(id); if (meeting.status !== 'error' || !meeting.chunkCount) throw new Error('Esta grabación no se puede reintentar.');
    this.setStatus(id, 'en_cola');
  }
  setStatus(id: string, status: string, error: string | null = null, progress = 0): void {
    this.run('UPDATE meetings SET status=?,progress=?,error=?,updated_at=? WHERE id=?', status, Math.max(0, Math.min(100, progress)), error, new Date().toISOString(), id);
  }
  setProgress(id: string, progress: number): void { this.run('UPDATE meetings SET progress=? WHERE id=?', Math.max(0, Math.min(99, progress)), id); }
  saveTranscription(id: string, segments: Segment[], seconds: number, autoSummary: boolean): void {
    this.transaction(() => {
      this.run('DELETE FROM meeting_segments WHERE meeting_id=?', id);
      const insert = this.statement('INSERT INTO meeting_segments VALUES(?,?,?,?,?)');
      for (const segment of segments) insert.run(id, segment.seq, segment.startMs, segment.endMs, segment.text);
      this.run("UPDATE meetings SET status='listo',progress=100,error=NULL,transcribe_seconds=?,duration_s=COALESCE(NULLIF(duration_s,0),?),updated_at=? WHERE id=?", seconds, segments.length ? Math.ceil(segments.at(-1)!.endMs / 1000) : null, new Date().toISOString(), id);
      if (autoSummary && segments.length) this.setSummaryStatus(id, 'queued');
    });
  }
  setSummaryStatus(id: string, status: string, error: string | null = null): void { this.run('INSERT INTO meeting_summaries(meeting_id,status,error) VALUES(?,?,?) ON CONFLICT(meeting_id) DO UPDATE SET status=excluded.status,error=excluded.error', id, status, error); }
  saveSummary(id: string, document: SummaryDocument, model: string): void {
    this.run("INSERT INTO meeting_summaries(meeting_id,status,document,model,generated_at) VALUES(?,'ready',?,?,?) ON CONFLICT(meeting_id) DO UPDATE SET status='ready',error=NULL,document=excluded.document,model=excluded.model,generated_at=excluded.generated_at", id, JSON.stringify(document), model, new Date().toISOString());
  }
  remove(id: string): void { this.run('DELETE FROM meetings WHERE id=?', id); }
  recover(): void {
    this.transaction(() => {
      this.run("UPDATE meetings SET status='interrumpida',updated_at=? WHERE status='grabando'", new Date().toISOString());
      this.run("UPDATE meetings SET status='en_cola',progress=0,updated_at=? WHERE status='transcribiendo'", new Date().toISOString());
      this.db.exec("UPDATE meeting_summaries SET status='queued',error=NULL WHERE status='running'");
    });
  }
  writeAudio(id: string, path: string): void {
    const row = this.statement('SELECT audio_format,sample_rate FROM meetings WHERE id=?').get(id);
    if (!row) throw new Error('Grabación inexistente.');
    const bytes = Number(this.statement('SELECT COALESCE(SUM(length(data)),0) AS bytes FROM meeting_audio_chunks WHERE meeting_id=?').get(id)!.bytes);
    if (!bytes) throw new Error('La grabación no tiene audio.');
    const file = openSync(path, 'w');
    try {
      if (row.audio_format === 'pcm_s16le') {
        if (bytes > 0xffffffff - 36) throw new Error('El audio excede el límite WAV de 4 GB.');
        const rate = Number(row.sample_rate), header = Buffer.alloc(44);
        header.write('RIFF',0); header.writeUInt32LE(bytes+36,4); header.write('WAVEfmt ',8); header.writeUInt32LE(16,16); header.writeUInt16LE(1,20); header.writeUInt16LE(1,22); header.writeUInt32LE(rate,24); header.writeUInt32LE(rate*2,28); header.writeUInt16LE(2,32); header.writeUInt16LE(16,34); header.write('data',36); header.writeUInt32LE(bytes,40); writeSync(file,header);
      }
      for (const chunk of this.statement('SELECT data FROM meeting_audio_chunks WHERE meeting_id=? ORDER BY seq').iterate(id)) {
        const data = chunk.data; if (!(data instanceof Uint8Array)) throw new Error('Audio guardado inválido.');
        let offset = 0; while (offset < data.byteLength) offset += writeSync(file, data, offset, data.byteLength - offset);
      }
    } finally { closeSync(file); }
  }
  async importFrom(path: string): Promise<number> {
    if (resolve(path) === this.path || !existsSync(path)) throw new Error('Selecciona otra base existente.');
    const source = new DatabaseSync(path, { readOnly: true, timeout: 10000 });
    const directory = mkdtempSync(join(tmpdir(), 'neenemi-import-'));
    let attached = false;
    try {
      const dcss = !!source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
      if (!dcss) this.rejectIncompatible(source);
      const version = dcss ? 1 : Number(source.prepare('PRAGMA user_version').get()!.user_version);
      if (![1,2].includes(version) || !source.prepare('PRAGMA table_info(meetings)').all().some(row => row.name === 'transcribe_seconds')) throw new Error('El origen no contiene grabaciones compatibles.');
      const snapshot = join(directory, 'snapshot.sqlite'); await backup(source, snapshot);
      this.db.prepare('ATTACH DATABASE ? AS incoming').run(snapshot); attached = true;
      return this.transaction(() => {
        this.db.exec('CREATE TEMP TABLE imported_ids(id TEXT PRIMARY KEY); INSERT INTO imported_ids SELECT id FROM incoming.meetings WHERE id NOT IN (SELECT id FROM main.meetings);');
        const count = Number(this.db.prepare('SELECT COUNT(*) AS count FROM imported_ids').get()!.count);
        this.db.exec('INSERT OR IGNORE INTO customers SELECT id,name,normalized_name,created_at,updated_at FROM incoming.customers; INSERT OR IGNORE INTO equipment_models SELECT id,brand,model_name,normalized_name,is_active,created_at,updated_at FROM incoming.equipment_models;');
        if (this.db.prepare('SELECT 1 FROM incoming.meetings m JOIN imported_ids i ON i.id=m.id WHERE m.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers d JOIN incoming.customers c ON d.normalized_name=c.normalized_name WHERE c.id=m.customer_id)').get()) throw new Error('Hay asociaciones históricas incompatibles. Importación cancelada.');
        const formats = version === 2 ? 'm.audio_format,m.sample_rate' : "'webm',16000";
        this.db.exec(`INSERT INTO meetings(id,title,recorded_at,duration_s,customer_id,status,progress,error,transcribe_seconds,created_at,updated_at,audio_format,sample_rate)
SELECT m.id,m.title,m.recorded_at,m.duration_s,(SELECT d.id FROM customers d JOIN incoming.customers c ON d.normalized_name=c.normalized_name WHERE c.id=m.customer_id LIMIT 1),CASE m.status WHEN 'grabando' THEN 'interrumpida' WHEN 'transcribiendo' THEN 'en_cola' WHEN 'resumiendo' THEN 'en_cola' ELSE m.status END,CASE WHEN m.status IN ('transcribiendo','resumiendo') THEN 0 ELSE m.progress END,m.error,m.transcribe_seconds,m.created_at,m.updated_at,${formats} FROM incoming.meetings m JOIN imported_ids i ON i.id=m.id;
INSERT INTO meeting_audio_chunks SELECT c.* FROM incoming.meeting_audio_chunks c JOIN imported_ids i ON i.id=c.meeting_id;
INSERT INTO meeting_segments SELECT s.* FROM incoming.meeting_segments s JOIN imported_ids i ON i.id=s.meeting_id;`);
        if (version === 2) this.db.exec("INSERT INTO meeting_summaries SELECT s.meeting_id,CASE s.status WHEN 'running' THEN 'queued' ELSE s.status END,s.error,s.document,s.model,s.generated_at FROM incoming.meeting_summaries s JOIN imported_ids i ON i.id=s.meeting_id;");
        this.db.exec('DROP TABLE imported_ids'); return count;
      });
    } finally { if (attached) this.db.exec('DETACH DATABASE incoming'); source.close(); rmSync(directory, { recursive:true, force:true }); }
  }
  close(): void { this.statements.clear(); this.db.close(); }
}
