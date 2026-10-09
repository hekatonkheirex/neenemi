using System.Buffers.Binary;
using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace Neenemi.Core;

public sealed class MeetingsRepository
{
    private readonly string path;
    private readonly object gate = new();
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private const string Schema = """
        CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,normalized_name TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS equipment_models(id TEXT PRIMARY KEY,brand TEXT NOT NULL,model_name TEXT NOT NULL,normalized_name TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(brand,normalized_name));
        CREATE TABLE IF NOT EXISTS meetings(id TEXT PRIMARY KEY,title TEXT NOT NULL,recorded_at TEXT NOT NULL,duration_s INTEGER,customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,status TEXT NOT NULL CHECK(status IN ('grabando','interrumpida','en_cola','transcribiendo','listo','error')),progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),error TEXT,transcribe_seconds INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS meeting_audio_chunks(meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,seq INTEGER NOT NULL CHECK(seq >= 0),data BLOB NOT NULL,PRIMARY KEY(meeting_id,seq));
        CREATE TABLE IF NOT EXISTS meeting_segments(meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,seq INTEGER NOT NULL CHECK(seq >= 0),start_ms INTEGER NOT NULL,end_ms INTEGER NOT NULL,text TEXT NOT NULL,PRIMARY KEY(meeting_id,seq));
        """;
    private const string Select = """
        SELECT m.id,m.title,m.recorded_at,m.duration_s,m.status,m.progress,m.error,m.transcribe_seconds,
        (SELECT COUNT(*) FROM meeting_audio_chunks c WHERE c.meeting_id=m.id),m.created_at,m.updated_at,
        COALESCE(s.status,'none'),s.error FROM meetings m LEFT JOIN meeting_summaries s ON s.meeting_id=m.id
        """;

