using System.Text;
using Neenemi.Core;
using Xunit;

namespace Neenemi.Core.Tests;

public sealed class SummaryTests
{
    [Fact]
    public void SplittingRetainsUnicodeAndAllTextWithinByteLimit()
    {
        string text = string.Concat(Enumerable.Repeat("Reunión ñ 👋 acuerdo. ", 400));
        var pieces = OllamaSummarizer.SplitText(text, 128);
        Assert.Equal(text, string.Concat(pieces));
        Assert.All(pieces, p => Assert.InRange(Encoding.UTF8.GetByteCount(p), 1, 128));
    }
    [Fact]
    public void BatchingRetainsAllUnitsAndRejectsOversizedUnit()
    {
        string[] units = [new('a', 70), new('b', 70), new('c', 70)];
        var batches = OllamaSummarizer.BatchUnits(units, 150);
        Assert.Equal(units, string.Concat(batches).Split('\n', StringSplitOptions.RemoveEmptyEntries));
        Assert.All(batches, b => Assert.InRange(Encoding.UTF8.GetByteCount(b), 1, 150));
        Assert.Throws<InvalidOperationException>(() => OllamaSummarizer.BatchUnits([new string('x', 151)], 150));
    }
    [Theory]
    [InlineData("{\"overview\":\"Acuerdo\",\"topics\":[],\"decisions\":[{\"text\":\"Compra\",\"sources\":[99]}],\"actions\":[]}")]
    [InlineData("{\"overview\":\"Acuerdo\",\"topics\":null,\"decisions\":[],\"actions\":[]}")]
    [InlineData("{\"overview\":\"Acuerdo\",\"topics\":[],\"decisions\":[{\"text\":\"Compra\",\"sources\":[]}],\"actions\":[]}")]
    public void InvalidEvidenceCannotBeSavedAsSummary(string json)
    {
        Assert.Throws<InvalidDataException>(() => OllamaSummarizer.ValidateDocument(json, new HashSet<int> { 0, 1 }));
    }
    [Fact]
    public void MissingResponsibleAndDateRemainUnspecified()
    {
        string json = """{"overview":"Comprar repuestos","topics":[],"decisions":[],"actions":[{"task":"Comprar","responsible":null,"dueDate":null,"sources":[1]}]}""";
        var doc = OllamaSummarizer.ValidateDocument(json, new HashSet<int> { 1 });
        Assert.Null(doc.Actions[0].Responsible); Assert.Null(doc.Actions[0].DueDate); Assert.Equal(new[] { 1 }, doc.Actions[0].Sources);
    }
}
