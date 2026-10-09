using Neenemi.Core;

if (args.Length != 2 || args[0] != "--output")
{
    Console.Error.WriteLine("Uso: dotnet run --project native/Neenemi.Tools -- --output <carpeta-recursos-Windows>");
    return 2;
}
using var cancellation = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cancellation.Cancel(); };
try
{
    var options = new AppOptions { ToolsDirectory = Path.GetFullPath(args[1]) };
    using var setup = new ResourceSetup(options);
    await setup.EnsureWhisperAsync(new Progress<string>(Console.WriteLine), cancellation.Token);
    return 0;
}
catch (Exception e) { Console.Error.WriteLine(e.Message); return 1; }
