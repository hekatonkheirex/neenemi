# Distribución Windows de Ñe'eñemi

## Generar el instalador

Ejecuta en Windows x64 con **.NET SDK 10**, **Inno Setup 6** y conexión para la preparación inicial. Si `ISCC.exe` no está en PATH ni en la ubicación habitual, pasa `-InnoCompiler` al script.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-windows.ps1
```

El script ejecuta las pruebas del núcleo, publica WinUI en Release con .NET y Windows App SDK autocontenidos, prepara ffmpeg/whisper.cpp/medium Q5_0 y compila `installer/neenemi.iss`. Salida prevista: `release/Neenemi-0.1.0-Setup.exe`. Un error de pruebas, descarga, firma de la dependencia Microsoft o compilación aborta el empaquetado.

El instalador instala por usuario en `%LOCALAPPDATA%\Programs\NeenemiNative`, crea acceso de inicio y ofrece acceso de escritorio. No modifica DCSS ni incluye bases personales. Si falta Visual C++ Redistributable x64, instala la copia oficial cuya firma Microsoft verifica el script; esto puede solicitar elevación y reinicio. No se requiere instalar .NET o Windows App SDK por separado.

Ollama se instala separadamente desde el enlace oficial de Ajustes; no se incluye un modelo LLM dentro del instalador. La preparación desde la app descarga `qwen3:4b` mediante el motor local y muestra progreso/cancelación. Después de preparar recursos, el uso no requiere terminal ni red. Los modelos 1.7B y 8B son elecciones explícitas en Ajustes, no sustituciones automáticas.

Esta automatización no configura firma de código de la app ni del instalador y no publica releases. Windows puede mostrar SmartScreen para un instalador sin firma. No presentes una compilación no probada como una entrega validada.

## Datos

El perfil es `%APPDATA%\neenemi`, compartido con las versiones standalone antiguas de Ñe'eñemi, no con DCSS. Cierra la app antigua antes del primer inicio nativo. La actualización a esquema 2 conserva datos y crea `neenemi.sqlite.before-native-v2.bak` antes de migrar. Una copia de respaldo anterior es necesaria para regresar a la app antigua.

**Importar** permite trasladar otra base de Ñe'eñemi o grabaciones compatibles de DCSS mediante lectura y snapshot consistente del origen. No sobrescribe grabaciones existentes ni modifica la base fuente. No distribuyas `data/`, ajustes personales, respaldos, logs ni muestras de pruebas. El desinstalador no borra el perfil de datos.

## Recorrido obligatorio en Windows

- [ ] Compilar/publicar sin desactivar `WindowsAppSDKSelfContained` ni la generación de PRI.
- [ ] Instalar en un Windows x64 limpio, comprobar dependencia Visual C++ y acceso de inicio.
- [ ] Abrir la ventana; solo se pide el nombre de la grabación, sin selector de cliente.
- [ ] Preparar Ollama/Qwen3 desde Ajustes; comprobar descargar, cancelar y volver a preparar.
- [ ] Grabar más de 30 segundos con micrófono real, detener y comprobar la transcripción y el resumen automático.
- [ ] Probar permiso denegado, micrófono ausente y cierre durante grabación; comprobar audio conservado y recuperación.
- [ ] Reproducir, saltar desde un segmento y desde una referencia del resumen; copiar/exportar ambos Markdown.
- [ ] Cancelar y reintentar transcripción/resumen; un fallo del resumen mantiene texto y resumen anterior.
- [ ] Cerrar mientras se procesa y volver a abrir; comprobar recuperación de la cola.
- [ ] Eliminar después de reproducir, comprobar retirada de datos y archivo temporal; comprobar que no se recrean tras cancelar.
- [ ] Migrar un perfil antiguo e importar otra base sin modificar sus originales; comprobar asociaciones históricas preservadas pero no mostradas.
- [ ] Medir RAM máxima, latencia y respuesta de la interfaz en una laptop de 8 GB sin GPU dedicada. Usar el perfil aprobado 4B/medium, sin presentar resultados de otro equipo como equivalentes.
- [ ] Desinstalar y comprobar que la carpeta de datos continúa intacta.

## Evidencia disponible y límite actual

El núcleo se ejecuta en Linux; hay pruebas de migración/importación, cancelación/recuperación, separación de estados y límites de resumen. Se ejecutaron whisper.cpp medium Q5_0 y Qwen3 4B reales en CPU, con descarga posterior del LLM de memoria, y la preparación de recursos Windows con hashes verificados.

**No se generó ni ejecutó un instalador Windows en este entorno Linux.** La comprobación anterior de tipos C# correspondía al arranque sin XAML y no valida la inicialización actual. MSBuild reconoce `App.xaml` como `ApplicationDefinition`; el compilador XAML y las tareas de manifiesto/PRI requieren Windows. El usuario generó e instaló el paquete anterior, pero informó un fallo de arranque en `Microsoft.UI.Xaml.dll` con `c000027b`. La reparación incorpora la inicialización XAML estándar; su arranque, captura de micrófono y consumo mínimo siguen pendientes de comprobar. Las pruebas del núcleo no sustituyen la aceptación de la aplicación instalada.

## Diagnóstico de cierre al iniciar

`c000027b` en `Microsoft.UI.Xaml.dll` no revela la excepción interna. El arranque registra fases y errores completos en `%LOCALAPPDATA%\neenemi\logs\startup.log`: JSON por línea, versión informativa, identidad del módulo, PID y sesión. El archivo se reemplaza al iniciar la instancia principal; no se registran audio ni transcripciones y no se envía información por red.

Después de actualizar y publicar en Windows, puedes ejecutar `release\windows-x64\neenemi.exe` directamente sin reinstalar. Esto evita confundir una compilación nueva con archivos antiguos de la instalación. Si necesitas comprobar la copia instalada, compara `Get-FileHash` de `neenemi.dll` en ambas carpetas.

Para consultar el registro después del fallo:

```powershell
$log = Join-Path $env:LOCALAPPDATA 'neenemi\logs\startup.log'
Get-Content $log | ForEach-Object { $_ | ConvertFrom-Json } | Format-List timestamp,event,data
```

Los eventos `startup_failure` incluyen fase, HRESULT, mensaje WinUI cuando está disponible y `Exception.ToString()` con excepción interna y stack. Los manejadores no marcan la excepción WinUI como resuelta ni continúan con una interfaz rota. Si no se crea el archivo al ejecutar la compilación nueva, puede haber un fallo nativo anterior a `Main`; se necesita entonces evidencia nativa adicional, no una modificación especulativa de dependencias. Revisa el contenido antes de compartirlo: una excepción puede incluir rutas locales.

