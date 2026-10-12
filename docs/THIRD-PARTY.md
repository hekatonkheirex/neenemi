# Componentes de terceros

- Electron / Chromium: MIT y licencias de componentes; conservar `LICENSE` y `LICENSES.chromium.html` distribuidos con Electron. https://github.com/electron/electron
- React: MIT. https://github.com/facebook/react
- electron-vite / Vite: MIT, herramientas de compilación. https://github.com/alex8088/electron-vite
- Node.js integrado en Electron: MIT y avisos de sus componentes. SQLite (`node:sqlite`): dominio público; sin Microsoft.Data.Sqlite, SQLitePCLRaw ni addon reconstruido. https://github.com/nodejs/node
- Tailwind CSS: MIT, estilos compilados. https://github.com/tailwindlabs/tailwindcss
- Zod: MIT, validación de contratos y respuestas. https://github.com/colinhacks/zod
- fflate: MIT, extracción filtrada del paquete Whisper. https://github.com/101arrowz/fflate
- electron-builder / NSIS: MIT / zlib-libpng; herramientas de empaquetado. https://github.com/electron-userland/electron-builder
- StdUtils para NSIS: LGPL-2.1-or-later, distribuido con las herramientas de electron-builder. https://github.com/lordmulder/stdutils
- whisper.cpp v1.9.2: licencia MIT, incluida en `resources/tools/whisper/LICENSE.whisper`. https://github.com/ggml-org/whisper.cpp/tree/v1.9.2
- Whisper medium Q5_0: modelo convertido de OpenAI Whisper, licencia MIT. https://huggingface.co/ggerganov/whisper.cpp
- ffmpeg b6.1.1: ejecutable externo del release ffmpeg-static. Sus avisos, licencia y detalles de compilación/origen se incluyen en `resources/tools/ffmpeg.LICENSE` y `resources/tools/ffmpeg.README`. Consultar antes de redistribuir y conservar junto al binario. https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1
- Ollama: motor instalado independientemente, licencia MIT. https://github.com/ollama/ollama
- Qwen3: modelo descargado por Ollama bajo Apache-2.0. https://huggingface.co/Qwen/Qwen3-4B

El instalador incluye el redistribuible oficial Visual C++ firmado por Microsoft, sujeto a sus condiciones. No se incluyen los pesos Qwen3 ni el instalador Ollama dentro del paquete; el asistente abre la descarga oficial y prepara el modelo mediante la API local.
