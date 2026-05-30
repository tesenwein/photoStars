import { ipcMain, shell, type WebContents } from 'electron';
import {
  IpcChannels,
  type AnalysisReadyPayload,
  type PreviewReadyPayload,
  type WriteRatingItem,
  type WriteRatingResult,
} from '../../shared/ipc';
import { scanFolder } from './scan';
import { generatePreview, clearPreviewCache, generateHiResPreview } from './preview';
import { readImageMeta } from './burstDetector';
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

  ipcMain.handle(
    IpcChannels.getHiResPreview,
    async (_event, filePath: string, type: string): Promise<string | undefined> => {
      try {
        return await generateHiResPreview(filePath, type as import('../../shared/types').ImageFileType);
      } catch { return undefined; }
    }
  );

  ipcMain.handle(IpcChannels.ingestFolder, async (event, folder: string) => {
    const images = await scanFolder(folder);
    const sender = event.sender;

    // Return images immediately — renderer paints the grid right away.
    // Metadata + previews + analysis all stream back via events.
    const items = images.map((i) => ({ path: i.path, type: i.type }));
    let cursor = 0;
    const concurrency = 4;

    const worker = async (): Promise<void> => {
      while (cursor < items.length) {
        const item = items[cursor++];

        // One exiftool call per image: timestamp + rating/label + orientation.
        // Orientation feeds preview generation so RAWs no longer need a second read.
        const meta = await readImageMeta(item.path)
          .catch(() => ({ ts: -1, rating: undefined, label: undefined, orientationDeg: 0 }));

        let previewPath: string | undefined;
        let error: string | undefined;
        try {
          previewPath = await generatePreview(item.path, item.type, meta.orientationDeg);
        } catch (err) {
          error = (err as Error).message;
        }

        const enriched: PreviewReadyPayload = {
          path:           item.path,
          previewPath,
          error,
          timestamp:      meta.ts >= 0 ? meta.ts : undefined,
          existingRating: meta.rating,
          existingLabel:  meta.label,
        };
        if (!send(sender, IpcChannels.previewReady, enriched)) return;
        if (!previewPath) continue;

        void analyzeImage(previewPath)
          .then((scores) => {
            const payload: AnalysisReadyPayload = {
              path:               item.path,
              sharpnessScore:     scores.sharpnessScore,
              exposureScore:      scores.exposureScore,
              exposureHint:       scores.exposureHint,
              eyeStatus:          scores.eyeStatus,
              aestheticsScore:    scores.aestheticsScore,
              isPortrait:         scores.isPortrait,
              faceSharpnessScore: scores.faceSharpnessScore,
              bokehRatio:         scores.bokehRatio,
              qualityScore:       scores.qualityScore,
              derivedStars:       scores.derivedStars,
            };
            send(sender, IpcChannels.analysisReady, payload);
          })
          .catch((err: Error) => {
            send(sender, IpcChannels.analysisReady, {
              path:  item.path,
              error: err.message,
            } satisfies AnalysisReadyPayload);
          });
      }
    };

    void Promise.all(
      Array.from({ length: Math.min(concurrency, items.length || 1) }, worker)
    );

    return images;
  });

  ipcMain.handle(
    IpcChannels.trashFiles,
    async (_event, paths: string[]): Promise<string[]> => {
      const failed: string[] = [];
      for (const p of paths) {
        try { await shell.trashItem(p); }
        catch { failed.push(p); }
      }
      return failed;
    }
  );

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
