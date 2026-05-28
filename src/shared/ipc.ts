import type { ExposureHint, ImageFileType, PhotoImage } from './types';

/** IPC channel names shared between main and preload. */
export const IpcChannels = {
  ping: 'ping',
  selectFolder: 'select-folder',
  ingestFolder: 'ingest-folder',
  previewReady: 'preview-ready',
  analysisReady: 'analysis-ready',
  writeRatings: 'write-ratings',
} as const;

/** Payload pushed to the renderer as each preview finishes generating. */
export interface PreviewReadyPayload {
  path: string;
  previewPath?: string;
  burstGroup?: string;
  burstRank?: number;
  error?: string;
}

/** Payload pushed once the full analysis for an image completes. */
export interface AnalysisReadyPayload {
  path: string;
  sharpnessScore?: number;
  exposureScore?: number;
  exposureHint?: ExposureHint;
  eyeStatus?: import('./types').EyeStatus;
  aestheticsScore?: number;
  derivedStars?: number;
  error?: string;
}

export interface WriteRatingItem {
  path: string;
  type: ImageFileType;
  stars: number;
  /** Copy original/sidecar to <name>.bak before overwriting. */
  backup?: boolean;
  /** Lightroom color label to write to xmp:Label. */
  lrLabel?: string;
  /** Lightroom pick flag: 1 picked, 0 unflagged, -1 rejected. */
  lrPickLabel?: number;
}

export interface WriteRatingResult {
  path: string;
  ok: boolean;
  error?: string;
}

/** Shape of the API exposed on `window.api` via the preload contextBridge. */
export interface PhotoStarsApi {
  ping: () => Promise<string>;
  selectFolder: () => Promise<string | undefined>;
  /** Scan a folder and return the image list; previews/analysis stream via events. */
  ingestFolder: (folder: string) => Promise<PhotoImage[]>;
  onPreviewReady: (cb: (payload: PreviewReadyPayload) => void) => () => void;
  onAnalysisReady: (cb: (payload: AnalysisReadyPayload) => void) => () => void;
  /** Write star ratings to disk. Only ever called on explicit user Apply. */
  writeRatings: (items: WriteRatingItem[]) => Promise<WriteRatingResult[]>;
}

declare global {
  interface Window {
    api: PhotoStarsApi;
  }
}

/** Build a media:// URL the renderer can load for a local preview file. */
export function mediaUrl(filePath: string): string {
  return `media://get/${encodeURIComponent(filePath)}`;
}

export type { PhotoImage };
