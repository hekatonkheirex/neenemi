using System.Diagnostics;
using NAudio.Wave;
using Neenemi.Core;

namespace Neenemi.App;

public sealed class WindowsAudioRecorder : IAudioRecorder
{
    private const int SampleRate = 16000;
    private const int ChunkBytes = SampleRate * 2 * 30;
    private readonly object gate = new();
    private WaveInEvent? input;
    private byte[] buffer = new byte[ChunkBytes];
    private int used;
    private Action<CaptureChunk>? save;
    private Action<Exception>? report;
    private TaskCompletionSource? stopped;
    private Exception? failure;
    private bool persistenceFailed;
    private readonly Stopwatch elapsed = new();
    public bool IsRecording { get { lock (gate) return input is not null; } }

    public Task StartAsync(Action<CaptureChunk> saveChunk, Action<Exception> onError, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (gate)
        {
            if (input is not null) throw new InvalidOperationException("Ya hay una grabación en curso.");
            save = saveChunk; report = onError; used = 0; failure = null; persistenceFailed = false;
            stopped = new(TaskCreationOptions.RunContinuationsAsynchronously);
            input = new WaveInEvent { WaveFormat = new WaveFormat(SampleRate, 16, 1), BufferMilliseconds = 100 };
            input.DataAvailable += OnData;
            input.RecordingStopped += OnStopped;
            try { elapsed.Restart(); input.StartRecording(); }
            catch { input.Dispose(); input = null; elapsed.Stop(); throw; }
        }
        return Task.CompletedTask;
    }
    private void OnData(object? sender, WaveInEventArgs args)
    {
        lock (gate)
        {
            if (failure is not null) return;
            try
            {
                int offset = 0;
                while (offset < args.BytesRecorded)
                {
                    int count = Math.Min(ChunkBytes - used, args.BytesRecorded - offset);
                    Buffer.BlockCopy(args.Buffer, offset, buffer, used, count);
                    used += count; offset += count;
                    if (used == ChunkBytes)
                    {
                        save!(new(buffer, SampleRate));
                        buffer = new byte[ChunkBytes]; used = 0;
                    }
                }
            }
            catch (Exception e) { persistenceFailed = true; failure = e; report?.Invoke(e); input?.StopRecording(); }
        }
    }
    private void OnStopped(object? sender, StoppedEventArgs args)
    {
        lock (gate)
        {
            elapsed.Stop();
            failure ??= args.Exception;
            try { if (used > 0 && !persistenceFailed) { save!(new(buffer[..used], SampleRate)); used = 0; } }
            catch (Exception e) { failure = e; }
            if (failure is not null) report?.Invoke(failure);
            stopped?.TrySetResult();
        }
    }
    public async Task<int> StopAsync(CancellationToken cancellationToken = default)
    {
        WaveInEvent? device;
        Task completion;
        lock (gate)
        {
            device = input;
            if (device is null) return 0;
            completion = stopped!.Task;
            device.StopRecording();
        }
        // Always drain final data before releasing device, even if the caller cancels.
        await completion.ConfigureAwait(false);
        lock (gate)
        {
            if (ReferenceEquals(input, device)) { device.Dispose(); input = null; }
            cancellationToken.ThrowIfCancellationRequested();
            if (failure is not null) throw new InvalidOperationException("El micrófono o el guardado falló. Puedes procesar el audio conservado.", failure);
            return (int)Math.Ceiling(elapsed.Elapsed.TotalSeconds);
        }
    }
    public async ValueTask DisposeAsync()
    {
        try { await StopAsync(); }
        catch (InvalidOperationException) { /* Failure was already surfaced; device has been released. */ }
    }
}
