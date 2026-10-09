using System.Text;

namespace Neenemi.Core;

public static class MarkdownExporter
{
    public static string Clock(int ms)
    {
        var t = TimeSpan.FromMilliseconds(Math.Max(0, ms));
        return t.TotalHours >= 1 ? $"{(int)t.TotalHours}:{t.Minutes:00}:{t.Seconds:00}" : $"{t.Minutes:00}:{t.Seconds:00}";
    }
    public static string Transcript(MeetingDetail detail)
    {
        var text = new StringBuilder().Append("# ").AppendLine(detail.Meeting.Title).AppendLine().Append("Fecha: ").AppendLine(detail.Meeting.RecordedAt);
        if (detail.Meeting.DurationS is { } seconds) text.Append("Duración: ").AppendLine(Clock(seconds * 1000));
        text.AppendLine().AppendLine("## Transcripción").AppendLine();
        foreach (var s in detail.Segments) text.Append('[').Append(Clock(s.StartMs)).Append("] ").AppendLine(s.Text);
        return text.ToString();
    }
    public static string Summary(MeetingDetail detail)
    {
        var stored = detail.Summary ?? throw new InvalidOperationException("Todavía no hay un resumen.");
        var d = stored.Document;
        var text = new StringBuilder().Append("# ").AppendLine(detail.Meeting.Title).AppendLine().AppendLine("> Resumen generado por IA. Verifica acuerdos, nombres y fechas contra la transcripción.").Append("Modelo: ").AppendLine(stored.Model).Append("Generado: ").AppendLine(stored.GeneratedAt).AppendLine().AppendLine("## Resumen").AppendLine().AppendLine(d.Overview);
        void Items(string heading, IEnumerable<SummaryItem> items)
        {
            text.AppendLine().Append("## ").AppendLine(heading).AppendLine();
            foreach (var item in items) text.Append("- ").Append(item.Text).Append(" ").AppendLine(References(item.Sources, detail));
        }
        Items("Temas tratados", d.Topics); Items("Decisiones y acuerdos", d.Decisions);
        text.AppendLine().AppendLine("## Pendientes").AppendLine();
        foreach (var a in d.Actions) text.Append("- ").Append(a.Task).Append(" — Responsable: ").Append(a.Responsible ?? "No mencionado").Append("; fecha: ").Append(a.DueDate ?? "No mencionada").Append(' ').AppendLine(References(a.Sources, detail));
        return text.ToString();
    }
    private static string References(int[] sources, MeetingDetail d) => "[" + string.Join(", ", sources.Distinct().Select(id => d.Segments.FirstOrDefault(s => s.Seq == id)).Where(s => s is not null).Select(s => Clock(s!.StartMs))) + "]";
    public static string SafeFileName(string title, string extension)
    {
        var bad = new HashSet<char>("\\/:*?\"<>|");
        string name = new(title.Select(c => char.IsControl(c) || bad.Contains(c) ? '-' : c).ToArray());
        name = name.Trim(' ', '.', '-');
        if (name.Length == 0) name = "grabacion";
        return name[..Math.Min(name.Length, 120)] + "." + extension;
    }
}
