import { ipcMain, type WebContents } from 'electron';
import {
  IpcChannels,
  type AnalysisReadyPayload,
  type PreviewReadyPayload,
  type WriteRatingItem,
  type WriteRatingResult,
} from '../../shared/ipc';
import { scanFolder } from './scan';
import { generatePreviews } from './preview';
import { analyzeImage } from '../analysis/analyze';
import { writeRating } from '../exiftool/writeRating';

function send(sender: WebContents, channel: string, payload: unknown): boolean {
  if (sender.isDestroyed()) return false;
  sender.send(channel, payload);
  return true;
}

export function registerIngestHandlers(): void {
  ipcMain.handle(IpcChannels.ingestFolder, async (event, folder: string) => {
    const images = await scanFolder(folder);
    const sender = event.sender;

    // Fire-and-forget: previews stream back, and each one kicks off analysis.
    void generatePreviews(
      images.map((i) => ({ path: i.path, type: i.type })),
      (result: PreviewReadyPayload) => {
        if (!send(sender, IpcChannels.previewReady, result)) return;
        if (!result.previewPath) return;

        void analyzeImage(result.previewPath)
          .then((scores) => {
            const payload: AnalysisReadyPayload = { path: result.path, ...scores };
            send(sender, IpcChannels.analysisReady, payload);
          })
          .catch((err: Error) => {
            send(sender, IpcChannels.analysisReady, {
              path: result.path,
              error: err.message,
            } satisfies AnalysisReadyPayload);
          });
      }
    );

    return images;
  });

  ipcMain.handle(
    IpcChannels.writeRatings,
    async (_event, items: WriteRatingItem[]): Promise<WriteRatingResult[]> => {
      const results: WriteRatingResult[] = [];
      for (const item of items) {
        try {
          await writeRating({ path: item.path, type: item.type, stars: item.stars });
          results.push({ path: item.path, ok: true });
        } catch (err) {
          results.push({ path: item.path, ok: false, error: (err as Error).message });
        }
      }
      return results;
    }
  );
}
