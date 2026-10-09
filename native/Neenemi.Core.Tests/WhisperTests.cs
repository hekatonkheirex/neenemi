using System.Text.Json;
using Neenemi.Core;
using Xunit;

namespace Neenemi.Core.Tests;

public sealed class WhisperTests
{
    [Fact]
    public void NoiseIsExcludedButSpeechAndOffsetsRemain()
    {
        using var json = JsonDocument.Parse("""{"transcription":[{"text":"[silencio]","offsets":{"from":0,"to":100}},{"text":" Aprobado ","offsets":{"from":100,"to":900}}]}""");
        Assert.Equal(new TranscriptSegment(0, 100, 900, "Aprobado"), Assert.Single(WhisperTranscriber.ParseSegments(json.RootElement)));
    }
    [Theory]
    [InlineData("{\"transcription\":[{\"text\":\"x\",\"offsets\":{\"from\":-1,\"to\":1}}]}")]
    [InlineData("{\"transcription\":[{\"text\":\"x\",\"offsets\":{\"from\":4,\"to\":1}}]}")]
    [InlineData("{\"transcription\":{}}")]
    public void RejectsInvalidWhisperOutput(string text)
    {
        using var json = JsonDocument.Parse(text);
        Assert.Throws<InvalidDataException>(() => WhisperTranscriber.ParseSegments(json.RootElement));
    }
}
