import React from 'react';
import { useImageStore, type SortField, type EyeFilterState } from '../store/imageStore';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name',       label: 'Name' },
  { value: 'stars',      label: 'Stars' },
  { value: 'sharpness',  label: 'Sharpness' },
  { value: 'exposure',   label: 'Exposure' },
  { value: 'aesthetics', label: 'Aesthetics' },
];

const EYE_FILTERS: { key: keyof EyeFilterState; label: string; title: string }[] = [
  { key: 'facesOnly',    label: 'Faces',     title: 'Only images with a detected face' },
  { key: 'eyesOpenOnly', label: 'Eyes open', title: 'Only images where all detected eyes are open' },
  { key: 'hideFlagged',  label: 'No flags',  title: 'Hide images flagged for closed eyes / open mouth / extreme tilt' },
  { key: 'smilingOnly',  label: 'Smiling',   title: 'Only images with a pronounced smile' },
];

function Chip({ active, onClick, title, children }: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded px-2 py-0.5 ${
        active
          ? 'bg-amber-500 text-stone-900'
          : 'bg-white shadow-sm hover:bg-stone-50 dark:bg-zinc-800 dark:hover:bg-zinc-700'
      }`}
    >
      {children}
    </button>
  );
}

export function FilterSortBar(): React.JSX.Element {
  const sort              = useImageStore((s) => s.sort);
  const filter            = useImageStore((s) => s.filter);
  const relativeRating    = useImageStore((s) => s.relativeRating);
  const groupBursts       = useImageStore((s) => s.groupBursts);
  const setSort           = useImageStore((s) => s.setSort);
  const setFilter         = useImageStore((s) => s.setFilter);
  const setEyeFilter      = useImageStore((s) => s.setEyeFilter);
  const setRelativeRating = useImageStore((s) => s.setRelativeRating);
  const setGroupBursts    = useImageStore((s) => s.setGroupBursts);

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-stone-200 bg-stone-100/60 px-6 py-2 text-xs text-stone-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
      {/* Sort */}
      <div className="flex items-center gap-2">
        <span className="text-stone-400 dark:text-zinc-500">Sort</span>
        <select
          value={sort.field}
          onChange={(e) => setSort(e.target.value as SortField, sort.dir)}
          className="rounded bg-white px-2 py-1 text-xs text-stone-700 shadow-sm focus:outline-none dark:bg-zinc-800 dark:text-zinc-200"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={() => setSort(sort.field, sort.dir === 'asc' ? 'desc' : 'asc')}
          className="rounded bg-white px-2 py-1 shadow-sm hover:bg-stone-50 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          title="Toggle direction"
        >
          {sort.dir === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      <div className="h-4 w-px bg-stone-300 dark:bg-zinc-700" />

      {/* Min stars filter */}
      <div className="flex items-center gap-2">
        <span className="text-stone-400 dark:text-zinc-500">Min stars</span>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setFilter({ minStars: n })}
            className={`rounded px-2 py-0.5 ${
              filter.minStars === n
                ? 'bg-amber-500 text-stone-900'
                : 'bg-white shadow-sm hover:bg-stone-50 dark:bg-zinc-800 dark:hover:bg-zinc-700'
            }`}
          >
            {n === 0 ? 'all' : `${n}★`}
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-stone-300 dark:bg-zinc-700" />

      {/* Burst window */}
      <div className="flex items-center gap-2">
        <span className="text-stone-400 dark:text-zinc-500">Burst</span>
        <input
          type="range" min={1} max={10} step={1}
          value={filter.burstWindowSec}
          onChange={(e) => setFilter({ burstWindowSec: Number(e.target.value) })}
          className="w-20 accent-amber-500"
          title="Burst grouping window in seconds"
        />
        <span className="w-8 text-stone-600 dark:text-zinc-300">{filter.burstWindowSec}s</span>
      </div>

      {/* Burst best only */}
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={filter.burstBestOnly}
          onChange={(e) => setFilter({ burstBestOnly: e.target.checked })}
          className="accent-amber-500"
        />
        <span>Best only</span>
      </label>

      {/* Group bursts */}
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={groupBursts}
          onChange={(e) => setGroupBursts(e.target.checked)}
          className="accent-amber-500"
        />
        <span>Group bursts</span>
      </label>

      <div className="h-4 w-px bg-stone-300 dark:bg-zinc-700" />

      {/* Eye / face filters */}
      <div className="flex items-center gap-2">
        <span className="text-stone-400 dark:text-zinc-500">Faces</span>
        {EYE_FILTERS.map((f) => (
          <Chip
            key={f.key}
            active={filter.eyes[f.key]}
            onClick={() => setEyeFilter({ [f.key]: !filter.eyes[f.key] })}
            title={f.title}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="h-4 w-px bg-stone-300 dark:bg-zinc-700" />

      {/* Unwritten only */}
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={filter.unwrittenOnly}
          onChange={(e) => setFilter({ unwrittenOnly: e.target.checked })}
          className="accent-amber-500"
        />
        <span>Unwritten only</span>
      </label>

      {/* Relative rating */}
      <label
        className="flex cursor-pointer items-center gap-1.5"
        title="Rate relative to the whole shoot (top shots get more stars as the set grows). Off = absolute per-image score."
      >
        <input
          type="checkbox"
          checked={relativeRating}
          onChange={(e) => setRelativeRating(e.target.checked)}
          className="accent-amber-500"
        />
        <span>Relative rating</span>
      </label>
    </div>
  );
}
