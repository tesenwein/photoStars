import React from 'react';
import type { PhotoImage } from '../../shared/types';
import { mediaUrl } from '../../shared/ipc';
import { useImageStore } from '../store/imageStore';
import { StarRating } from './StarRating';

const hintColor: Record<string, string> = {
  overexposed: 'bg-rose-500/15 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300',
  underexposed: 'bg-indigo-500/15 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300',
  ok: 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300',
};

function ImageTileImpl({
  image,
  suggested,
  selected,
  onOpen,
}: {
  image: PhotoImage;
  /** Suggested (derived/relative) stars; manual override wins when present. */
  suggested?: number;
  selected: boolean;
  onOpen: (path: string) => void;
}): React.JSX.Element {
  const toggleSelected     = useImageStore((s) => s.toggleSelected);
  const setManualStars     = useImageStore((s) => s.setManualStars);
  const setCullStatus      = useImageStore((s) => s.setCullStatus);

  const stars = image.manualStars ?? suggested;
  const isDerived = image.manualStars === undefined;
  const calculated = image.sharpnessScore !== undefined;

  if (!calculated) {
    return (
      <div
        className="group relative overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:shadow-none"
        aria-disabled="true"
      >
        <div className="flex aspect-square items-center justify-center bg-stone-100 dark:bg-zinc-900">
          {image.previewPath ? (
            <img
              src={mediaUrl(image.previewPath)}
              alt={image.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-amber-500 dark:border-zinc-700 dark:border-t-amber-400" />
          )}
          {/* Subtle analyzing badge */}
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400 shadow" title="Analyzing…" />
        </div>
        <div className="px-2 py-1.5 text-xs">
          <span className="truncate text-stone-500 dark:text-zinc-400" title={image.name}>
            {image.name}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-zinc-800 dark:shadow-none ${
        image.markedForDelete
          ? 'border-rose-500 ring-2 ring-rose-500/40'
          : selected
          ? 'border-emerald-500 ring-2 ring-emerald-500/40'
          : 'border-stone-200 dark:border-zinc-700'
      }`}
      onClick={() => onOpen(image.path)}
    >
      <input
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={() => toggleSelected(image.path)}
        className="absolute left-2 top-2 z-10 h-4 w-4 accent-amber-500"
        aria-label={`Select ${image.name}`}
      />
      {/* Delete mark overlay */}
      {image.markedForDelete && (
        <div className="absolute inset-0 z-10 bg-rose-600/30 pointer-events-none" />
      )}
      {(() => {
        const cur = image.cullStatus ?? (image.markedForDelete ? 'reject' : 'neutral');
        const groupVisible = cur !== 'neutral';
        return (
          <div
            className={`absolute right-2 top-2 z-20 flex overflow-hidden rounded bg-black/40 text-sm leading-none transition-opacity ${
              groupVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-90'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {([
              { key: 'keep',    label: '✓', active: 'bg-emerald-600 text-white', hover: 'hover:bg-emerald-700/70 text-zinc-200' },
              { key: 'neutral', label: '○', active: 'bg-stone-500 text-white',   hover: 'hover:bg-stone-600/70 text-zinc-200' },
              { key: 'reject',  label: '🗑', active: 'bg-rose-600 text-white',    hover: 'hover:bg-rose-700/70 text-zinc-200' },
            ] as const).map((b) => (
              <button
                key={b.key}
                onClick={(e) => { e.stopPropagation(); setCullStatus(image.path, b.key); }}
                title={b.key}
                className={`px-1.5 py-1 transition-colors ${cur === b.key ? b.active : b.hover}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        );
      })()}

      {image.written && (
        <span className="absolute right-2 top-2 z-10 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
          written
        </span>
      )}
      {image.eyeStatus && image.eyeStatus.facesDetected > 0 && image.eyeStatus.badExpression && (
        <span className="absolute left-2 bottom-14 z-10 rounded bg-rose-700/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {!image.eyeStatus.allEyesOpen ? 'eyes closed' : 'mouth open'}
        </span>
      )}
      {image.burstGroup && (
        <span className={`absolute right-2 bottom-14 z-10 rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${
          image.burstRank === 1 ? 'bg-sky-600/90' : 'bg-slate-600/80'
        }`}>
          {image.burstRank === 1 ? 'burst★' : `burst ${image.burstRank ?? ''}`}
        </span>
      )}

      <div className="flex aspect-square items-center justify-center bg-stone-100 dark:bg-zinc-900">
        {image.previewPath ? (
          <img src={mediaUrl(image.previewPath)} alt={image.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-amber-500 dark:border-zinc-700 dark:border-t-amber-400" />
        )}
      </div>

      <div className="space-y-1 px-2 py-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="truncate text-stone-700 dark:text-zinc-300" title={image.name}>
            {image.name}
          </span>
          <span className="ml-2 shrink-0 rounded bg-stone-100 px-1.5 py-0.5 uppercase text-stone-500 dark:bg-zinc-700 dark:text-zinc-400">
            {image.type}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-zinc-400">
          {image.sharpnessScore !== undefined ? (
            <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-zinc-700">sharp {Math.round(image.sharpnessScore)}</span>
          ) : (
            <span className="rounded bg-stone-100/60 px-1.5 py-0.5 dark:bg-zinc-700/50">…</span>
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

export const ImageTile = React.memo(ImageTileImpl);
