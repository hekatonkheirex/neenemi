/**
 * El renderer cancela beforeunload cuando hay borradores sin guardar. Electron no muestra
 * ningún aviso por sí solo: la ventana simplemente no se cierra. Aquí se le pregunta a la
 * persona y, si decide salir, event.preventDefault() ignora la cancelación y descarga la página.
 */
function attachUnloadGuard(window, dialog) {
  window.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      title: 'Cambios sin guardar',
      message: 'Hay cambios sin guardar.',
      detail: 'Si cierras o recargas ahora se perderán.',
      buttons: ['Seguir editando', 'Salir sin guardar'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (choice === 1) event.preventDefault();
  });
}

module.exports = { attachUnloadGuard };
