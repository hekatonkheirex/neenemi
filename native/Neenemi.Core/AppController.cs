using System.Diagnostics;

namespace Neenemi.Core;

public sealed class AppController : IAsyncDisposable
{
    private sealed record Job(string Id, bool Summary);
    private readonly IAudioRecorder recorder;
    private readonly ITranscriber transcriber;
    private readonly ISummarizer summarizer;
    private readonly AppOptions options;
    private readonly object gate = new();
    private readonly Queue<Job> queue = new();
    private readonly SemaphoreSlim recordingGate = new(1, 1);
    private readonly SemaphoreSlim playbackGate = new(1, 1);
    private readonly CancellationTokenSource playbackCancellation = new();
    private readonly string playbackDirectory = Path.Combine(Path.GetTempPath(), "neenemi-playback-" + Guid.NewGuid());
    private Task worker = Task.CompletedTask;
    private bool working;
    private bool stopping;
    private bool needsUnload;
    private Job? current;
    private CancellationTokenSource? currentCancellation;
    private TaskCompletionSource? currentFinished;
    private readonly HashSet<string> deleting = new();
    public MeetingsRepository Repository { get; }
    public string? RecordingId { get; private set; }
    public bool IsRecording => RecordingId is not null;
    public event Action? Changed;

    public AppController(MeetingsRepository repository, IAudioRecorder recorder, ITranscriber transcriber, ISummarizer summarizer, AppOptions options)
    {
        Repository = repository; this.recorder = recorder; this.transcriber = transcriber; this.summarizer = summarizer; this.options = options;
        Directory.CreateDirectory(playbackDirectory);
    }
    public Task InitializeAsync()
    {
        foreach (string id in Repository.RecoverAfterRestart()) Enqueue(new(id, false));
        foreach (string id in Repository.PendingSummaries()) Enqueue(new(id, true));
        Notify(); return Task.CompletedTask;
    }
    private void Notify() => Changed?.Invoke();
    public async Task<Meeting> StartRecordingAsync(string title)
    {
        await recordingGate.WaitAsync();
        try
        {
            if (stopping || IsRecording) throw new InvalidOperationException("Ya hay una grabación o la aplicación se está cerrando.");
            var meeting = Repository.Create(title);
            RecordingId = meeting.Id;
            int sequence = 0;
            try
            {
                await recorder.StartAsync(chunk => Repository.AddChunk(meeting.Id, sequence++, chunk.Data), error =>
                {
                    // Keep state recording until Stop drains callbacks; preserved chunks remain recoverable.
                    Repository.SetStatus(meeting.Id, "grabando", error: error.Message); Notify();
                });
                Notify(); return meeting;
            }
            catch
            {
                RecordingId = null;
                if (Repository.Get(meeting.Id)?.ChunkCount == 0) Repository.Remove(meeting.Id);
                else Repository.SetStatus(meeting.Id, "interrumpida");
                Notify(); throw;
            }
        }
        finally { recordingGate.Release(); }
    }
    public async Task StopRecordingAsync()
    {
        await recordingGate.WaitAsync();
        try
        {
            string? id = RecordingId;
            if (id is null) return;
            try { int duration = await recorder.StopAsync(); Repository.FinishRecording(id, duration); Enqueue(new(id, false)); }
            catch (Exception e) { Repository.SetStatus(id, "interrumpida", error: e.Message); throw; }
            finally { RecordingId = null; Notify(); }
        }
        finally { recordingGate.Release(); }
    }
    public void ProcessInterrupted(string id) { Repository.FinishRecording(id, null); Enqueue(new(id, false)); Notify(); }
    public void Retry(string id) { Repository.Retry(id); Enqueue(new(id, false)); Notify(); }
    public void RequestSummary(string id)
    {
        var detail = Repository.GetDetail(id) ?? throw new InvalidOperationException("Grabación inexistente.");
        if (detail.Meeting.Status != "listo" || detail.Segments.Count == 0) throw new InvalidOperationException("Necesitas una transcripción lista y con texto.");
        if (detail.Meeting.SummaryStatus is "running" or "queued") return;
        Repository.SetSummaryStatus(id, "queued"); Enqueue(new(id, true)); Notify();
    }
    private void Enqueue(Job job)
    {
        lock (gate)
        {
            if (stopping || deleting.Contains(job.Id) || current == job || queue.Contains(job)) return;
            queue.Enqueue(job);
            if (!working) { working = true; worker = Task.Run(DrainAsync); }
        }
    }
    private async Task DrainAsync()
    {
        while (true)
        {
            Job job; CancellationTokenSource cancellation; TaskCompletionSource finished;
            lock (gate)
            {
                if (stopping || queue.Count == 0) { working = false; return; }
                job = queue.Dequeue(); current = job;
                cancellation = new(); currentCancellation = cancellation;
                finished = new(TaskCreationOptions.RunContinuationsAsynchronously); currentFinished = finished;
            }
            try { await ProcessAsync(job, cancellation.Token); }
            finally
            {
                lock (gate) { current = null; currentCancellation = null; currentFinished = null; }
                cancellation.Dispose(); finished.TrySetResult(); Notify();
            }
        }
    }
    private async Task ProcessAsync(Job job, CancellationToken token)
    {
        var meeting = Repository.Get(job.Id);
        if (meeting is null || (job.Summary ? meeting.SummaryStatus != "queued" : meeting.Status != "en_cola")) return;
        string? directory = null;
        try
        {
            if (job.Summary)
            {
                Repository.SetSummaryStatus(job.Id, "running"); Notify();
                var detail = Repository.GetDetail(job.Id)!;
                needsUnload = true;
                var doc = await summarizer.SummarizeAsync(detail.Segments, null, token);
                needsUnload = false; // Successful SummarizeAsync includes successful unload.
                token.ThrowIfCancellationRequested();
                Repository.SaveSummary(job.Id, doc, options.OllamaModel);
            }
            else
            {
                if (needsUnload)
                {
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                    await summarizer.UnloadAsync(timeout.Token); needsUnload = false;
                }
                Repository.SetStatus(job.Id, "transcribiendo"); Notify();
                directory = Path.Combine(Path.GetTempPath(), "neenemi-job-" + Guid.NewGuid()); Directory.CreateDirectory(directory);
                string audio = Path.Combine(directory, Repository.GetAudioFormat(job.Id) == "pcm_s16le" ? "input.wav" : "input.webm");
                Repository.WriteAudioTo(job.Id, audio);
                var elapsed = Stopwatch.StartNew();
                var result = await transcriber.TranscribeAsync(audio, new InlineProgress(p => { if (!token.IsCancellationRequested) { Repository.SetProgress(job.Id, p); Notify(); } }), token);
                token.ThrowIfCancellationRequested();
                Repository.SaveTranscription(job.Id, result.Segments, (int)Math.Round(elapsed.Elapsed.TotalSeconds), options.AutoSummarize);
                if (options.AutoSummarize && result.Segments.Count > 0) Enqueue(new(job.Id, true));
            }
        }
        catch (Exception e)
        {
            bool closing; lock (gate) closing = stopping;
            if (Repository.Get(job.Id) is not null)
            {
                string message = token.IsCancellationRequested ? "Procesamiento cancelado." : e.Message;
                if (job.Summary) Repository.SetSummaryStatus(job.Id, closing ? "queued" : "error", closing ? null : message);
                else Repository.SetStatus(job.Id, closing ? "en_cola" : "error", error: closing ? null : message);
            }
        }
        finally { if (directory is not null) Directory.Delete(directory, true); }
    }
    private sealed class InlineProgress(Action<int> report) : IProgress<int> { public void Report(int value) => report(value); }
    public async Task CancelAsync(string id)
    {
        Task finished = Task.CompletedTask;
        lock (gate)
        {
            var remaining = queue.Where(j => j.Id != id).ToArray(); queue.Clear(); foreach (var j in remaining) queue.Enqueue(j);
            if (current?.Id == id) { finished = currentFinished!.Task; currentCancellation!.Cancel(); }
        }
        await finished;
        var m = Repository.Get(id);
        if (m is not null)
        {
            if (m.Status == "en_cola") Repository.SetStatus(id, "error", error: "Transcripción cancelada.");
            if (m.SummaryStatus == "queued") Repository.SetSummaryStatus(id, "error", "Resumen cancelado.");
        }
        Notify();
    }
    public async Task DeleteAsync(string id)
    {
        if (id == RecordingId) throw new InvalidOperationException("Termina la grabación antes de eliminarla.");
        lock (gate) deleting.Add(id);
        try
        {
            await CancelAsync(id);
            await playbackGate.WaitAsync();
            try
            {
                if (Guid.TryParse(id, out var key)) File.Delete(Path.Combine(playbackDirectory, key.ToString("D") + ".wav"));
                Repository.Remove(id);
            }
            finally { playbackGate.Release(); }
        }
        finally { lock (gate) deleting.Remove(id); }
        Notify();
    }
    public async Task<string> PreparePlaybackAsync(string id)
    {
        if (!Guid.TryParse(id, out var key)) throw new ArgumentException("Identificador inválido.");
        await playbackGate.WaitAsync(playbackCancellation.Token);
        try
        {
            string wav = Path.Combine(playbackDirectory, key.ToString("D") + ".wav");
            if (File.Exists(wav)) return wav;
            string source = Path.ChangeExtension(wav, ".source");
            await Task.Run(() => Repository.WriteAudioTo(id, source));
            string partial = wav + ".partial.wav";
            try
            {
                await ProcessRunner.RunAsync(options.FfmpegPath, ["-y", "-loglevel", "error", "-i", source, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", partial], null, playbackCancellation.Token);
                File.Move(partial, wav, true); return wav;
            }
            finally { File.Delete(source); File.Delete(partial); }
        }
        finally { playbackGate.Release(); }
    }
    public Task WaitForIdleAsync() { lock (gate) return worker; }
    public async Task<int> ImportAsync(string sourcePath)
    {
        if (IsRecording) throw new InvalidOperationException("Termina la grabación antes de importar.");
        int count = await Task.Run(() => Repository.ImportFrom(sourcePath));
        foreach (var m in Repository.List().Where(m => m.Status == "en_cola")) Enqueue(new(m.Id, false));
        foreach (string id in Repository.PendingSummaries()) Enqueue(new(id, true));
        Notify(); return count;
    }
    public async ValueTask DisposeAsync()
    {
        Task running;
        lock (gate) { stopping = true; queue.Clear(); currentCancellation?.Cancel(); running = worker; }
        playbackCancellation.Cancel();
        try { await StopRecordingAsync(); } catch (InvalidOperationException) { }
        await running;
        await recorder.DisposeAsync();
        if (summarizer is IDisposable disposable) disposable.Dispose();
        await playbackGate.WaitAsync();
        try { Directory.Delete(playbackDirectory, true); }
        finally { playbackGate.Release(); }
        playbackCancellation.Dispose();
        playbackGate.Dispose();
        recordingGate.Dispose();
    }
}
