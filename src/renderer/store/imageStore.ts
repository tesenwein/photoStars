import { create } from 'zustand';
import type { PhotoImage } from '../../shared/types';

export type SortField = 'name' | 'stars' | 'sharpness' | 'exposure' | 'aesthetics';
export type SortDir = 'asc' | 'desc';

export interface FilterState {
  minStars: number;
  unwrittenOnly: boolean;
}

interface ImageStore {
  folder?: string;
  images: PhotoImage[];
  selected: Set<string>;
  sort: { field: SortField; dir: SortDir };
  filter: FilterState;

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
}

export const useImageStore = create<ImageStore>((set) => ({
  images: [],
  selected: new Set<string>(),
  sort: { field: 'name', dir: 'asc' },
  filter: { minStars: 0, unwrittenOnly: false },

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
}));
