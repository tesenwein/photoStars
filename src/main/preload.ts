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
  ingestFolder: (folder) => ipcRenderer.invoke(IpcChannels.ingestFolder, folder),
  clearCache: () => ipcRenderer.invoke(IpcChannels.clearCache),
  getHiResPreview: (p, t) => ipcRenderer.invoke(IpcChannels.getHiResPreview, p, t),
  trashFiles: (paths) => ipcRenderer.invoke(IpcChannels.trashFiles, paths),
  recordCorrection: (record) => ipcRenderer.invoke(IpcChannels.recordCorrection, record),
  readCorrections: () => ipcRenderer.invoke(IpcChannels.readCorrections),
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
