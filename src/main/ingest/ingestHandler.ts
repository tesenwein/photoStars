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
import { detectBursts } from './burstDetector';
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

  ipcMain.handle(IpcChannels.ingestFolder, async (event, folder: string, opts?: { burstWindowSec?: number }) => {
    const burstWindowMs = (opts?.burstWindowSec ?? 3) * 1000;
    const images = await scanFolder(folder);
    const sender = event.sender;

    // Burst detection runs concurrently with preview generation.
    const burstPromise = detectBursts(images, burstWindowMs).then((bursts) => {
      for (const [path, info] of bursts) {
        const img = images.find((i) => i.path === path);
        if (img) {
          img.burstGroup = info.burstGroup;
          img.burstRank  = info.burstRank;
        }
      }
    }).catch(() => { /* non-fatal */ });

    // Fire-and-forget preview + analysis pipeline.
    void generatePreviews(
      images.map((i) => ({ path: i.path, type: i.type })),
      (result: PreviewReadyPayload) => {
        // Find the image so we can attach burst info and pass burstRank to scorer.
        const img = images.find((i) => i.path === result.path);
        const enriched: PreviewReadyPayload = {
          ...result,
          burstGroup: img?.burstGroup,
          burstRank:  img?.burstRank,
        };
        if (!send(sender, IpcChannels.previewReady, enriched)) return;
        if (!result.previewPath) return;

        void analyzeImage(result.previewPath, img?.burstRank)
          .then((scores) => {
            const payload: AnalysisReadyPayload = {
              path: result.path,
              sharpnessScore:  scores.sharpnessScore,
              exposureScore:   scores.exposureScore,
              exposureHint:    scores.exposureHint,
              eyeStatus:       scores.eyeStatus,
              aestheticsScore: scores.aestheticsScore,
              derivedStars:    scores.derivedStars,
            };
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

    // Return immediately — burst info will be on the image objects already
    // if detection finished before previews; otherwise the scorer re-reads
    // burstRank from the image object which is updated when burstPromise settles.
    void burstPromise;
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
