import React from 'react';
import type { PhotoImage } from '../../shared/types';
import { effectiveStars } from '../../shared/types';
import { mediaUrl } from '../../shared/ipc';
import { useImageStore } from '../store/imageStore';
import { StarRating } from './StarRating';

const hintColor: Record<string, string> = {
  overexposed: 'bg-rose-500/20 text-rose-300',
  underexposed: 'bg-indigo-500/20 text-indigo-300',
  ok: 'bg-emerald-500/20 text-emerald-300',
};

export function ImageTile({
  image,
  selected,
  onOpen,
}: {
  image: PhotoImage;
  selected: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const toggleSelected = useImageStore((s) => s.toggleSelected);
  const setManualStars = useImageStore((s) => s.setManualStars);

  const stars = effectiveStars(image);
  const isDerived = image.manualStars === undefined;

  return (
    <div
      className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-slate-800 ${
        selected ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-slate-700'
      }`}
      onClick={onOpen}
    >
      <input
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={() => toggleSelected(image.path)}
        className="absolute left-2 top-2 z-10 h-4 w-4 accent-amber-400"
        aria-label={`Select ${image.name}`}
      />
      {image.written && (
        <span className="absolute right-2 top-2 z-10 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
          written
        </span>
      )}
      {image.eyeStatus && image.eyeStatus.facesDetected > 0 && !image.eyeStatus.allEyesOpen && (
        <span className="absolute left-2 bottom-14 z-10 rounded bg-rose-700/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
          eyes closed
        </span>
      )}

      <div className="flex aspect-square items-center justify-center">
        {image.previewPath ? (
          <img src={mediaUrl(image.previewPath)} alt={image.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="animate-pulse text-xs text-slate-500">Loading…</span>
        )}
      </div>

      <div className="space-y-1 px-2 py-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="truncate text-slate-300" title={image.name}>
            {image.name}
          </span>
          <span className="ml-2 shrink-0 rounded bg-slate-700 px-1.5 py-0.5 uppercase text-slate-400">
            {image.type}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-slate-400">
          {image.sharpnessScore !== undefined ? (
            <span className="rounded bg-slate-700 px-1.5 py-0.5">sharp {Math.round(image.sharpnessScore)}</span>
          ) : (
            <span className="rounded bg-slate-700/50 px-1.5 py-0.5">…</span>
          )}
          {image.exposureHint && (
            <span className={`rounded px-1.5 py-0.5 ${hintColor[image.exposureHint] ?? ''}`}>
              {image.exposureScore !== undefined ? `exp ${Math.round(image.exposureScore)}` : 'exp'}
            </span>
          )}
        </div>

        <StarRating value={stars} derived={isDerived} onChange={(n) => setManualStars(image.path, n === 0 ? null : n)} />
      </div>
    </div>
  );
}
