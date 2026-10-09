using System.Text.Json;

namespace Neenemi.Core;

public static class SettingsStore
{
    private static string SettingsPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "neenemi", "settings.json");
    public static AppOptions Load()
    {
        if (!File.Exists(SettingsPath)) return new();
        var options = JsonSerializer.Deserialize<AppOptions>(File.ReadAllText(SettingsPath)) ?? throw new InvalidDataException("Configuración vacía.");
        Validate(options);
        return options;
    }
    public static void Save(AppOptions options)
    {
        Validate(options);
        Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath)!);
        string temp = SettingsPath + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(options, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temp, SettingsPath, overwrite: true);
    }
    public static void Validate(AppOptions options)
    {
        if (options.OllamaModel is not ("qwen3:1.7b" or "qwen3:4b" or "qwen3:8b"))
            throw new ArgumentException("Selecciona un modelo Qwen3 local: 1.7b, 4b u 8b.");
        if (options.ContextTokens < 8192 || options.ContextTokens > 32768 || options.CpuThreads < 1 || options.CpuThreads > 16)
            throw new ArgumentException("Contexto válido: 8192–32768; hilos CPU: 1–16.");
        if (options.WhisperModel != "ggml-medium-q5_0.bin") throw new ArgumentException("El perfil usa Whisper medium Q5_0.");
        if (!Path.IsPathFullyQualified(options.ToolsDirectory) || !Path.IsPathFullyQualified(options.DataDirectory))
            throw new ArgumentException("Las carpetas deben tener rutas absolutas.");
    }
}
