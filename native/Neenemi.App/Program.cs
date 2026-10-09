using System.Runtime.InteropServices;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Neenemi.Core;

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
        try
        {
            WinRT.ComWrappersSupport.InitializeComWrappers();
            Application.Start(initialization =>
            {
                SynchronizationContext.SetSynchronizationContext(new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread()));
                _ = new DesktopApplication();
            });
        }
        catch (Exception e) { MessageBox(0, e.Message, "No se pudo iniciar Ñe'eñemi", 0x10); }
        finally { mutex.ReleaseMutex(); }
    }
}

internal sealed class DesktopApplication : Application
{
    private MainWindow? window;
    public DesktopApplication() => Resources.MergedDictionaries.Add(new XamlControlsResources());
    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        window = new MainWindow(SettingsStore.Load());
        window.Activate();
    }
}
