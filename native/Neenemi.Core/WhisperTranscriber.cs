using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Neenemi.Core;

public sealed partial class WhisperTranscriber(AppOptions options) : ITranscriber
{
    [GeneratedRegex(@"progress\s*=\s*(\d+)%")]
    private static partial Regex ProgressPattern();
    [GeneratedRegex(@"max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB")]
    private static partial Regex VolumePattern();
    [GeneratedRegex(@"^[\[(][^\])]*[\])]$")]
    private static partial Regex NoisePattern();

    public async Task<TranscriptionResult> TranscribeAsync(string audioPath, IProgress<int>? progress, CancellationToken cancellationToken)
    {
        foreach (string file in new[] { options.FfmpegPath, options.WhisperPath, options.WhisperModelPath })
            if (!File.Exists(file)) throw new FileNotFoundException("Faltan recursos de transcripción. Abre Configuración y prepara Whisper.", file);
        string directory = Path.Combine(Path.GetTempPath(), "neenemi-whisper-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        try
        {
            string wav = Path.Combine(directory, "audio.wav");
            string output = Path.Combine(directory, "transcript");
            await ProcessRunner.RunAsync(options.FfmpegPath, ["-y", "-loglevel", "error", "-i", audioPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], null, cancellationToken);
            double? peak = null;
            await ProcessRunner.RunAsync(options.FfmpegPath, ["-hide_banner", "-nostats", "-i", wav, "-af", "volumedetect", "-f", "null", "-"], line =>
            {
                var match = VolumePattern().Match(line);
                if (match.Success) peak = double.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
            }, cancellationToken);
            if (peak is null) throw new InvalidOperationException("No se pudo analizar el nivel de audio.");
            if (peak < -45) return new TranscriptionResult([]);
            await ProcessRunner.RunAsync(options.WhisperPath,
                ["-m", options.WhisperModelPath, "-f", wav, "-l", "es", "-oj", "-of", output, "-pp", "-sns", "-t", options.CpuThreads.ToString(CultureInfo.InvariantCulture)], line =>
                {
                    var match = ProgressPattern().Match(line);
                    if (match.Success) progress?.Report(Math.Clamp(int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture), 0, 99));
                }, cancellationToken);
            await using var json = File.OpenRead(output + ".json");
            using var document = await JsonDocument.ParseAsync(json, cancellationToken: cancellationToken);
            return new(ParseSegments(document.RootElement));
        }
        finally { Directory.Delete(directory, recursive: true); }
    }

    public static IReadOnlyList<TranscriptSegment> ParseSegments(JsonElement root)
    {
        if (!root.TryGetProperty("transcription", out var transcription) || transcription.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("Whisper devolvió una transcripción inválida.");
        var segments = new List<TranscriptSegment>();
        foreach (var item in transcription.EnumerateArray())
        {
            if (!item.TryGetProperty("text", out var text) || text.ValueKind != JsonValueKind.String
                || !item.TryGetProperty("offsets", out var offsets) || offsets.ValueKind != JsonValueKind.Object
                || !offsets.TryGetProperty("from", out var start) || !start.TryGetInt32(out int from)
                || !offsets.TryGetProperty("to", out var end) || !end.TryGetInt32(out int to) || from < 0 || to < from)
                throw new InvalidDataException("Whisper devolvió un segmento inválido.");
            string value = text.GetString()!.Trim();
            if (value.Length == 0 || NoisePattern().IsMatch(value)) continue;
            segments.Add(new(segments.Count, from, to, value));
        }
        return segments;
    }
}
