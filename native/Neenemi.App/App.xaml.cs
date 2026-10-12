using Microsoft.UI.Xaml;
using Neenemi.Core;

namespace Neenemi.App;

public partial class DesktopApplication : Application
{
    private MainWindow? window;

    public DesktopApplication()
    {
        UnhandledException += (_, args) =>
        {
            StartupDiagnostics.Failure("WinUI.UnhandledException", args.Exception, args.Message);
            // Leave Handled false: preserve the failure rather than running with broken UI state.
        };
        StartupDiagnostics.Stage("Application.InitializeComponent");
        try { InitializeComponent(); }
        catch (Exception error) { StartupDiagnostics.Failure("Application.InitializeComponent", error); throw; }
        StartupDiagnostics.Stage("Application.Initialized");
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            StartupDiagnostics.Stage("Settings.Load");
            var options = SettingsStore.Load();
            StartupDiagnostics.Stage("MainWindow.Create");
            window = new MainWindow(options);
            StartupDiagnostics.Stage("MainWindow.Activate");
            window.Activate();
            StartupDiagnostics.Stage("MainWindow.Activated");
        }
        catch (Exception error) { StartupDiagnostics.Failure("OnLaunched", error); throw; }
    }
}
