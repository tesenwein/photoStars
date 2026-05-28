import { contextBridge, ipcRenderer } from 'electron';
import {
  IpcChannels,
  type AnalysisReadyPayload,
  type PhotoStarsApi,
  type PreviewReadyPayload,
} from '../shared/ipc';

const api: PhotoStarsApi = {
  ping: () => ipcRenderer.invoke(IpcChannels.ping),
  selectFolder: () => ipcRenderer.invoke(IpcChannels.selectFolder),
  ingestFolder: (folder, opts) => ipcRenderer.invoke(IpcChannels.ingestFolder, folder, opts),
  clearCache: () => ipcRenderer.invoke(IpcChannels.clearCache),
  onPreviewReady: (cb) => {
    const listener = (_e: unknown, payload: PreviewReadyPayload) => cb(payload);
    ipcRenderer.on(IpcChannels.previewReady, listener);
    return () => ipcRenderer.removeListener(IpcChannels.previewReady, listener);
  },
  onAnalysisReady: (cb) => {
    const listener = (_e: unknown, payload: AnalysisReadyPayload) => cb(payload);
    ipcRenderer.on(IpcChannels.analysisReady, listener);
    return () => ipcRenderer.removeListener(IpcChannels.analysisReady, listener);
  },
  writeRatings: (items) => ipcRenderer.invoke(IpcChannels.writeRatings, items),
};

contextBridge.exposeInMainWorld('api', api);
