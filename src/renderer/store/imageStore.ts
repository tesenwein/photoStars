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
  /** Exclude images flagged with a bad expression (closed eyes/mouth/tilt). */
  hideFlagged: boolean;
  /** Only images with a pronounced smile. */
  smilingOnly: boolean;
}

export interface FilterState {
  minStars: number;
  unwrittenOnly: boolean;
  burstBestOnly: boolean;
  /** Burst window in seconds — shots within this window are grouped. */
  burstWindowSec: number;
  eyes: EyeFilterState;
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
    burstBestOnly: false,
    burstWindowSec: 3,
    eyes: { facesOnly: false, eyesOpenOnly: false, hideFlagged: false, smilingOnly: false },
  },
  relativeRating: true,
  groupBursts: false,

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
    set((state) => ({
      images: state.images.map((i) =>
        i.path === path ? { ...i, manualStars: stars ?? undefined, written: false } : i
      ),
    })),
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
  if (eyes.hideFlagged && e?.badExpression) return false;
  if (eyes.smilingOnly && (e?.smileScore ?? 0) < SMILE_FILTER_THRESHOLD) return false;
  return true;
}
