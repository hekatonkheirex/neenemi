using System.Buffers.Binary;
using Microsoft.Data.Sqlite;
using Neenemi.Core;
using Xunit;

namespace Neenemi.Core.Tests;

public sealed class RepositoryTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "neenemi-tests-" + Guid.NewGuid());
    public RepositoryTests() => Directory.CreateDirectory(directory);
    private string Db(string name) => Path.Combine(directory, name + ".sqlite");
    private static void Sql(string path, string sql)
    {
        using var db = new SqliteConnection($"Data Source={path};Pooling=False"); db.Open();
        using var cmd = db.CreateCommand(); cmd.CommandText = sql; cmd.ExecuteNonQuery();
    }
    [Fact]
    public void MigrationKeepsHistoricalAssociationsAndAudio()
    {
        string path = Db("historical");
        _ = new MeetingsRepository(path);
        Sql(path, """
            DROP TABLE meeting_summaries; ALTER TABLE meetings DROP COLUMN audio_format; ALTER TABLE meetings DROP COLUMN sample_rate; PRAGMA user_version=1;
            INSERT INTO customers VALUES('c','Cliente','cliente','date','date');
            INSERT INTO meetings(id,title,recorded_at,customer_id,status,created_at,updated_at) VALUES('old','Anterior','date','c','listo','date','date');
            INSERT INTO meeting_audio_chunks VALUES('old',0,x'01020304');
            INSERT INTO meeting_segments VALUES('old',0,0,1000,'Acuerdo histórico');
            """);
        var repo = new MeetingsRepository(path);
        Assert.Equal("Acuerdo histórico", repo.GetDetail("old")!.Segments[0].Text);
        string audio = Path.Combine(directory, "old.webm"); repo.WriteAudioTo("old", audio);
        Assert.Equal(new byte[] { 1, 2, 3, 4 }, File.ReadAllBytes(audio));
        using var db = new SqliteConnection($"Data Source={path};Pooling=False"); db.Open();
        using var cmd = db.CreateCommand(); cmd.CommandText = "SELECT customer_id FROM meetings WHERE id='old'";
        Assert.Equal("c", cmd.ExecuteScalar());
        Assert.True(File.Exists(path + ".before-native-v2.bak"));
    }
    [Fact]
    public void EmptyRecordingCannotQueueAndFinalPcmIsValidWav()
    {
        var repo = new MeetingsRepository(Db("pcm"));
        var m = repo.Create("Nombre");
        Assert.Throws<InvalidOperationException>(() => repo.FinishRecording(m.Id, 1));
        repo.AddChunk(m.Id, 0, [1, 0, 2, 0]); repo.AddChunk(m.Id, 1, [3, 0]);
        repo.FinishRecording(m.Id, 1);
        Assert.Throws<InvalidOperationException>(() => repo.AddChunk(m.Id, 2, [4, 0]));
        string audio = Path.Combine(directory, "pcm.wav"); repo.WriteAudioTo(m.Id, audio);
        byte[] data = File.ReadAllBytes(audio);
        Assert.Equal(6u, BinaryPrimitives.ReadUInt32LittleEndian(data.AsSpan(40)));
        Assert.Equal(16000, BinaryPrimitives.ReadInt32LittleEndian(data.AsSpan(24)));
        Assert.Equal(new byte[] { 1, 0, 2, 0, 3, 0 }, data[44..]);
    }
    [Fact]
    public void RestartPreservesChunksAndResumesBothJobTypes()
    {
        string path = Db("restart");
        var repo = new MeetingsRepository(path);
        var interrupted = repo.Create("Interrumpida"); repo.AddChunk(interrupted.Id, 0, [1, 0]);
        var running = repo.Create("Procesando"); repo.AddChunk(running.Id, 0, [2, 0]); repo.FinishRecording(running.Id, 1); repo.SetStatus(running.Id, "transcribiendo", 75);
        var ready = repo.Create("Resumen"); repo.AddChunk(ready.Id, 0, [3, 0]); repo.FinishRecording(ready.Id, 1);
        repo.SaveTranscription(ready.Id, [new(0, 0, 1000, "Texto")], 1, false); repo.SetSummaryStatus(ready.Id, "running");
        Assert.Equal(new[] { running.Id }, repo.RecoverAfterRestart());
        Assert.Equal("interrumpida", repo.Get(interrupted.Id)!.Status);
        Assert.Equal(1, repo.Get(interrupted.Id)!.ChunkCount);
        Assert.Equal(0, repo.Get(running.Id)!.Progress);
        Assert.Equal(new[] { ready.Id }, repo.PendingSummaries());
    }
    [Fact]
    public void FailedRegenerationKeepsPreviousSummaryAndTranscript()
    {
        var repo = new MeetingsRepository(Db("summary"));
        var m = repo.Create("Reunión"); repo.AddChunk(m.Id, 0, [1, 0]); repo.FinishRecording(m.Id, 1);
        repo.SaveTranscription(m.Id, [new(0, 0, 1000, "Aprobamos la compra")], 1, false);
        var summary = new SummaryDocument("Compra aprobada", [], [new("Comprar", [0])], []);
        repo.SaveSummary(m.Id, summary, "qwen3:4b"); repo.SetSummaryStatus(m.Id, "running"); repo.SetSummaryStatus(m.Id, "error", "Sin memoria");
        var detail = repo.GetDetail(m.Id)!;
        Assert.Equal("listo", detail.Meeting.Status);
        Assert.Equal("error", detail.Meeting.SummaryStatus);
        Assert.Equal("Compra aprobada", detail.Summary!.Document.Overview);
        Assert.Equal("Aprobamos la compra", detail.Segments[0].Text);
    }
    [Fact]
    public void ImportSkipsExistingIdsAndLeavesSourceUnchanged()
    {
        string sourcePath = Db("source");
        var source = new MeetingsRepository(sourcePath);
        var m = source.Create("Origen"); source.AddChunk(m.Id, 0, [1, 0]); source.FinishRecording(m.Id, 1);
        source.SaveTranscription(m.Id, [new(0, 0, 1000, "Dato original")], 1, false);
        var target = new MeetingsRepository(Db("target"));
        Assert.Equal(1, target.ImportFrom(sourcePath));
        Sql(Db("target"), $"UPDATE meetings SET title='Destino' WHERE id='{m.Id}'");
        Assert.Equal(0, target.ImportFrom(sourcePath));
        Assert.Equal("Destino", target.Get(m.Id)!.Title);
        Assert.Equal("Dato original", target.GetDetail(m.Id)!.Segments[0].Text);
        Assert.Equal("Origen", source.Get(m.Id)!.Title);
    }
    [Fact]
    public void RejectsDcssWithoutChangingItsVersion()
    {
        string path = Db("dcss"); Sql(path, "CREATE TABLE schema_migrations(version INTEGER); PRAGMA user_version=42;");
        Assert.Throws<InvalidOperationException>(() => new MeetingsRepository(path));
        using var db = new SqliteConnection($"Data Source={path};Pooling=False"); db.Open();
        using var cmd = db.CreateCommand(); cmd.CommandText = "PRAGMA user_version"; Assert.Equal(42L, cmd.ExecuteScalar());
    }
    [Fact]
    public void DcssImportCopiesOnlyRecordingDataAndKeepsSourceIntact()
    {
        string sourcePath = Db("dcss-recordings");
        _ = new MeetingsRepository(sourcePath);
        Sql(sourcePath, """
            CREATE TABLE schema_migrations(version INTEGER); INSERT INTO schema_migrations VALUES(46);
            ALTER TABLE customers ADD COLUMN secret_note TEXT;
            ALTER TABLE meetings ADD COLUMN old_summary TEXT;
            INSERT INTO customers(id,name,normalized_name,created_at,updated_at,secret_note) VALUES('c','Cliente','cliente','date','date','No importar');
            INSERT INTO meetings(id,title,recorded_at,customer_id,status,created_at,updated_at) VALUES('m','Histórica','date','c','grabando','date','date');
            INSERT INTO meeting_audio_chunks VALUES('m',0,x'01020304');
            INSERT INTO meeting_segments VALUES('m',0,0,1000,'Conservado');
            """);
        var target = new MeetingsRepository(Db("dcss-destination"));
        Assert.Equal(1, target.ImportFrom(sourcePath));
        Assert.Equal("interrumpida", target.Get("m")!.Status);
        Assert.Equal("Conservado", target.GetDetail("m")!.Segments[0].Text);
        using var source = new SqliteConnection($"Data Source={sourcePath};Pooling=False"); source.Open();
        using var cmd = source.CreateCommand(); cmd.CommandText = "SELECT status FROM meetings WHERE id='m'";
        Assert.Equal("grabando", cmd.ExecuteScalar());
    }
    [Fact]
    public void AutoSummarySurvivesRestartBetweenTranscriptionAndScheduling()
    {
        string path = Db("durable-summary");
        string id;
        var repo = new MeetingsRepository(path);
        var m = repo.Create("Terminada"); id = m.Id;
        repo.AddChunk(id, 0, [1, 0]); repo.FinishRecording(id, 1);
        repo.SaveTranscription(id, [new(0, 0, 1000, "Acuerdo conservado")], 1, true);
        var reopened = new MeetingsRepository(path);
        reopened.RecoverAfterRestart();
        Assert.Equal(new[] { id }, reopened.PendingSummaries());
        Assert.Equal("Acuerdo conservado", reopened.GetDetail(id)!.Segments[0].Text);
    }
    public void Dispose() => Directory.Delete(directory, true);
}
