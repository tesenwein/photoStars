import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { IpcChannels, type CorrectionRecord } from '../shared/ipc';
import { registerIngestHandlers } from './ingest/ingestHandler';
import { appendCorrection, readCorrections } from './learning/corrections';
import { sidecar } from './sidecar/sidecarManager';
import { exiftoolInstance } from './exiftool/exiftool';

const isDev = process.env.NODE_ENV === 'development';

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function registerMediaProtocol(): void {
  // Serves local preview files to the renderer; the path is URL-encoded into the host-less URL.
  protocol.handle('media', (request) => {
    const encoded = request.url.slice('media://get/'.length);
    const filePath = decodeURIComponent(encoded);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,  // allows preload to require('../shared/ipc')
    },
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.ping, () => 'pong');

  ipcMain.handle(IpcChannels.selectFolder, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return undefined;
    return result.filePaths[0];
  });

  ipcMain.handle(IpcChannels.recordCorrection, async (_e, record: CorrectionRecord) => {
    await appendCorrection(record);
  });

  ipcMain.handle(IpcChannels.readCorrections, async () => readCorrections());

  registerIngestHandlers();
}

app.whenReady().then(() => {
  registerMediaProtocol();
  registerIpcHandlers();
  sidecar.start();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  sidecar.shutdown();
  void exiftoolInstance.end();
});
