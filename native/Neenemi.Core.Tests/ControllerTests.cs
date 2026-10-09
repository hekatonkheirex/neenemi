using Neenemi.Core;
using Xunit;

namespace Neenemi.Core.Tests;

public sealed class ControllerTests
{
    private sealed class Recorder : IAudioRecorder
    {
        private Action<CaptureChunk>? save;
        public bool IsRecording { get; private set; }
        public Task StartAsync(Action<CaptureChunk> saveChunk, Action<Exception> onError, CancellationToken cancellationToken = default) { save = saveChunk; IsRecording = true; return Task.CompletedTask; }
        public Task<int> StopAsync(CancellationToken cancellationToken = default) { if (IsRecording) save!(new([1, 0], 16000)); IsRecording = false; return Task.FromResult(1); }
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
    private sealed class BlockingTranscriber : ITranscriber
    {
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public async Task<TranscriptionResult> TranscribeAsync(string audioPath, IProgress<int>? progress, CancellationToken token)
        {
            Assert.True(File.Exists(audioPath)); Started.TrySetResult(); await Release.Task.WaitAsync(token);
            return new([new(0, 0, 1000, "Compra aprobada")]);
        }
    }
    private sealed class FailingSummary : ISummarizer
    {
        public Task<SummaryDocument> SummarizeAsync(IReadOnlyList<TranscriptSegment> segments, IProgress<int>? progress, CancellationToken token) => throw new InvalidOperationException("Ollama no disponible");
        public Task UnloadAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
    [Fact]
    public async Task SummaryFailureDoesNotInvalidateCompletedTranscript()
    {
        string dir = Path.Combine(Path.GetTempPath(), "neenemi-controller-" + Guid.NewGuid());
        try
        {
            var transcriber = new BlockingTranscriber(); transcriber.Release.SetResult();
            var repo = new MeetingsRepository(Path.Combine(dir, "test.sqlite"));
            await using var controller = new AppController(repo, new Recorder(), transcriber, new FailingSummary(), new());
            var m = await controller.StartRecordingAsync("Solo nombre"); await controller.StopRecordingAsync(); await controller.WaitForIdleAsync();
            var d = repo.GetDetail(m.Id)!;
            Assert.Equal("listo", d.Meeting.Status); Assert.Equal("error", d.Meeting.SummaryStatus);
            Assert.Equal("Compra aprobada", Assert.Single(d.Segments).Text);
            Assert.Equal(1, d.Meeting.ChunkCount);
        }
        finally { Directory.Delete(dir, true); }
    }
    [Fact]
    public async Task DeleteActiveJobWaitsForCancellationAndCannotResurrectData()
    {
        string dir = Path.Combine(Path.GetTempPath(), "neenemi-controller-" + Guid.NewGuid());
        try
        {
            var transcriber = new BlockingTranscriber(); var repo = new MeetingsRepository(Path.Combine(dir, "test.sqlite"));
            await using var controller = new AppController(repo, new Recorder(), transcriber, new FailingSummary(), new() { AutoSummarize = false });
            var m = await controller.StartRecordingAsync("Eliminar"); await controller.StopRecordingAsync();
            await transcriber.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
            await controller.DeleteAsync(m.Id); await controller.WaitForIdleAsync();
            Assert.Null(repo.GetDetail(m.Id)); Assert.Empty(repo.List());
        }
        finally { Directory.Delete(dir, true); }
    }
    [Fact]
    public async Task ClosingDuringTranscriptionLeavesDurableQueueAndAudio()
    {
        string dir = Path.Combine(Path.GetTempPath(), "neenemi-controller-" + Guid.NewGuid());
        try
        {
            var transcriber = new BlockingTranscriber(); var repo = new MeetingsRepository(Path.Combine(dir, "test.sqlite"));
            var controller = new AppController(repo, new Recorder(), transcriber, new FailingSummary(), new() { AutoSummarize = false });
            var m = await controller.StartRecordingAsync("Cerrar"); await controller.StopRecordingAsync();
            await transcriber.Started.Task.WaitAsync(TimeSpan.FromSeconds(5)); await controller.DisposeAsync();
            var reopened = new MeetingsRepository(Path.Combine(dir, "test.sqlite"));
            Assert.Equal("en_cola", reopened.Get(m.Id)!.Status); Assert.Equal(1, reopened.Get(m.Id)!.ChunkCount);
            Assert.Equal(new[] { m.Id }, reopened.RecoverAfterRestart());
        }
        finally { Directory.Delete(dir, true); }
    }
}
