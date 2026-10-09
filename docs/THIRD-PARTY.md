# Componentes de terceros

- WinUI 3 / Windows App SDK: Microsoft; licencia MIT. https://github.com/microsoft/WindowsAppSDK
- .NET: Microsoft; licencia MIT. https://github.com/dotnet/runtime
- Microsoft.Data.Sqlite / SQLitePCLRaw: MIT / Apache-2.0; SQLite es de dominio público. https://github.com/ericsink/SQLitePCL.raw
- NAudio.WinMM: Mark Heath; licencia MIT. https://github.com/naudio/NAudio
- whisper.cpp v1.9.2: licencia MIT, incluida en `resources/whisper/LICENSE.whisper`. https://github.com/ggml-org/whisper.cpp/tree/v1.9.2
- Whisper medium Q5_0: modelo convertido de OpenAI Whisper, licencia MIT. https://huggingface.co/ggerganov/whisper.cpp
- ffmpeg b6.1.1: ejecutable externo del release ffmpeg-static. Sus avisos, licencia y detalles de compilación/origen se incluyen en `resources/ffmpeg.LICENSE` y `resources/ffmpeg.README`. Consultar estos archivos antes de redistribuir; conservarlos junto al binario. Release: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1
- Ollama: motor instalado independientemente, licencia MIT. https://github.com/ollama/ollama
- Qwen3: modelo descargado por Ollama bajo Apache-2.0. https://huggingface.co/Qwen/Qwen3-4B

El instalador incluye el redistribuible oficial Visual C++ firmado por Microsoft, sujeto a sus condiciones. No se incluyen los pesos Qwen3 ni el instalador Ollama dentro del paquete; el asistente abre la descarga oficial y prepara el modelo mediante la API local.
