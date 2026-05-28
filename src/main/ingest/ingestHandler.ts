import { ipcMain, shell, type WebContents } from 'electron';
import {
  IpcChannels,
  type AnalysisReadyPayload,
  type PreviewReadyPayload,
  type WriteRatingItem,
  type WriteRatingResult,
} from '../../shared/ipc';
import { scanFolder } from './scan';
import { generatePreviews, clearPreviewCache, generateHiResPreview } from './preview';
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
    // Timestamps + previews + analysis all stream back via events.
    void generatePreviews(
      images.map((i) => ({ path: i.path, type: i.type })),
      async (result: PreviewReadyPayload) => {
        // Read timestamp + existing rating in one exiftool call (reuses the
        // running process) so it never blocks the initial folder return.
        const meta = await readImageMeta(result.path).catch(() => ({ ts: -1, rating: undefined, label: undefined }));
        const enriched: PreviewReadyPayload = {
          ...result,
          timestamp:      meta.ts >= 0 ? meta.ts : undefined,
          existingRating: meta.rating,
          existingLabel:  meta.label,
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
