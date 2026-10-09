using Microsoft.UI.Xaml;
using Neenemi.Core;

namespace Neenemi.App;

public partial class DesktopApplication : Application
{
    private MainWindow? window;

    public DesktopApplication()
    {
        InitializeComponent();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        window = new MainWindow(SettingsStore.Load());
        window.Activate();
    }
}
