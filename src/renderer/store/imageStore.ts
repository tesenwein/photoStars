import { create } from 'zustand';
import type { PhotoImage } from '../../shared/types';

export type SortField = 'name' | 'stars' | 'sharpness' | 'exposure' | 'aesthetics';
export type SortDir = 'asc' | 'desc';

/** Face/eye recognition filter. Each predicate is checked against eyeStatus. */
export interface EyeFilterState {
  /** Only images with at least one detected face. */
  facesOnly: boolean;
  /** Only images where all detected eyes are open (requires a face). */
  eyesOpenOnly: boolean;
  /** Only images where at least one eye is closed (requires a face). */
  eyesClosedOnly: boolean;
  /** Exclude images flagged with a bad expression (closed eyes/mouth/tilt). */
  hideFlagged: boolean;
  /** Only images with a pronounced smile. */
  smilingOnly: boolean;
  /** Only images with no/weak smile (requires a face). */
  notSmilingOnly: boolean;
  /** Only images with the mouth open. */
  mouthOpenOnly: boolean;
  /** Only images with multiple detected faces. */
  multipleFacesOnly: boolean;
}

export type CullFilter = 'all' | 'keep' | 'neutral' | 'reject';
export type ExposureFilter = 'all' | 'ok' | 'overexposed' | 'underexposed';

export interface FilterState {
  minStars: number;
  unwrittenOnly: boolean;
  /** Only images the user has touched (manual stars or a cull flag). */
  modifiedOnly: boolean;
  /** Only RAW files. */
  rawOnly: boolean;
  /** Burst window in seconds — shots within this window are grouped. */
  burstWindowSec: number;
  eyes: EyeFilterState;
  /** Filter by tri-state cull flag. */
  cull: CullFilter;
  /** Filter by exposure hint. */
  exposure: ExposureFilter;
  /** Only images detected as portraits. */
  portraitOnly: boolean;
}

interface ImageStore {
  folder?: string;
  images: PhotoImage[];
  selected: Set<string>;
  sort: { field: SortField; dir: SortDir };
  filter: FilterState;
  /** When true, derived stars come from the whole-shoot relative curve. */
  relativeRating: boolean;
  /** When true, the grid clusters burst members into outlined group boxes. */
  groupBursts: boolean;

  setFolder: (folder: string) => void;
  setImages: (images: PhotoImage[]) => void;
  upsertImage: (image: PhotoImage) => void;
  updateImage: (path: string, patch: Partial<PhotoImage>) => void;
  toggleSelected: (path: string) => void;
  clearSelection: () => void;
  /** Set a manual star override (null clears it back to the derived value). */
  setManualStars: (path: string, stars: number | null) => void;
  toggleMarkForDelete: (path: string) => void;
  setCullStatus: (path: string, status: 'keep' | 'neutral' | 'reject') => void;
  removeImages: (paths: string[]) => void;
  setSort: (field: SortField, dir: SortDir) => void;
  setFilter: (patch: Partial<FilterState>) => void;
  setEyeFilter: (patch: Partial<EyeFilterState>) => void;
  setRelativeRating: (on: boolean) => void;
  setGroupBursts: (on: boolean) => void;
}

