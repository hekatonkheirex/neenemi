using System.Diagnostics;
using System.IO.Compression;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;

namespace Neenemi.Core;

public sealed class ResourceSetup : IDisposable
{
    public const string WhisperVersion = "v1.9.2";
    private const string WhisperZipHash = "49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a";
    private const string ModelHash = "19fea4b380c3a618ec4723c3eef2eb785ffba0d0538cf43f8f235e7b3b34220f";
    private const string FfmpegHash = "8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77";
    private readonly AppOptions options;
    private readonly HttpClient downloads = new() { Timeout = Timeout.InfiniteTimeSpan };
    private readonly HttpClient local = new(new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false }) { BaseAddress = new("http://127.0.0.1:11434/"), Timeout = Timeout.InfiniteTimeSpan };
    private Process? ownedOllama;
    public ResourceSetup(AppOptions options) { SettingsStore.Validate(options); this.options = options; }
    public bool HasWhisper => File.Exists(options.FfmpegPath) && File.Exists(options.WhisperPath) && File.Exists(options.WhisperModelPath);

    public async Task EnsureWhisperAsync(IProgress<string>? progress, CancellationToken token)
    {
        Directory.CreateDirectory(options.ToolsDirectory);
        string whisperDir = Path.Combine(options.ToolsDirectory, "whisper"); Directory.CreateDirectory(whisperDir);
        string cache = Path.Combine(options.ToolsDirectory, ".downloads"); Directory.CreateDirectory(cache);
        string zip = Path.Combine(cache, "whisper-x64.zip");
        await DownloadVerifiedAsync("https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip", zip, WhisperZipHash, progress, token);
        using (var archive = ZipFile.OpenRead(zip))
        {
            bool executable = false;
            foreach (var entry in archive.Entries)
            {
                string name = entry.Name;
                if (name != "whisper-cli.exe" && name != "whisper.dll" && !(name.StartsWith("ggml", StringComparison.Ordinal) && name.EndsWith(".dll", StringComparison.Ordinal)) && name != "LICENSE") continue;
                if (name == "whisper-cli.exe") executable = true;
                string destination = Path.Combine(whisperDir, name == "LICENSE" ? "LICENSE.whisper" : name);
                await using var input = entry.Open(); await using var output = File.Create(destination + ".part");
                await input.CopyToAsync(output, token); await output.DisposeAsync(); File.Move(destination + ".part", destination, true);
            }
            if (!executable) throw new InvalidDataException("El paquete de Whisper no trae whisper-cli.exe.");
        }
        await DownloadVerifiedAsync("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium-q5_0.bin", Path.Combine(whisperDir, options.WhisperModel), ModelHash, progress, token);
        string gz = Path.Combine(cache, "ffmpeg-win32-x64.gz");
        await DownloadVerifiedAsync("https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz", gz, FfmpegHash, progress, token);
        string ffmpeg = Path.Combine(options.ToolsDirectory, "ffmpeg.exe");
        await using (var input = File.OpenRead(gz))
        await using (var unzip = new GZipStream(input, CompressionMode.Decompress))
        await using (var output = File.Create(ffmpeg + ".part")) await unzip.CopyToAsync(output, token);
        File.Move(ffmpeg + ".part", ffmpeg, true);
        foreach (string suffix in new[] { "LICENSE", "README" })
        {
            using var response = await downloads.GetAsync("https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/win32-x64." + suffix, token);
            response.EnsureSuccessStatusCode();
            await File.WriteAllTextAsync(Path.Combine(options.ToolsDirectory, "ffmpeg." + suffix), await response.Content.ReadAsStringAsync(token), token);
        }
        using (var response = await downloads.GetAsync("https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.9.2/LICENSE", token))
        {
            response.EnsureSuccessStatusCode();
            await File.WriteAllTextAsync(Path.Combine(whisperDir, "LICENSE.whisper"), await response.Content.ReadAsStringAsync(token), token);
        }
        progress?.Report("Whisper medium Q5_0 y ffmpeg preparados.");
    }

    private async Task DownloadVerifiedAsync(string url, string destination, string hash, IProgress<string>? progress, CancellationToken token)
    {
        if (File.Exists(destination) && await MatchesHashAsync(destination, hash, token)) return;
        string partial = destination + ".part";
        try
        {
            using var response = await downloads.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token);
            response.EnsureSuccessStatusCode();
            long? total = response.Content.Headers.ContentLength;
            await using var input = await response.Content.ReadAsStreamAsync(token);
            await using (var output = File.Create(partial))
            {
                var buffer = new byte[131072]; long received = 0; long last = -1;
                while (true)
                {
                    using var stall = CancellationTokenSource.CreateLinkedTokenSource(token); stall.CancelAfter(TimeSpan.FromSeconds(60));
                    int count = await input.ReadAsync(buffer, stall.Token); if (count == 0) break;
                    await output.WriteAsync(buffer.AsMemory(0, count), token); received += count;
                    long mb = received / 1000000;
                    if (mb != last) { last = mb; progress?.Report($"{Path.GetFileName(destination)}: {mb} MB" + (total is { } size ? $" / {size / 1000000} MB" : "")); }
                }
            }
            if (!await MatchesHashAsync(partial, hash, token)) throw new InvalidDataException("La descarga no pasó la verificación SHA-256: " + Path.GetFileName(destination));
            File.Move(partial, destination, true);
        }
        finally { File.Delete(partial); }
    }
    private static async Task<bool> MatchesHashAsync(string file, string expected, CancellationToken token)
    {
        await using var input = File.OpenRead(file);
        byte[] hash = await SHA256.HashDataAsync(input, token);
        return Convert.ToHexString(hash).Equals(expected, StringComparison.OrdinalIgnoreCase);
    }
    public async Task<bool> IsOllamaAvailableAsync(CancellationToken cancellationToken = default)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken); timeout.CancelAfter(TimeSpan.FromSeconds(3));
        try
        {
            using var response = await local.GetAsync("api/tags", timeout.Token);
            if (!response.IsSuccessStatusCode) return false;
            using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(timeout.Token), cancellationToken: timeout.Token);
            return json.RootElement.TryGetProperty("models", out var models) && models.ValueKind == JsonValueKind.Array;
        }
        catch (HttpRequestException) { return false; }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { return false; }
    }
    public static string? FindOllama()
    {
        string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var candidates = new List<string>
        {
            Path.Combine(localApp, "Programs", "Ollama", "ollama.exe"),
            Path.Combine(localApp, "Ollama", "ollama.exe")
        };
        foreach (string dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
            candidates.Add(Path.Combine(dir, OperatingSystem.IsWindows() ? "ollama.exe" : "ollama"));
        return candidates.FirstOrDefault(File.Exists);
    }
    public async Task PrepareOllamaAsync(IProgress<string>? progress, CancellationToken token)
    {
        if (!await IsOllamaAvailableAsync(token))
        {
            string exe = FindOllama() ?? throw new FileNotFoundException("Instala Ollama para Windows y vuelve a pulsar Preparar resumen.");
            var info = new ProcessStartInfo(exe) { UseShellExecute = false, CreateNoWindow = true };
            info.ArgumentList.Add("serve");
            info.Environment["OLLAMA_HOST"] = "127.0.0.1:11434";
            info.Environment["OLLAMA_NO_CLOUD"] = "1";
            info.Environment["OLLAMA_NUM_PARALLEL"] = "1";
            info.Environment["OLLAMA_MAX_LOADED_MODELS"] = "1";
            ownedOllama = Process.Start(info) ?? throw new InvalidOperationException("No se pudo iniciar Ollama.");
            bool ready = false;
            for (int i = 0; i < 30; i++)
            {
                token.ThrowIfCancellationRequested();
                if (await IsOllamaAvailableAsync(token)) { ready = true; break; }
                if (ownedOllama.HasExited) break;
                await Task.Delay(500, token);
            }
            if (!ready) throw new InvalidOperationException("Ollama no inició su API local.");
        }
        progress?.Report("Preparando " + options.OllamaModel + ". La primera descarga necesita conexión.");
        using var request = new HttpRequestMessage(HttpMethod.Post, "api/pull") { Content = JsonContent.Create(new { model = options.OllamaModel, stream = true }) };
        using var response = await local.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
        await OllamaSummarizer.EnsureSuccessAsync(response, token);
        using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(token));
        bool success = false;
        while (await reader.ReadLineAsync(token) is { } line)
        {
            using var json = JsonDocument.Parse(line); var root = json.RootElement;
            if (root.TryGetProperty("error", out var error)) throw new InvalidOperationException(error.GetString());
            string status = root.TryGetProperty("status", out var value) ? value.GetString() ?? "" : "";
            success = status == "success";
            if (root.TryGetProperty("completed", out var done) && root.TryGetProperty("total", out var total) && total.GetInt64() > 0)
                status += $" {done.GetInt64() / 1000000}/{total.GetInt64() / 1000000} MB";
            progress?.Report(status);
        }
        if (!success) throw new InvalidDataException("Ollama no confirmó la descarga del modelo.");
        progress?.Report(options.OllamaModel + " preparado para uso local.");
    }
    public void Dispose()
    {
        // Ollama is a shared local service: don't terminate it when closing this app.
        ownedOllama?.Dispose(); downloads.Dispose(); local.Dispose();
    }
}
