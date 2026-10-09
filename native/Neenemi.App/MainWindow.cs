using System.Diagnostics;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Media;
using Neenemi.Core;
using Windows.ApplicationModel.DataTransfer;
using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.Storage.Pickers;
using Windows.Graphics;

namespace Neenemi.App;

public sealed class MainWindow : Window
{
    private readonly Grid root = new() { Padding = new Thickness(24), RowSpacing = 16 };
    private readonly ListView history = new() { SelectionMode = ListViewSelectionMode.Single };
    private readonly TextBox title = new() { Header = "Nombre de la grabación", PlaceholderText = "Ej.: Reunión de coordinación", MaxLength = 300, MinWidth = 280 };
    private readonly TextBlock clock = new() { VerticalAlignment = VerticalAlignment.Center };
    private readonly TextBlock heading = new() { FontSize = 24, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap };
    private readonly TextBlock status = new() { TextWrapping = TextWrapping.Wrap };
    private readonly ProgressBar progress = new() { Minimum = 0, Maximum = 100 };
    private readonly StackPanel actions = new() { Orientation = Orientation.Horizontal, Spacing = 8 };
    private readonly StackPanel segments = new() { Spacing = 8 };
    private readonly StackPanel summaryPanel = new() { Spacing = 12 };
    private readonly InfoBar message = new() { IsClosable = true };
    private readonly MediaPlayer player = new() { AutoPlay = false };
    private readonly MediaPlayerElement playback = new() { AreTransportControlsEnabled = true, Height = 80 };
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly Stopwatch recordingTime = new();
    private readonly Button record;
    private readonly Button stop;
    private readonly Button settings;
    private readonly Button import;
    private AppOptions options;
    private AppController controller;
    private string? selectedId;
    private string? detailKey;
    private string? playbackId;
    private bool updatingHistory;
    private bool busy;
    private bool closing;
    private bool allowClose;
    private MeetingDetail? detail;
    private sealed record HistoryRow(Meeting Meeting)
    {
        public string Label => Meeting.Title + "\n" + StatusLabel(Meeting.Status) + " · " + FormatDate(Meeting.RecordedAt);
    }
    public MainWindow(AppOptions options)
    {
        this.options = options;
        controller = CreateController(options);
        Title = "Ñe'eñemi";
        AppWindow.Resize(new SizeInt32(1150, 760));
        record = Button("Grabar", async () =>
        {
            var m = await controller.StartRecordingAsync(title.Text); selectedId = m.Id; recordingTime.Restart(); Refresh();
        });
        stop = Button("Terminar y procesar", async () => { await controller.StopRecordingAsync(); recordingTime.Stop(); Refresh(); });
        settings = Button("Configuración", ShowSettingsAsync);
        import = Button("Importar grabaciones", ImportAsync);
        BuildLayout();
        Content = root;
        history.SelectionChanged += (_, _) =>
        {
            if (updatingHistory) return;
            selectedId = (history.SelectedItem as HistoryRow)?.Meeting.Id; detailKey = null; RenderDetail();
        };
        timer.Tick += (_, _) =>
        {
            clock.Text = controller.IsRecording ? "Grabando · " + MarkdownExporter.Clock((int)recordingTime.ElapsedMilliseconds) : "";
            UpdateControls();
        };
        timer.Start();
        AppWindow.Closing += async (_, args) =>
        {
            if (allowClose) return;
            args.Cancel = true;
            if (closing) return;
            closing = true;
            try
            {
                if (controller.IsRecording && !await ConfirmAsync("Cerrar durante la grabación", "Se guardará el audio conservado. El procesamiento pendiente continuará al volver a abrir la aplicación.", "Guardar y cerrar")) return;
                timer.Stop(); ClearPlayback(); player.Dispose();
                await controller.DisposeAsync(); allowClose = true; Close();
            }
            catch (Exception e) { ShowError(e); }
            finally { closing = false; }
        };
        root.Loaded += async (_, _) => await RunAsync(async () =>
        {
            await controller.InitializeAsync(); Refresh();
            using var setup = new ResourceSetup(options);
            if (!setup.HasWhisper) ShowMessage("Prepara los recursos locales desde Configuración antes de transcribir. Puedes consultar e importar tu historial.", InfoBarSeverity.Informational);
        });
    }
    private AppController CreateController(AppOptions value)
    {
        var repo = new MeetingsRepository(Path.Combine(value.DataDirectory, "neenemi.sqlite"));
        var app = new AppController(repo, new WindowsAudioRecorder(), new WhisperTranscriber(value), new OllamaSummarizer(value), value);
        app.Changed += () => DispatcherQueue.TryEnqueue(Refresh);
        return app;
    }
    private static string FormatDate(string value) => DateTimeOffset.TryParse(value, out var date) ? date.ToLocalTime().ToString("dd/MM/yyyy HH:mm") : value;
    private static string StatusLabel(string value) => value switch
    {
        "grabando" => "Grabando", "interrumpida" => "Interrumpida", "en_cola" => "En cola", "transcribiendo" => "Transcribiendo", "listo" => "Lista", "error" => "Error", _ => value
    };
    private Button Button(string text, Func<Task> action)
    {
        var button = new Button { Content = text };
        AutomationProperties.SetName(button, text);
        button.Click += async (_, _) => await RunAsync(action);
        return button;
    }
    private static TextBlock Text(string value, double size = 14) => new() { Text = value, FontSize = size, TextWrapping = TextWrapping.Wrap, IsTextSelectionEnabled = true };
    private void BuildLayout()
    {
        root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        root.RowDefinitions.Add(new() { Height = new GridLength(1, GridUnitType.Star) });
        root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        var header = new Grid(); header.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) }); header.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        header.Children.Add(Text("Ñe'eñemi", 28));
        var tools = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 }; tools.Children.Add(import); tools.Children.Add(settings);
        Grid.SetColumn(tools, 1); header.Children.Add(tools); root.Children.Add(header);
        var capture = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12, VerticalAlignment = VerticalAlignment.Bottom };
        capture.Children.Add(title); record.VerticalAlignment = VerticalAlignment.Bottom; stop.VerticalAlignment = VerticalAlignment.Bottom;
        capture.Children.Add(record); capture.Children.Add(stop); capture.Children.Add(clock); Grid.SetRow(capture, 1); root.Children.Add(capture);
        var body = new Grid { ColumnSpacing = 24 }; body.ColumnDefinitions.Add(new() { Width = new GridLength(280) }); body.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        var left = new Grid { RowSpacing = 12 }; left.RowDefinitions.Add(new() { Height = GridLength.Auto }); left.RowDefinitions.Add(new() { Height = new GridLength(1, GridUnitType.Star) });
        left.Children.Add(Text("Grabaciones", 18)); history.DisplayMemberPath = nameof(HistoryRow.Label); AutomationProperties.SetName(history, "Historial de grabaciones"); Grid.SetRow(history, 1); left.Children.Add(history); body.Children.Add(left);
        var right = new Grid { RowSpacing = 12 };
        for (int i = 0; i < 5; i++) right.RowDefinitions.Add(new() { Height = GridLength.Auto });
        right.RowDefinitions.Add(new() { Height = new GridLength(1, GridUnitType.Star) });
        right.Children.Add(heading); Grid.SetRow(status, 1); right.Children.Add(status); Grid.SetRow(progress, 2); right.Children.Add(progress); Grid.SetRow(actions, 3); right.Children.Add(actions);
        playback.SetMediaPlayer(player); Grid.SetRow(playback, 4); right.Children.Add(playback);
        var pivot = new Pivot();
        pivot.Items.Add(new PivotItem { Header = "Transcripción", Content = new ScrollViewer { Content = segments, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled } });
        pivot.Items.Add(new PivotItem { Header = "Resumen", Content = new ScrollViewer { Content = summaryPanel, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled } });
        Grid.SetRow(pivot, 5); right.Children.Add(pivot); Grid.SetColumn(right, 1); body.Children.Add(right); Grid.SetRow(body, 2); root.Children.Add(body);
        Grid.SetRow(message, 3); root.Children.Add(message);
    }
    private void UpdateControls()
    {
        record.IsEnabled = !busy && !controller.IsRecording;
        stop.IsEnabled = !busy && controller.IsRecording;
        title.IsEnabled = !controller.IsRecording && !busy;
        settings.IsEnabled = !busy && !controller.IsRecording;
        import.IsEnabled = !busy && !controller.IsRecording;
    }
    private void Refresh()
    {
        if (allowClose || closing) return;
        var rows = controller.Repository.List().Select(m => new HistoryRow(m)).ToArray();
        updatingHistory = true;
        try
        {
            history.ItemsSource = rows;
            history.SelectedItem = rows.FirstOrDefault(r => r.Meeting.Id == selectedId);
        }
        finally { updatingHistory = false; }
        RenderDetail(); UpdateControls();
    }
    private void RenderDetail()
    {
        detail = selectedId is null ? null : controller.Repository.GetDetail(selectedId);
        string key = detail is null ? "empty" : string.Join('|', detail.Meeting.Id, detail.Meeting.Status, detail.Meeting.Progress, detail.Meeting.Error, detail.Meeting.SummaryStatus, detail.Meeting.SummaryError, detail.Summary?.GeneratedAt);
        if (detailKey == key) return;
        detailKey = key;
        actions.Children.Clear(); segments.Children.Clear(); summaryPanel.Children.Clear();
        if (detail is null)
        {
            heading.Text = "Tus reuniones, en tu equipo"; status.Text = "Graba una reunión o selecciona una del historial."; progress.Visibility = Visibility.Collapsed;
            segments.Children.Add(Text("Todavía no hay una grabación seleccionada.")); summaryPanel.Children.Add(Text("El resumen aparecerá después de transcribir."));
            ClearPlayback(); return;
        }
        var m = detail.Meeting; string id = m.Id;
        heading.Text = m.Title;
        status.Text = StatusLabel(m.Status) + " · " + FormatDate(m.RecordedAt) + (m.DurationS is { } duration ? " · " + MarkdownExporter.Clock(duration * 1000) : "") + (m.Error is not null ? "\n" + m.Error : "");
        progress.Visibility = m.Status is "transcribiendo" or "en_cola" ? Visibility.Visible : Visibility.Collapsed; progress.Value = m.Progress;
        if (m.Status != "grabando" && m.ChunkCount > 0) actions.Children.Add(Button("Reproducir", () => PlayAsync(id)));
        if (m.Status == "interrumpida") actions.Children.Add(Button("Procesar conservado", () => { controller.ProcessInterrupted(id); return Task.CompletedTask; }));
        if (m.Status == "error") actions.Children.Add(Button("Reintentar", () => { controller.Retry(id); return Task.CompletedTask; }));
        if (m.Status is "en_cola" or "transcribiendo" || m.SummaryStatus is "queued" or "running") actions.Children.Add(Button("Cancelar", () => controller.CancelAsync(id)));
        if (id != controller.RecordingId) actions.Children.Add(Button("Eliminar", async () =>
        {
            if (!await ConfirmAsync("Eliminar grabación", "Se eliminarán el audio, la transcripción y el resumen de «" + m.Title + "». Esta acción no se puede deshacer.", "Eliminar")) return;
            ClearPlayback(); await controller.DeleteAsync(id); selectedId = null; Refresh();
        }));
        if (playbackId != id) ClearPlayback();
        if (detail.Segments.Count == 0) segments.Children.Add(Text(m.Status == "listo" ? "No se detectó texto hablado. No se generará un resumen." : "La transcripción aparecerá al terminar el procesamiento."));
        else
        {
            var export = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
            export.Children.Add(Button("Copiar texto", () => CopyAsync(MarkdownExporter.Transcript(controller.Repository.GetDetail(id)!))));
            export.Children.Add(Button("Exportar transcripción", () => ExportAsync(false, id))); segments.Children.Add(export);
            foreach (var segment in detail.Segments)
            {
                var button = Button("Ir a " + MarkdownExporter.Clock(segment.StartMs), () => PlayAsync(id, segment.StartMs));
                button.HorizontalAlignment = HorizontalAlignment.Stretch; button.HorizontalContentAlignment = HorizontalAlignment.Left;
                button.Content = Text("[" + MarkdownExporter.Clock(segment.StartMs) + "] " + segment.Text);
                segments.Children.Add(button);
            }
        }
        summaryPanel.Children.Add(Text("Generado por IA. Verifica acuerdos, nombres y fechas con la transcripción."));
        summaryPanel.Children.Add(Text(m.SummaryStatus switch { "queued" => "Resumen en cola", "running" => "Generando resumen local…", "error" => "No se pudo generar el resumen: " + m.SummaryError, "ready" => "Resumen listo", _ => "Sin resumen" }));
        if (m.Status == "listo" && detail.Segments.Count > 0)
        {
            var button = Button(detail.Summary is null ? "Generar resumen" : "Regenerar resumen", () => { controller.RequestSummary(id); return Task.CompletedTask; });
            button.IsEnabled = m.SummaryStatus is not ("queued" or "running"); summaryPanel.Children.Add(button);
        }
        if (detail.Summary is not null)
        {
            var export = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
            export.Children.Add(Button("Copiar resumen", () => CopyAsync(MarkdownExporter.Summary(controller.Repository.GetDetail(id)!))));
            export.Children.Add(Button("Exportar resumen", () => ExportAsync(true, id))); summaryPanel.Children.Add(export);
            summaryPanel.Children.Add(Text(MarkdownExporter.Summary(detail)));
            summaryPanel.Children.Add(Text("Consultar segmentos citados", 18));
            var refs = detail.Summary.Document.Topics.Concat(detail.Summary.Document.Decisions).SelectMany(i => i.Sources).Concat(detail.Summary.Document.Actions.SelectMany(a => a.Sources)).Distinct().Order();
            foreach (int seq in refs)
            {
                var segment = detail.Segments.FirstOrDefault(s => s.Seq == seq);
                if (segment is not null) summaryPanel.Children.Add(Button("Escuchar " + MarkdownExporter.Clock(segment.StartMs), () => PlayAsync(id, segment.StartMs)));
            }
        }
    }
    private void ClearPlayback()
    {
        var source = player.Source as IDisposable;
        player.Source = null; source?.Dispose(); playbackId = null;
    }
    private async Task PlayAsync(string id, int? startMs = null)
    {
        if (playbackId != id)
        {
            string path = await controller.PreparePlaybackAsync(id);
            ClearPlayback();
            var opened = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            void OnOpened(MediaPlayer sender, object args) => opened.TrySetResult();
            void OnFailed(MediaPlayer sender, MediaPlayerFailedEventArgs args) => opened.TrySetException(new InvalidOperationException(args.ErrorMessage));
            player.MediaOpened += OnOpened; player.MediaFailed += OnFailed;
            try
            {
                player.Source = MediaSource.CreateFromUri(new Uri(path));
                await opened.Task.WaitAsync(TimeSpan.FromSeconds(30));
                playbackId = id;
            }
            catch { ClearPlayback(); throw; }
            finally { player.MediaOpened -= OnOpened; player.MediaFailed -= OnFailed; }
        }
        if (startMs is { } ms) player.PlaybackSession.Position = TimeSpan.FromMilliseconds(ms);
        player.Play();
    }
    private static Task CopyAsync(string text)
    {
        var data = new DataPackage(); data.SetText(text); Clipboard.SetContent(data); return Task.CompletedTask;
    }
    private async Task ExportAsync(bool summary, string id)
    {
        var d = controller.Repository.GetDetail(id) ?? throw new InvalidOperationException("Grabación inexistente.");
        var picker = new FileSavePicker { SuggestedFileName = MarkdownExporter.SafeFileName(d.Meeting.Title + (summary ? "-resumen" : ""), "md"), SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
        picker.FileTypeChoices.Add("Markdown", new List<string> { ".md" });
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this));
        var file = await picker.PickSaveFileAsync();
        if (file is not null) { await Windows.Storage.FileIO.WriteTextAsync(file, summary ? MarkdownExporter.Summary(d) : MarkdownExporter.Transcript(d)); ShowMessage("Archivo exportado.", InfoBarSeverity.Success); }
    }
    private async Task ImportAsync()
    {
        var picker = new FileOpenPicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary }; picker.FileTypeFilter.Add(".sqlite"); picker.FileTypeFilter.Add(".db");
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this));
        var file = await picker.PickSingleFileAsync(); if (file is null) return;
        if (!await ConfirmAsync("Importar historial", "Cierra la versión anterior o DCSS. Se copiarán solo las grabaciones y sus asociaciones históricas; no se sobrescribirá el destino ni se modificará el origen.", "Importar")) return;
        int count = await controller.ImportAsync(file.Path); Refresh(); ShowMessage($"Se importaron {count} grabaciones.", InfoBarSeverity.Success);
    }
    private async Task<bool> ConfirmAsync(string title, string description, string accept)
    {
        var dialog = new ContentDialog { XamlRoot = root.XamlRoot, Title = title, Content = Text(description), PrimaryButtonText = accept, CloseButtonText = "Cancelar", DefaultButton = ContentDialogButton.Close };
        return await dialog.ShowAsync() == ContentDialogResult.Primary;
    }
    private async Task ShowSettingsAsync()
    {
        var panel = new StackPanel { Spacing = 12, MinWidth = 420 };
        panel.Children.Add(Text("Perfil CPU: Whisper medium Q5_0. Una tarea de IA a la vez. En 8 GB, comprueba memoria y tiempos antes de usar reuniones largas."));
        var model = new ComboBox { Header = "Modelo local de resumen", ItemsSource = new[] { "qwen3:1.7b", "qwen3:4b", "qwen3:8b" }, SelectedItem = options.OllamaModel, HorizontalAlignment = HorizontalAlignment.Stretch };
        var threads = new NumberBox { Header = "Hilos CPU", Minimum = 1, Maximum = 16, Value = options.CpuThreads, SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Compact };
        var context = new NumberBox { Header = "Contexto (tokens; más contexto usa más RAM)", Minimum = 8192, Maximum = 32768, Value = options.ContextTokens, SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Compact };
        var automatic = new CheckBox { Content = "Generar resumen después de transcribir", IsChecked = options.AutoSummarize };
        panel.Children.Add(model); panel.Children.Add(threads); panel.Children.Add(context); panel.Children.Add(automatic);
        panel.Children.Add(Text("Datos: " + options.DataDirectory));
        var setupStatus = Text("La primera preparación descarga los modelos. Después se procesan localmente.");
        panel.Children.Add(setupStatus);
        using var cancellation = new CancellationTokenSource();
        bool preparing = false; Task preparation = Task.CompletedTask;
        var setupButtons = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        var whisper = new Button { Content = "Preparar Whisper" }; var ollama = new Button { Content = "Preparar resumen" }; var cancel = new Button { Content = "Cancelar descarga", IsEnabled = false };
        setupButtons.Children.Add(whisper); setupButtons.Children.Add(ollama); setupButtons.Children.Add(cancel); panel.Children.Add(setupButtons);
        var install = new HyperlinkButton { Content = "Instalar Ollama para Windows", NavigateUri = new Uri("https://ollama.com/download/windows") }; panel.Children.Add(install);
        var dialog = new ContentDialog { XamlRoot = root.XamlRoot, Title = "Configuración local", Content = new ScrollViewer { Content = panel }, PrimaryButtonText = "Guardar", CloseButtonText = "Cerrar" };
        async Task Prepare(bool summary)
        {
            if (preparing) return;
            preparing = true; whisper.IsEnabled = false; ollama.IsEnabled = false; cancel.IsEnabled = true; dialog.IsPrimaryButtonEnabled = false;
            try
            {
                var value = options with { OllamaModel = (string)model.SelectedItem };
                using var setup = new ResourceSetup(value);
                var report = new Progress<string>(text => setupStatus.Text = text);
                if (summary) await setup.PrepareOllamaAsync(report, cancellation.Token); else await setup.EnsureWhisperAsync(report, cancellation.Token);
            }
            catch (OperationCanceledException) { setupStatus.Text = "Descarga cancelada. Cierra y vuelve a abrir Configuración para reintentar."; }
            catch (Exception e) { setupStatus.Text = e.Message; }
            finally { preparing = false; whisper.IsEnabled = !cancellation.IsCancellationRequested; ollama.IsEnabled = !cancellation.IsCancellationRequested; cancel.IsEnabled = false; dialog.IsPrimaryButtonEnabled = true; }
        }
        whisper.Click += async (_, _) => { preparation = Prepare(false); await preparation; };
        ollama.Click += async (_, _) => { preparation = Prepare(true); await preparation; };
        cancel.Click += (_, _) => cancellation.Cancel();
        dialog.Closing += (_, args) => { if (preparing) { args.Cancel = true; setupStatus.Text = "Cancela o espera la preparación antes de cerrar."; } };
        var result = await dialog.ShowAsync();
        cancellation.Cancel(); await preparation;
        if (result != ContentDialogResult.Primary) return;
        var changed = options with { OllamaModel = (string)model.SelectedItem, CpuThreads = (int)threads.Value, ContextTokens = (int)context.Value, AutoSummarize = automatic.IsChecked == true };
        SettingsStore.Validate(changed);
        ClearPlayback();
        await controller.DisposeAsync(); SettingsStore.Save(changed); options = changed; controller = CreateController(changed);
        await controller.InitializeAsync(); detailKey = null; Refresh(); ShowMessage("Configuración guardada.", InfoBarSeverity.Success);
    }
    private async Task RunAsync(Func<Task> action)
    {
        if (busy) return;
        busy = true; UpdateControls();
        try { await action(); }
        catch (Exception e) { ShowError(e); }
        finally { busy = false; UpdateControls(); }
    }
    private void ShowError(Exception error) => ShowMessage(error.Message, InfoBarSeverity.Error);
    private void ShowMessage(string text, InfoBarSeverity severity) { message.Message = text; message.Severity = severity; message.IsOpen = true; }
}
