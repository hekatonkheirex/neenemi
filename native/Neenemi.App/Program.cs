using System.Runtime.InteropServices;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;

namespace Neenemi.App;

internal static class Program
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(nint window, string text, string caption, uint type);
    [STAThread]
    private static void Main()
    {
        using var mutex = new Mutex(true, "Local\\Neenemi.Windows", out bool owner);
        if (!owner) { MessageBox(0, "Ñe'eñemi ya está abierta. Busca su ventana en la barra de tareas.", "Ñe'eñemi", 0); return; }
        StartupDiagnostics.Begin();
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            if (args.ExceptionObject is Exception error) StartupDiagnostics.Failure("AppDomain.UnhandledException", error);
        };
        try
        {
            StartupDiagnostics.Stage("ComWrappers.Initialize");
            WinRT.ComWrappersSupport.InitializeComWrappers();
            StartupDiagnostics.Stage("Application.Start");
            Application.Start(initialization =>
            {
                StartupDiagnostics.Stage("Application.Start.Callback");
                SynchronizationContext.SetSynchronizationContext(new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread()));
                StartupDiagnostics.Stage("DesktopApplication.Create");
                _ = new DesktopApplication();
            });
        }
        catch (Exception e)
        {
            StartupDiagnostics.Failure("Main", e);
            MessageBox(0, e + "\n\nRegistro: " + StartupDiagnostics.LogPath, "No se pudo iniciar Ñe'eñemi", 0x10);
        }
        finally { mutex.ReleaseMutex(); }
    }
}
