// Smoke test con Electron real (necesita pantalla; la ventana va oculta):
//   node_modules/.bin/electron scripts/unload-guard-smoke.cjs
// Comprueba que, con beforeunload cancelando, la ventana (a) sigue abierta si se elige
// "Seguir editando" y (b) se cierra si se elige "Salir sin guardar".
const { app, BrowserWindow } = require('electron');
const { attachUnloadGuard } = require('../electron/unload-guard.cjs');

const page = 'data:text/html,<script>onbeforeunload=e=>{e.preventDefault();e.returnValue=""}</script><input>';

async function run(choice) {
  const calls = [];
  const dialog = { showMessageBoxSync: () => { calls.push(choice); return choice; } };
  const window = new BrowserWindow({ show: false });
  attachUnloadGuard(window, dialog);
  await window.loadURL(page);
  // beforeunload solo se dispara si la página recibió una interacción del usuario.
  await window.webContents.executeJavaScript('0', true);
  window.webContents.sendInputEvent({ type: 'mouseDown', x: 1, y: 1, button: 'left', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: 1, y: 1, button: 'left', clickCount: 1 });
  window.close();
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { dialogShown: calls.length, destroyed: window.isDestroyed(), window };
}

app.whenReady().then(async () => {
  const stay = await run(0);
  const leave = await run(1);
  const ok = stay.dialogShown === 1 && !stay.destroyed && leave.dialogShown === 1 && leave.destroyed;
  console.log(JSON.stringify({ stay: { dialogShown: stay.dialogShown, destroyed: stay.destroyed }, leave: { dialogShown: leave.dialogShown, destroyed: leave.destroyed }, ok }));
  if (!stay.destroyed) stay.window.destroy();
  app.exit(ok ? 0 : 1);
});
