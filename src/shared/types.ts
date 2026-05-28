export type ImageFileType = 'raw' | 'jpeg' | 'heic';

export type ExposureHint = 'ok' | 'overexposed' | 'underexposed';

export interface EyeStatus {
  facesDetected: number;
  allEyesOpen: boolean;
}

export interface PhotoImage {
  /** Absolute path to the original file. */
  path: string;
  /** File name for display. */
  name: string;
  type: ImageFileType;
  /** Absolute path (or data URL) of the generated preview, if ready. */
  previewPath?: string;

  /** Laplacian-variance sharpness score; higher is sharper. */
  sharpnessScore?: number;
  /** Exposure score plus a hint about clipping. */
  exposureScore?: number;
  exposureHint?: ExposureHint;
  /** Eye/face analysis from the Python sidecar. */
  eyeStatus?: EyeStatus;
  /** NIMA-like aesthetic score, 1-10. */
  aestheticsScore?: number;

  /** Stars derived by the scoring pipeline (0-5). */
  derivedStars?: number;
  /** Manual override set by the user (0-5). */
  manualStars?: number;
  /** Whether the rating has been written to disk. */
  written: boolean;
}

/** The effective rating shown/applied: manual override wins over derived. */
export function effectiveStars(img: PhotoImage): number | undefined {
  return img.manualStars ?? img.derivedStars;
}
