export type ImageFileType = 'raw' | 'jpeg' | 'heic';

export type ExposureHint = 'ok' | 'overexposed' | 'underexposed';

export interface FaceBbox {
  /** Normalised 0–1 relative to the preview image dimensions. */
  x: number; y: number; w: number; h: number;
}

export interface EyeBbox {
  /** Normalised bounding box around both eyes, 0–1 relative to preview. */
  x: number; y: number; w: number; h: number;
}

export interface EyeStatus {
  facesDetected: number;
  allEyesOpen: boolean;
  /** 0–1; higher = more pronounced smile. undefined when no faces detected. */
  smileScore?: number;
  /** True when mouth is significantly open (yawning, talking, surprised). */
  mouthOpen?: boolean;
  /** Head tilt in degrees from vertical; >25° flagged as a misshot. */
  headTiltDeg?: number;
  /** Aggregate bad-expression flag: closed eyes OR mouth open OR extreme tilt. */
  badExpression?: boolean;
  /** Bounding box of the primary (largest) face in the preview. */
  faceBbox?: FaceBbox;
  /** Tight bounding box around both eyes (both eye outer corners + brows). */
  eyeBbox?: EyeBbox;
}

/** Lightroom color label value written to xmp:Label. */
export type LrLabel = 'Red' | 'Yellow' | 'Green' | 'Blue' | 'Purple' | '';
/** Lightroom pick flag: 1 = picked, 0 = unflagged, -1 = rejected. */
export type LrPickLabel = 1 | 0 | -1;

/** Compute LR color label from effective stars + eye/expression status. */
export function lrLabel(stars: number, badExpression: boolean): LrLabel {
  if (badExpression) return 'Red';
  if (stars >= 4) return 'Green';
  if (stars === 3) return 'Blue';
  if (stars === 2) return 'Yellow';
  return '';
}

/** Compute LR pick flag from effective stars. */
export function lrPickLabel(stars: number): LrPickLabel {
  if (stars >= 4) return 1;
  if (stars <= 1) return -1;
  return 0;
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
  /** True when faces or skin tones detected — portrait weights applied. */
  isPortrait?: boolean;
  /** Laplacian variance inside the detected face region (portrait only). */
  faceSharpnessScore?: number;
  /** faceSharpness / wholeImageSharpness — >1 means subject sharper than background. */
  bokehRatio?: number;

  /** Continuous 0–1 quality score (pre-rounding) used to rank images relative
   * to the rest of the shoot. Penalties are applied on top during ranking. */
  qualityScore?: number;
  /** Stars derived by the scoring pipeline (0-5). Absolute per-image fallback
   * used when relative (whole-shoot curve) rating is off or unavailable. */
  derivedStars?: number;
  /** Manual override set by the user (0-5). */
  manualStars?: number;
  /** Whether the rating has been written to disk. */
  written: boolean;
  /** Marked by the user for deletion; removed from disk on "Delete marked". */
  markedForDelete?: boolean;

  /** Capture time (Unix ms) read from EXIF; used to re-bucket bursts live. */
  timestamp?: number;
  /** Burst group ID; set when ≥2 shots fall within the burst window. */
  burstGroup?: string;
  /** 1 = best in burst, 2 = second-best, etc. */
  burstRank?: number;
}

/** The effective rating shown/applied: manual override wins over derived. */
export function effectiveStars(img: PhotoImage): number | undefined {
  return img.manualStars ?? img.derivedStars;
}
