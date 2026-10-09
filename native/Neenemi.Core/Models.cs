namespace Neenemi.Core;

public sealed record Meeting(
    string Id, string Title, string RecordedAt, int? DurationS, string Status,
    int Progress, string? Error, int? TranscribeSeconds, int ChunkCount,
    string CreatedAt, string UpdatedAt, string SummaryStatus, string? SummaryError);

public sealed record TranscriptSegment(int Seq, int StartMs, int EndMs, string Text);
public sealed record SummaryItem(string Text, int[] Sources);
public sealed record ActionItem(string Task, string? Responsible, string? DueDate, int[] Sources);
public sealed record SummaryDocument(string Overview, SummaryItem[] Topics, SummaryItem[] Decisions, ActionItem[] Actions);
public sealed record StoredSummary(SummaryDocument Document, string Model, string GeneratedAt);
public sealed record MeetingDetail(Meeting Meeting, IReadOnlyList<TranscriptSegment> Segments, StoredSummary? Summary);
public sealed record TranscriptionResult(IReadOnlyList<TranscriptSegment> Segments);
public sealed record CaptureChunk(byte[] Data, int SampleRate);

public interface IAudioRecorder : IAsyncDisposable
{
    bool IsRecording { get; }
    Task StartAsync(Action<CaptureChunk> saveChunk, Action<Exception> onError, CancellationToken cancellationToken = default);
    Task<int> StopAsync(CancellationToken cancellationToken = default);
}

public interface ITranscriber
{
    Task<TranscriptionResult> TranscribeAsync(string audioPath, IProgress<int>? progress, CancellationToken cancellationToken);
}

public interface ISummarizer
{
    Task<SummaryDocument> SummarizeAsync(IReadOnlyList<TranscriptSegment> segments, IProgress<int>? progress, CancellationToken cancellationToken);
    Task UnloadAsync(CancellationToken cancellationToken = default);
}

public sealed record AppOptions
{
    public string DataDirectory { get; init; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "neenemi", "data");
    public string ToolsDirectory { get; init; } = Path.Combine(AppContext.BaseDirectory, "resources");
    public string WhisperModel { get; init; } = "ggml-medium-q5_0.bin";
    public string OllamaModel { get; init; } = "qwen3:4b";
    public int ContextTokens { get; init; } = 8192;
    public int CpuThreads { get; init; } = Math.Max(1, Math.Min(4, Environment.ProcessorCount - 1));
    public bool AutoSummarize { get; init; } = true;
    public string FfmpegPath => Path.Combine(ToolsDirectory, OperatingSystem.IsWindows() ? "ffmpeg.exe" : "ffmpeg");
    public string WhisperPath => Path.Combine(ToolsDirectory, "whisper", OperatingSystem.IsWindows() ? "whisper-cli.exe" : "whisper-cli");
    public string WhisperModelPath => Path.Combine(ToolsDirectory, "whisper", WhisperModel);
}
