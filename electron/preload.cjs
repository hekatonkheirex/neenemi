const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dataSystemsDesktop', {
  saveBackup: () => ipcRenderer.invoke('datasystems:save-backup'),
  saveCurrentPageAsPdf: (options = {}) => ipcRenderer.invoke('datasystems:save-current-page-as-pdf', options),
  saveStructuredReportAsPdf: (options = {}) => ipcRenderer.invoke('datasystems:save-structured-report-as-pdf', options),
});
