// Genera el PDF de "Imprimir / PDF" del módulo MPS con Electron real (necesita pantalla; ventana oculta).
// Reproduce el flujo de la app: preload real y el mismo printToPDF que electron/main.cjs (A4 apaisado, con fondos).
//   npm run dev:server & npx vite --host 127.0.0.1 --port 5173 &
//   node_modules/.bin/electron scripts/mps-pdf-smoke.cjs http://127.0.0.1:5173/ salida.pdf ["imageFORCE 6155" [25000]]
// Sirve para comparar antes y después de un cambio de CSS: pdftoppm + compare -metric AE.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('mps-pdf-smoke.cjs')) + 1);
const [url, out, model = 'imageFORCE 6155', volume = '25000'] = args;
if (!url || !out) {
  console.error('Uso: electron scripts/mps-pdf-smoke.cjs <url> <salida.pdf> [modelo] [volumen]');
  process.exit(2);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

ipcMain.handle('datasystems:save-current-page-as-pdf', async (event, options) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window.setBackgroundColor('#ffffff');
  const pdf = await window.webContents.printToPDF({ pageSize: 'A4', landscape: options?.landscape === true, printBackground: true, displayHeaderFooter: false });
  fs.writeFileSync(out, pdf);
  return { saved: true, filePath: out };
});

process.on('unhandledRejection', (error) => { console.error('ERR', error); app.exit(2); });

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440, height: 920, show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'electron', 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  const run = (code) => win.webContents.executeJavaScript(code, true);
  await win.loadURL(url);
  await run(`localStorage.setItem('datasystems-suite-last-module','mps')`);
  await win.loadURL(url);
  await sleep(2500);
  const result = await run(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const btn = (re) => [...document.querySelectorAll('.content button')].find((b) => re.test(b.textContent.trim()));
    btn(/^${model}/)?.click(); await sleep(1000);
    const vol = [...document.querySelectorAll('.content input')].find((i) => /volumen/i.test(i.closest('label')?.textContent || ''));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(vol, '${volume}');
    vol.dispatchEvent(new Event('input', { bubbles: true })); await sleep(300);
    btn(/Calcular proyección/)?.click(); await sleep(1500);
    const rows = document.querySelectorAll('table[aria-label="Proyección anual de consumibles"] tbody tr').length;
    btn(/^Imprimir \\/ PDF/)?.click();
    return { rows };
  })()`);
  await sleep(4000);
  const wrote = fs.existsSync(out) ? fs.statSync(out).size : 0;
  console.log(JSON.stringify({ ...result, wrote }));
  app.exit(wrote > 0 ? 0 : 1);
});
