import React from 'react';
import { useImageStore, type SortField } from '../store/imageStore';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name',       label: 'Name' },
  { value: 'stars',      label: 'Stars' },
  { value: 'sharpness',  label: 'Sharpness' },
  { value: 'exposure',   label: 'Exposure' },
  { value: 'aesthetics', label: 'Aesthetics' },
];

export function FilterSortBar(): React.JSX.Element {
  const sort      = useImageStore((s) => s.sort);
  const filter    = useImageStore((s) => s.filter);
  const setSort   = useImageStore((s) => s.setSort);
  const setFilter = useImageStore((s) => s.setFilter);

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
    </div>
  );
}
