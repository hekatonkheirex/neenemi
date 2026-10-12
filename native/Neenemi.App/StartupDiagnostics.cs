using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace Neenemi.App;

internal static class StartupDiagnostics
{
    private static readonly object gate = new();
    private static readonly string session = Guid.NewGuid().ToString("N");
    internal static string LogPath { get; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "neenemi", "logs", "startup.log");

    internal static void Begin()
    {
        lock (gate)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
                File.WriteAllText(LogPath, "");
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
                Trace.WriteLine(error);
            }
        }
        Write("startup_begin", new
        {
            build = typeof(StartupDiagnostics).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion,
            module = typeof(StartupDiagnostics).Assembly.ManifestModule.ModuleVersionId,
            runtime = RuntimeInformation.FrameworkDescription,
            os = RuntimeInformation.OSDescription,
            architecture = RuntimeInformation.ProcessArchitecture.ToString()
        });
    }

    internal static void Stage(string phase) => Write("startup_stage", new { phase });

    internal static void Failure(string phase, Exception error, string? message = null) => Write("startup_failure", new
    {
        phase,
        hresult = $"0x{error.HResult:X8}",
        message,
        exception = error.ToString()
    });

    private static void Write(string name, object data)
    {
        lock (gate)
        {
            try
            {
                File.AppendAllText(LogPath, JsonSerializer.Serialize(new { timestamp = DateTimeOffset.UtcNow, session, pid = Environment.ProcessId, @event = name, data }) + "\n");
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
                // Diagnostics must not replace the original startup failure with a log I/O error.
                Trace.WriteLine(error);
            }
        }
    }
}
