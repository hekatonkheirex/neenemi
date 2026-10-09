using System.Diagnostics;
using System.Text;

namespace Neenemi.Core;

public static class ProcessRunner
{
    public static async Task RunAsync(string executable, IReadOnlyList<string> args, Action<string>? stderrLine, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var info = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardOutput = true };
        foreach (string arg in args) info.ArgumentList.Add(arg);
        using var process = new Process { StartInfo = info };
        if (!process.Start()) throw new InvalidOperationException($"No se pudo ejecutar {Path.GetFileName(executable)}.");
        var diagnostic = new StringBuilder();
        async Task ReadErrors()
        {
            while (await process.StandardError.ReadLineAsync() is { } line)
            {
                diagnostic.AppendLine(line);
                if (diagnostic.Length > 4000) diagnostic.Remove(0, diagnostic.Length - 4000);
                stderrLine?.Invoke(line);
            }
        }
        Task errors = ReadErrors();
        Task output = process.StandardOutput.BaseStream.CopyToAsync(Stream.Null);
        using var registration = cancellationToken.Register(() =>
        {
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
            catch (InvalidOperationException) { } // Exit raced cancellation.
        });
        try
        {
            await process.WaitForExitAsync(CancellationToken.None);
            await Task.WhenAll(errors, output);
            cancellationToken.ThrowIfCancellationRequested();
            if (process.ExitCode != 0) throw new InvalidOperationException($"{Path.GetFileName(executable)} terminó con código {process.ExitCode}: {diagnostic.ToString().Trim()}");
        }
        finally
        {
            if (!process.HasExited) { process.Kill(entireProcessTree: true); await process.WaitForExitAsync(CancellationToken.None); }
        }
    }
}