export const useImageStore = create<ImageStore>((set) => ({
  images: [],
  selected: new Set<string>(),
  sort: { field: 'name', dir: 'asc' },
  filter: {
    minStars: 0,
    unwrittenOnly: false,
    modifiedOnly: false,
    rawOnly: false,
    burstWindowSec: 3,
    eyes: {
      facesOnly: false, eyesOpenOnly: false, eyesClosedOnly: false, hideFlagged: false,
      smilingOnly: false, notSmilingOnly: false, mouthOpenOnly: false, multipleFacesOnly: false,
    },
    cull: 'all',
    exposure: 'all',
    portraitOnly: false,
  },
  relativeRating: true,
  groupBursts: true,

  setFolder: (folder) => set({ folder }),
  setImages: (images) => set({ images }),
  upsertImage: (image) =>
    set((state) => {
      const idx = state.images.findIndex((i) => i.path === image.path);
      if (idx === -1) return { images: [...state.images, image] };
      const next = state.images.slice();
      next[idx] = image;
      return { images: next };
    }),
  updateImage: (path, patch) =>
    set((state) => ({
      images: state.images.map((i) => (i.path === path ? { ...i, ...patch } : i)),
    })),
  toggleSelected: (path) =>
    set((state) => {
      const next = new Set(state.selected);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { selected: next };
    }),
  clearSelection: () => set({ selected: new Set<string>() }),
  setManualStars: (path, stars) =>
    set((state) => {
      const img = state.images.find((i) => i.path === path);
      // Persist the choice as a training sample. Only real ratings (not a clear
      // back to derived) carry a supervised signal worth learning from.
      if (img && stars !== null) {
        window.api.recordCorrection({
          ts: Date.now(),
          path,
          suggestedStars: img.manualStars ?? img.derivedStars,
          userStars: stars,
          qualityScore: img.qualityScore,
          sharpnessScore: img.sharpnessScore,
          exposureScore: img.exposureScore,
          aestheticsScore: img.aestheticsScore,
          faceSharpnessScore: img.faceSharpnessScore,
          bokehRatio: img.bokehRatio,
          isPortrait: img.isPortrait,
          burstRank: img.burstRank,
          burstGroup: img.burstGroup,
          facesDetected: img.eyeStatus?.facesDetected,
          allEyesOpen: img.eyeStatus?.allEyesOpen,
          badExpression: img.eyeStatus?.badExpression,
        });
      }
      return {
        images: state.images.map((i) =>
          i.path === path ? { ...i, manualStars: stars ?? undefined, written: false } : i
        ),
      };
    }),
  toggleMarkForDelete: (path) =>
    set((state) => ({
      images: state.images.map((i) =>
        i.path === path
          ? { ...i, markedForDelete: !i.markedForDelete, cullStatus: !i.markedForDelete ? 'reject' : 'neutral' }
          : i
      ),
    })),
  setCullStatus: (path, status) =>
    set((state) => ({
      images: state.images.map((i) =>
        i.path === path ? { ...i, cullStatus: status, markedForDelete: status === 'reject' } : i
      ),
    })),
  removeImages: (paths) =>
    set((state) => ({ images: state.images.filter((i) => !paths.includes(i.path)) })),
  setSort: (field, dir) => set({ sort: { field, dir } }),
  setFilter: (patch) => set((state) => ({ filter: { ...state.filter, ...patch } })),
  setEyeFilter: (patch) =>
    set((state) => ({ filter: { ...state.filter, eyes: { ...state.filter.eyes, ...patch } } })),
  setRelativeRating: (on) => set({ relativeRating: on }),
  setGroupBursts: (on) => set({ groupBursts: on }),
}));

const SMILE_FILTER_THRESHOLD = 0.5;

/** True when an image passes all enabled eye/face filters. */
export function passesEyeFilter(eyes: EyeFilterState, img: PhotoImage): boolean {
  const e = img.eyeStatus;
  const faces = e?.facesDetected ?? 0;
  if (eyes.facesOnly && faces === 0) return false;
  if (eyes.eyesOpenOnly && (faces === 0 || !e?.allEyesOpen)) return false;
  if (eyes.eyesClosedOnly && (faces === 0 || e?.allEyesOpen)) return false;
  if (eyes.hideFlagged && e?.badExpression) return false;
  if (eyes.smilingOnly && (e?.smileScore ?? 0) < SMILE_FILTER_THRESHOLD) return false;
  if (eyes.notSmilingOnly && (faces === 0 || (e?.smileScore ?? 0) >= SMILE_FILTER_THRESHOLD)) return false;
  if (eyes.mouthOpenOnly && !e?.mouthOpen) return false;
  if (eyes.multipleFacesOnly && faces < 2) return false;
  return true;
}

/** Effective cull state for an image (falls back to legacy markedForDelete). */
export function cullOf(img: PhotoImage): 'keep' | 'neutral' | 'reject' {
  return img.cullStatus ?? (img.markedForDelete ? 'reject' : 'neutral');
}

/** True when the user has actively touched this image: set a manual star rating
 * or flagged it keep/reject (anything beyond the untouched default). */
export function isModified(img: PhotoImage): boolean {
  return img.manualStars !== undefined || cullOf(img) !== 'neutral';
}

/** True when an image passes the non-star/non-burst filters (cull, exposure, portrait, faces). */
export function passesImageFilters(filter: FilterState, img: PhotoImage): boolean {
  if (filter.unwrittenOnly && img.written) return false;
  if (filter.modifiedOnly && !isModified(img)) return false;
  if (filter.rawOnly && img.type !== 'raw') return false;
  if (filter.cull !== 'all' && cullOf(img) !== filter.cull) return false;
  if (filter.exposure !== 'all' && img.exposureHint !== filter.exposure) return false;
  if (filter.portraitOnly && !img.isPortrait) return false;
  if (!passesEyeFilter(filter.eyes, img)) return false;
  return true;
}
