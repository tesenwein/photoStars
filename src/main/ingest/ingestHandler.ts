import { ipcMain, type WebContents } from 'electron';
import {
  IpcChannels,
  type AnalysisReadyPayload,
  type PreviewReadyPayload,
  type WriteRatingItem,
  type WriteRatingResult,
} from '../../shared/ipc';
import { scanFolder } from './scan';
import { generatePreviews, clearPreviewCache } from './preview';
import { readTimestamp } from './burstDetector';
import { analyzeImage } from '../analysis/analyze';
import { writeRating } from '../exiftool/writeRating';

function send(sender: WebContents, channel: string, payload: unknown): boolean {
  if (sender.isDestroyed()) return false;
  sender.send(channel, payload);
  return true;
}

export function registerIngestHandlers(): void {
  ipcMain.handle(IpcChannels.clearCache, async () => {
    await clearPreviewCache();
  });

  ipcMain.handle(IpcChannels.ingestFolder, async (event, folder: string) => {
    const images = await scanFolder(folder);
    const sender = event.sender;

    // Return images immediately — renderer paints the grid right away.
    // Timestamps + previews + analysis all stream back via events.
    void generatePreviews(
      images.map((i) => ({ path: i.path, type: i.type })),
      async (result: PreviewReadyPayload) => {
        // Timestamp is read per-image here (reuses the running exiftool process)
        // so it never blocks the initial folder return.
        const ts = await readTimestamp(result.path).catch(() => -1);
        const enriched: PreviewReadyPayload = {
          ...result,
          timestamp: ts >= 0 ? ts : undefined,
        };
        if (!send(sender, IpcChannels.previewReady, enriched)) return;
        if (!result.previewPath) return;

        void analyzeImage(result.previewPath)
          .then((scores) => {
            const payload: AnalysisReadyPayload = {
              path:            result.path,
              sharpnessScore:  scores.sharpnessScore,
              exposureScore:   scores.exposureScore,
              exposureHint:    scores.exposureHint,
              eyeStatus:       scores.eyeStatus,
              aestheticsScore: scores.aestheticsScore,
              isPortrait:      scores.isPortrait,
              qualityScore:    scores.qualityScore,
              derivedStars:    scores.derivedStars,
            };
            send(sender, IpcChannels.analysisReady, payload);
          })
          .catch((err: Error) => {
            send(sender, IpcChannels.analysisReady, {
              path:  result.path,
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
          await writeRating({
            path: item.path, type: item.type, stars: item.stars,
            backup: item.backup, lrLabel: item.lrLabel, lrPickLabel: item.lrPickLabel,
          });
          results.push({ path: item.path, ok: true });
        } catch (err) {
          results.push({ path: item.path, ok: false, error: (err as Error).message });
        }
      }
      return results;
    }
  );
}