    public MeetingsRepository(string databasePath)
    {
        path = Path.GetFullPath(databasePath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        using var db = Open();
        RejectIncompatible(db);
        int version = Convert.ToInt32(Scalar(db, "PRAGMA user_version"));
        if (version == 1)
        {
            string backup = path + ".before-native-v2.bak";
            if (!File.Exists(backup))
            {
                using var copy = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = backup, Pooling = false }.ToString());
                copy.Open();
                db.BackupDatabase(copy);
            }
        }
        using var tx = db.BeginTransaction();
        Exec(db, Schema, tx);
        if (!HasColumn(db, "meetings", "audio_format", tx)) Exec(db, "ALTER TABLE meetings ADD COLUMN audio_format TEXT NOT NULL DEFAULT 'webm'", tx);
        if (!HasColumn(db, "meetings", "sample_rate", tx)) Exec(db, "ALTER TABLE meetings ADD COLUMN sample_rate INTEGER NOT NULL DEFAULT 16000", tx);
        Exec(db, """
            CREATE TABLE IF NOT EXISTS meeting_summaries(meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'none' CHECK(status IN ('none','queued','running','ready','error')),error TEXT,document TEXT,model TEXT,generated_at TEXT);
            PRAGMA user_version=2;
            """, tx);
        tx.Commit();
        Exec(db, "PRAGMA journal_mode=WAL");
    }

    private SqliteConnection Open(bool readOnly = false, string? source = null)
    {
        var db = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = source ?? path, Mode = readOnly ? SqliteOpenMode.ReadOnly : SqliteOpenMode.ReadWriteCreate,
            Pooling = false, DefaultTimeout = 10
        }.ToString());
        db.Open();
        Exec(db, "PRAGMA foreign_keys=ON");
        return db;
    }

    private static void RejectIncompatible(SqliteConnection db)
    {
        if (Convert.ToInt32(Scalar(db, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations'")) != 0)
            throw new InvalidOperationException("Esta es una base DCSS, no una base de Ñe'eñemi.");
        if (Convert.ToInt32(Scalar(db, "PRAGMA user_version")) > 2)
            throw new InvalidOperationException("La base pertenece a una versión posterior de Ñe'eñemi.");
    }

    private static SqliteCommand Command(SqliteConnection db, string sql, SqliteTransaction? tx = null, params object?[] values)
    {
        var cmd = db.CreateCommand();
        cmd.CommandText = sql;
        cmd.Transaction = tx;
        for (int i = 0; i < values.Length; i++) cmd.Parameters.AddWithValue("$" + i, values[i] ?? DBNull.Value);
        return cmd;
    }
    private static void Exec(SqliteConnection db, string sql, SqliteTransaction? tx = null, params object?[] values)
    {
        using var cmd = Command(db, sql, tx, values);
        cmd.ExecuteNonQuery();
    }
    private static object? Scalar(SqliteConnection db, string sql, SqliteTransaction? tx = null, params object?[] values)
    {
        using var cmd = Command(db, sql, tx, values);
        return cmd.ExecuteScalar();
    }
    private static bool HasColumn(SqliteConnection db, string table, string column, SqliteTransaction? tx = null)
    {
        using var cmd = Command(db, $"PRAGMA table_info({table})", tx);
        using var reader = cmd.ExecuteReader();
        while (reader.Read()) if (reader.GetString(1) == column) return true;
        return false;
    }
    private static string Now() => DateTimeOffset.UtcNow.ToString("O");
    private static string? Text(SqliteDataReader r, int i) => r.IsDBNull(i) ? null : r.GetString(i);
    private static int? Number(SqliteDataReader r, int i) => r.IsDBNull(i) ? null : r.GetInt32(i);
    private static Meeting ReadMeeting(SqliteDataReader r) => new(r.GetString(0), r.GetString(1), r.GetString(2), Number(r, 3), r.GetString(4), r.GetInt32(5), Text(r, 6), Number(r, 7), r.GetInt32(8), r.GetString(9), r.GetString(10), r.GetString(11), Text(r, 12));

    public Meeting Create(string title, int sampleRate = 16000)
    {
        if (sampleRate < 8000 || sampleRate > 192000) throw new ArgumentOutOfRangeException(nameof(sampleRate));
        title = title.Trim();
        if (title.Length > 300) throw new ArgumentException("El nombre admite hasta 300 caracteres.");
        if (title.Length == 0) title = "Grabación " + DateTime.Now.ToString("dd/MM/yyyy HH:mm");
        lock (gate)
        {
            string id = Guid.NewGuid().ToString();
            string now = Now();
            using var db = Open();
            Exec(db, "INSERT INTO meetings(id,title,recorded_at,status,created_at,updated_at,audio_format,sample_rate) VALUES($0,$1,$2,'grabando',$2,$2,'pcm_s16le',$3)", null, id, title, now, sampleRate);
            return Get(id)!;
        }
    }
    public IReadOnlyList<Meeting> List()
    {
        lock (gate)
        {
            using var db = Open();
            using var cmd = Command(db, Select + " ORDER BY m.created_at DESC,m.rowid DESC");
            using var r = cmd.ExecuteReader();
            var rows = new List<Meeting>();
            while (r.Read()) rows.Add(ReadMeeting(r));
            return rows;
        }
    }
    public Meeting? Get(string id)
    {
        lock (gate)
        {
            using var db = Open();
            using var cmd = Command(db, Select + " WHERE m.id=$0", null, id);
            using var r = cmd.ExecuteReader();
            return r.Read() ? ReadMeeting(r) : null;
        }
    }
    public MeetingDetail? GetDetail(string id)
    {
        lock (gate)
        {
            var meeting = Get(id);
            if (meeting is null) return null;
            using var db = Open();
            var segments = new List<TranscriptSegment>();
            using (var cmd = Command(db, "SELECT seq,start_ms,end_ms,text FROM meeting_segments WHERE meeting_id=$0 ORDER BY seq", null, id))
            using (var r = cmd.ExecuteReader()) while (r.Read()) segments.Add(new(r.GetInt32(0), r.GetInt32(1), r.GetInt32(2), r.GetString(3)));
            StoredSummary? summary = null;
            using (var cmd = Command(db, "SELECT document,model,generated_at FROM meeting_summaries WHERE meeting_id=$0 AND document IS NOT NULL", null, id))
            using (var r = cmd.ExecuteReader()) if (r.Read()) summary = new(JsonSerializer.Deserialize<SummaryDocument>(r.GetString(0), Json)!, r.GetString(1), r.GetString(2));
            return new(meeting, segments, summary);
        }
    }
    public void AddChunk(string id, int seq, byte[] pcmData)
    {
        if (seq < 0 || pcmData.Length == 0 || pcmData.Length % 2 != 0) throw new ArgumentException("Bloque PCM inválido.");
        lock (gate)
        {
            var meeting = Get(id) ?? throw new InvalidOperationException("Grabación inexistente.");
            if (meeting.Status != "grabando") throw new InvalidOperationException("La grabación está cerrada.");
            using var db = Open();
            Exec(db, "INSERT INTO meeting_audio_chunks(meeting_id,seq,data) VALUES($0,$1,$2)", null, id, seq, pcmData);
        }
    }
    public void FinishRecording(string id, int? durationS)
    {
        lock (gate)
        {
            var m = Get(id) ?? throw new InvalidOperationException("Grabación inexistente.");
            if (m.Status is not ("grabando" or "interrumpida")) throw new InvalidOperationException("La grabación ya está cerrada.");
            if (m.ChunkCount == 0) throw new InvalidOperationException("No se conservó audio para procesar.");
            using var db = Open();
            Exec(db, "UPDATE meetings SET status='en_cola',progress=0,error=NULL,duration_s=COALESCE($1,duration_s),updated_at=$2 WHERE id=$0", null, id, durationS, Now());
        }
    }
    public void Retry(string id)
    {
        lock (gate)
        {
            var m = Get(id) ?? throw new InvalidOperationException("Grabación inexistente.");
            if (m.Status != "error" || m.ChunkCount == 0) throw new InvalidOperationException("Esta grabación no se puede reintentar.");
            SetStatus(id, "en_cola");
        }
    }
    public void SetStatus(string id, string status, int progress = 0, string? error = null)
    {
        lock (gate)
        {
            using var db = Open();
            Exec(db, "UPDATE meetings SET status=$1,progress=$2,error=$3,updated_at=$4 WHERE id=$0", null, id, status, Math.Clamp(progress, 0, 100), error, Now());
        }
    }
    public void SetProgress(string id, int progress)
    {
        lock (gate) { using var db = Open(); Exec(db, "UPDATE meetings SET progress=$1 WHERE id=$0", null, id, Math.Clamp(progress, 0, 99)); }
    }
    public void SaveTranscription(string id, IReadOnlyList<TranscriptSegment> segments, int seconds, bool queueSummary)
    {
        lock (gate)
        {
            using var db = Open();
            using var tx = db.BeginTransaction();
            Exec(db, "DELETE FROM meeting_segments WHERE meeting_id=$0", tx, id);
            using var insert = Command(db, "INSERT INTO meeting_segments(meeting_id,seq,start_ms,end_ms,text) VALUES($0,$1,$2,$3,$4)", tx, id, 0, 0, 0, "");
            foreach (var s in segments)
            {
                insert.Parameters[1].Value = s.Seq; insert.Parameters[2].Value = s.StartMs;
                insert.Parameters[3].Value = s.EndMs; insert.Parameters[4].Value = s.Text;
                insert.ExecuteNonQuery();
            }
            int? duration = segments.Count == 0 ? null : (segments[^1].EndMs + 999) / 1000;
            Exec(db, "UPDATE meetings SET status='listo',progress=100,error=NULL,transcribe_seconds=$1,duration_s=COALESCE(NULLIF(duration_s,0),$2),updated_at=$3 WHERE id=$0", tx, id, seconds, duration, Now());
            if (queueSummary && segments.Count > 0) SetSummaryStatus(db, tx, id, "queued", null);
            tx.Commit();
        }
    }
    public string GetAudioFormat(string id)
    {
        lock (gate) { using var db = Open(); return (string?)Scalar(db, "SELECT audio_format FROM meetings WHERE id=$0", null, id) ?? throw new InvalidOperationException("Grabación inexistente."); }
    }
    public void WriteAudioTo(string id, string destination)
    {
        lock (gate)
        {
            using var db = Open();
            long bytes = Convert.ToInt64(Scalar(db, "SELECT COALESCE(SUM(length(data)),0) FROM meeting_audio_chunks WHERE meeting_id=$0", null, id));
            if (bytes == 0) throw new InvalidOperationException("La grabación no tiene audio.");
            using var output = new FileStream(destination, FileMode.Create, FileAccess.Write);
            if (GetAudioFormat(id) == "pcm_s16le")
            {
                if (bytes > uint.MaxValue - 36) throw new InvalidOperationException("El audio excede el límite WAV de 4 GB.");
                int rate = Convert.ToInt32(Scalar(db, "SELECT sample_rate FROM meetings WHERE id=$0", null, id));
                Span<byte> header = stackalloc byte[44];
                "RIFF"u8.CopyTo(header); BinaryPrimitives.WriteUInt32LittleEndian(header[4..], (uint)bytes + 36);
                "WAVEfmt "u8.CopyTo(header[8..]); BinaryPrimitives.WriteInt32LittleEndian(header[16..], 16);
                BinaryPrimitives.WriteInt16LittleEndian(header[20..], 1); BinaryPrimitives.WriteInt16LittleEndian(header[22..], 1);
                BinaryPrimitives.WriteInt32LittleEndian(header[24..], rate); BinaryPrimitives.WriteInt32LittleEndian(header[28..], rate * 2);
                BinaryPrimitives.WriteInt16LittleEndian(header[32..], 2); BinaryPrimitives.WriteInt16LittleEndian(header[34..], 16);
                "data"u8.CopyTo(header[36..]); BinaryPrimitives.WriteUInt32LittleEndian(header[40..], (uint)bytes);
                output.Write(header);
            }
            using var cmd = Command(db, "SELECT rowid FROM meeting_audio_chunks WHERE meeting_id=$0 ORDER BY seq", null, id);
            using var r = cmd.ExecuteReader();
            while (r.Read()) { using var blob = new SqliteBlob(db, "meeting_audio_chunks", "data", r.GetInt64(0), true); blob.CopyTo(output); }
        }
    }
    public void Remove(string id)
    {
        lock (gate) { using var db = Open(); Exec(db, "DELETE FROM meetings WHERE id=$0", null, id); }
    }
    public void SetSummaryStatus(string id, string status, string? error = null)
    {
        lock (gate)
        {
            using var db = Open();
            SetSummaryStatus(db, null, id, status, error);
        }
    }
    private static void SetSummaryStatus(SqliteConnection db, SqliteTransaction? tx, string id, string status, string? error) =>
        Exec(db, "INSERT INTO meeting_summaries(meeting_id,status,error) VALUES($0,$1,$2) ON CONFLICT(meeting_id) DO UPDATE SET status=excluded.status,error=excluded.error", tx, id, status, error);
    public void SaveSummary(string id, SummaryDocument doc, string model)
    {
        lock (gate)
        {
            using var db = Open();
            Exec(db, "INSERT INTO meeting_summaries(meeting_id,status,document,model,generated_at) VALUES($0,'ready',$1,$2,$3) ON CONFLICT(meeting_id) DO UPDATE SET status='ready',error=NULL,document=excluded.document,model=excluded.model,generated_at=excluded.generated_at", null, id, JsonSerializer.Serialize(doc, Json), model, Now());
        }
    }
    public IReadOnlyList<string> RecoverAfterRestart()
    {
        lock (gate)
        {
            using var db = Open();
            using var tx = db.BeginTransaction();
            Exec(db, "UPDATE meetings SET status='interrumpida',updated_at=$0 WHERE status='grabando'", tx, Now());
            Exec(db, "UPDATE meetings SET status='en_cola',progress=0,updated_at=$0 WHERE status='transcribiendo'", tx, Now());
            Exec(db, "UPDATE meeting_summaries SET status='queued',error=NULL WHERE status='running'", tx);
            tx.Commit();
            return List().Where(m => m.Status == "en_cola").Reverse().Select(m => m.Id).ToArray();
        }
    }
    public IReadOnlyList<string> PendingSummaries() => List().Where(m => m.SummaryStatus == "queued" && m.Status == "listo").Reverse().Select(m => m.Id).ToArray();

    public int ImportFrom(string sourcePath)
    {
        sourcePath = Path.GetFullPath(sourcePath);
        if (sourcePath == path || !File.Exists(sourcePath)) throw new InvalidOperationException("Selecciona otra base existente de Ñe'eñemi.");
        lock (gate)
        {
            using var source = Open(true, sourcePath);
            bool dcss = Convert.ToInt32(Scalar(source, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations'")) != 0;
            if (!dcss) RejectIncompatible(source);
            int version = dcss ? 1 : Convert.ToInt32(Scalar(source, "PRAGMA user_version"));
            if (version is not (1 or 2) || !HasColumn(source, "meetings", "transcribe_seconds"))
                throw new InvalidOperationException("El origen no contiene grabaciones compatibles de Ñe'eñemi o DCSS.");
            // Snapshot includes committed WAL data and leaves the selected source untouched.
            string snapshot = Path.Combine(Path.GetTempPath(), "neenemi-import-" + Guid.NewGuid() + ".sqlite");
            try
            {
                using (var copy = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = snapshot, Pooling = false }.ToString()))
                { copy.Open(); source.BackupDatabase(copy); }
                using var db = Open();
                Exec(db, "ATTACH DATABASE $0 AS incoming", null, snapshot);
                using var tx = db.BeginTransaction();
                Exec(db, "CREATE TEMP TABLE imported_ids(id TEXT PRIMARY KEY); INSERT INTO imported_ids SELECT id FROM incoming.meetings WHERE id NOT IN (SELECT id FROM main.meetings)", tx);
                int count = Convert.ToInt32(Scalar(db, "SELECT COUNT(*) FROM imported_ids", tx));
                Exec(db, "INSERT OR IGNORE INTO customers(id,name,normalized_name,created_at,updated_at) SELECT id,name,normalized_name,created_at,updated_at FROM incoming.customers; INSERT OR IGNORE INTO equipment_models(id,brand,model_name,normalized_name,is_active,created_at,updated_at) SELECT id,brand,model_name,normalized_name,is_active,created_at,updated_at FROM incoming.equipment_models", tx);
                if (Convert.ToInt32(Scalar(db, "SELECT COUNT(*) FROM incoming.meetings m JOIN imported_ids i ON i.id=m.id WHERE m.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers d JOIN incoming.customers c ON d.normalized_name=c.normalized_name WHERE c.id=m.customer_id)", tx)) != 0)
                    throw new InvalidOperationException("Hay asociaciones históricas incompatibles. La importación se canceló sin modificar el destino.");
                string columns = "id,title,recorded_at,duration_s,customer_id,status,progress,error,transcribe_seconds,created_at,updated_at";
                string formats = version == 2 ? ",audio_format,sample_rate" : ",'webm',16000";
                // Map conflicting normalized catalog names to the destination id, without overwriting it.
                Exec(db, $"""
                    INSERT INTO meetings({columns},audio_format,sample_rate)
                    SELECT m.id,m.title,m.recorded_at,m.duration_s,
                    (SELECT d.id FROM customers d JOIN incoming.customers c ON d.normalized_name=c.normalized_name WHERE c.id=m.customer_id LIMIT 1),
                    CASE m.status WHEN 'grabando' THEN 'interrumpida' WHEN 'transcribiendo' THEN 'en_cola' WHEN 'resumiendo' THEN 'en_cola' ELSE m.status END,
                    CASE WHEN m.status IN ('transcribiendo','resumiendo') THEN 0 ELSE m.progress END,m.error,m.transcribe_seconds,m.created_at,m.updated_at{formats}
                    FROM incoming.meetings m JOIN imported_ids i ON i.id=m.id;
                    INSERT INTO meeting_audio_chunks SELECT c.* FROM incoming.meeting_audio_chunks c JOIN imported_ids i ON i.id=c.meeting_id;
                    INSERT INTO meeting_segments SELECT s.* FROM incoming.meeting_segments s JOIN imported_ids i ON i.id=s.meeting_id;
                    """, tx);
                if (version == 2) Exec(db, "INSERT INTO meeting_summaries SELECT s.meeting_id,CASE s.status WHEN 'running' THEN 'queued' ELSE s.status END,s.error,s.document,s.model,s.generated_at FROM incoming.meeting_summaries s JOIN imported_ids i ON i.id=s.meeting_id", tx);
                tx.Commit();
                return count;
            }
            finally { File.Delete(snapshot); }
        }
    }
}
