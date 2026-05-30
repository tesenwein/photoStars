import type { ExposureHint, ImageFileType, PhotoImage } from './types';

/** IPC channel names shared between main and preload. */
export const IpcChannels = {
  ping: 'ping',
  selectFolder: 'select-folder',
  ingestFolder: 'ingest-folder',
  previewReady: 'preview-ready',
  analysisReady: 'analysis-ready',
  writeRatings: 'write-ratings',
  clearCache: 'clear-cache',
  getHiResPreview: 'get-hires-preview',
  trashFiles: 'trash-files',
  recordCorrection: 'record-correction',
  readCorrections: 'read-corrections',
} as const;

/** Payload pushed to the renderer as each preview finishes generating. */
export interface PreviewReadyPayload {
  path: string;
  previewPath?: string;
  timestamp?: number;
  burstGroup?: string;
  burstRank?: number;
  /** Existing star rating read from XMP/EXIF (1–5), undefined = unrated. */
  existingRating?: number;
  /** Existing XMP colour label (Green / Blue / Yellow / Red / …). */
  existingLabel?: string;
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
  isPortrait?: boolean;
  faceSharpnessScore?: number;
  bokehRatio?: number;
  qualityScore?: number;
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

/**
 * One persisted training sample: the analysis features of an image at the
 * moment the user manually set a star rating, plus what the app had suggested
 * versus what the user chose. The residual (userStars − suggestedStars) is the
 * supervised signal a later calibration step learns from. Appended one-per-line
 * to a JSONL file in userData so the dataset survives sessions and cache clears.
 */
export interface CorrectionRecord {
  /** Epoch ms when the correction was made. */
  ts: number;
  path: string;
  /** Stars the app suggested (derived/relative) before the user acted. */
  suggestedStars?: number;
  /** Stars the user explicitly chose. */
  userStars: number;
  /** 0–1 quality score the suggestion came from, if known. */
  qualityScore?: number;
  // ---- raw feature vector (mirrors the inputs to recomputeStars) ----
  sharpnessScore?: number;
  exposureScore?: number;
  aestheticsScore?: number;
  faceSharpnessScore?: number;
  bokehRatio?: number;
  isPortrait?: boolean;
  burstRank?: number;
  /** Burst group id, so burst picks can be mined as pairwise preferences. */
  burstGroup?: string;
  /** Flattened eye/expression flags relevant to the hard-cap penalties. */
  facesDetected?: number;
  allEyesOpen?: boolean;
  badExpression?: boolean;
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
  /** Delete preview + analysis cache so the next ingest re-generates everything. */
  clearCache: () => Promise<void>;
  /** Generate (or return cached) a 2048px hi-res preview for the split-view main image. */
  getHiResPreview: (path: string, type: ImageFileType) => Promise<string | undefined>;
  /** Move the given files to the system Recycle Bin. Returns paths that failed. */
  trashFiles: (paths: string[]) => Promise<string[]>;
  /** Persist one manual-rating correction as a training sample (fire-and-forget). */
  recordCorrection: (record: CorrectionRecord) => Promise<void>;
  /** Read back the full persisted correction dataset. */
  readCorrections: () => Promise<CorrectionRecord[]>;
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
