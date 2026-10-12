import { contextBridge, ipcRenderer } from 'electron';
import type { CoreEvent, DesktopAPI } from '../src/shared/contracts';
const api: DesktopAPI = {
  call: (method, params) => ipcRenderer.invoke('core:call', method, params),
  subscribe: listener => {
    const receive = (_event: Electron.IpcRendererEvent, value: CoreEvent) => listener(value);
    ipcRenderer.on('core:event', receive);
    return () => ipcRenderer.removeListener('core:event', receive);
  },
  playback: id => ipcRenderer.invoke('desktop:playback', id),
  importDatabase: () => ipcRenderer.invoke('desktop:import'),
  exportMarkdown: (id, summary) => ipcRenderer.invoke('desktop:export', id, summary),
  copyMarkdown: (id, summary) => ipcRenderer.invoke('desktop:copy', id, summary),
  onCaptureStop: listener => {
    const receive = async (_event: Electron.IpcRendererEvent, id: number) => {
      try { await listener(); ipcRenderer.send('capture:stopped', { id }); }
      catch (error) { ipcRenderer.send('capture:stopped', { id, error: String(error) }); }
    };
    ipcRenderer.on('capture:stop', receive);
    return () => ipcRenderer.removeListener('capture:stop', receive);
  }
};
contextBridge.exposeInMainWorld('neenemi', api);
