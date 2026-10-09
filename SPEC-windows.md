# Ñe'eñemi Windows

Alcance aprobado: aplicación Windows nativa WinUI 3 + C#, SQLite, whisper.cpp medium Q5_0 y Ollama/Qwen3 4B. CPU, mínimo 8 GB de RAM. Solo nombre de grabación: no selección ni presentación de clientes. Las asociaciones históricas permanecen en SQLite.

## Módulos y orden

| Id | Responsabilidad | Dependencias |
|---|---|---|
| datos | SQLite compatible con esquema 1, migración aditiva y resúmenes separados | — |
| audio-transcripcion | PCM de micrófono guardado cada 30 segundos, Whisper local, recuperación | datos |
| resumen-local | Ollama local, resumen por bloques, referencias a segmentos, descarga del modelo | datos, transcripción terminada |
| app-windows | WinUI, reproducción, exportación, configuración e instalador | anteriores |

## Contrato y aceptación

- Aplicación y núcleo separados: `native/Neenemi.App` (WinUI) y `native/Neenemi.Core` (net10.0).
- La app llama servicios C# directamente; no Express, React, Electron ni servidor HTTP de aplicación.
- `MeetingsRepository` preserva esquema histórico, incorpora formato de audio y una tabla de resumen. Nueva grabación sin cliente. Rechaza bases DCSS como perfil activo y versiones futuras de Ñe'eñemi. Importación explícita desde Ñe'eñemi o grabaciones compatibles DCSS: origen solo lectura y copia SQLite consistente, nunca sobrescribir datos existentes ni importar otros módulos de DCSS.
- Grabación nativa mono PCM 16-bit; persistencia periódica y del último bloque al detener. Los WebM históricos se leen sin convertir la base original.
- Una cola durable procesa transcripción y resumen, nunca en paralelo; guardar la transcripción y encolar su resumen automático es atómico. Cancelar mata el proceso de Whisper o cancela la petición Ollama. Cierre conserva pendientes para reiniciar y espera/cancela conversiones de reproducción. Eliminar retira la copia temporal de reproducción, sin alterar respaldos.
- Resumen estructurado: visión general, temas, decisiones y acciones (responsable/fecha solo si se mencionan), con referencias a segmentos. Texto de transcripción tratado como datos, no instrucciones. Reuniones largas: bloques acotados y consolidación recursiva; ninguna truncación silenciosa.
- Estados independientes para resumen; un fallo de Ollama no invalida una transcripción lista ni borra el resumen previo. Resúmenes identificados como IA, con modelo y fecha.
- Pantallas: nombre y controles de grabación, historial, audio con búsqueda por segmento, transcripción/resumen, cancelar/reintentar/eliminar con confirmación, copiar/exportar Markdown, ajustes y preparación de modelos sin terminal.
- Instalación x64 autocontenida con WinUI/.NET y recursos necesarios. Ollama es dependencia local independiente; asistente ofrece instalación oficial y descarga de modelo mediante API local.
- RAM y latencia deben medirse en Windows de 8 GB; no se declara rendimiento garantizado.

## Estilo y fronteras

C# con nullable, namespaces `Neenemi.Core`/`Neenemi.App`, async para procesos y red, consultas parametrizadas, conexiones SQLite cortas y transacciones atómicas. Sin abstracciones de infraestructura genéricas.

```csharp
public sealed record TranscriptSegment(int Seq, int StartMs, int EndMs, string Text);
```

Siempre: preservar originales y estados, validar respuestas externas y usar CPU como base. Nunca: inventar resumen, descartar texto excedente, borrar datos históricos, usar servicios cloud o mantener la ruta Electron como alternativa de ejecución.

## Comandos de verificación

- Núcleo: `dotnet build native/Neenemi.Core/Neenemi.Core.csproj`
- Pruebas: `dotnet test native/Neenemi.Core.Tests/Neenemi.Core.Tests.csproj`
- Windows: `dotnet build native/Neenemi.App/Neenemi.App.csproj -p:Platform=x64`
- Ejecutar (Windows): `dotnet run --project native/Neenemi.App/Neenemi.App.csproj -p:Platform=x64`
- Empaquetar (Windows): `powershell -ExecutionPolicy Bypass -File scripts/package-windows.ps1`

Pruebas permanentes: migración sin pérdida, transiciones, cancelación/recuperación, límites de bloques y validación de referencias. Smoke: audio real por ffmpeg/Whisper y respuesta real Ollama cuando disponibles. WinUI y micrófono requieren Windows; registrar explícitamente cualquier verificación no realizada.
