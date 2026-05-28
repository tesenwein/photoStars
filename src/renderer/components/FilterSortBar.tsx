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
    <div className="flex flex-wrap items-center gap-4 border-b border-slate-700 bg-slate-900 px-6 py-2 text-xs text-slate-300">
      {/* Sort */}
      <div className="flex items-center gap-2">
        <span className="text-slate-500">Sort</span>
        <select
          value={sort.field}
          onChange={(e) => setSort(e.target.value as SortField, sort.dir)}
          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={() => setSort(sort.field, sort.dir === 'asc' ? 'desc' : 'asc')}
          className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
          title="Toggle direction"
        >
          {sort.dir === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      <div className="h-4 w-px bg-slate-700" />

      {/* Min stars filter */}
      <div className="flex items-center gap-2">
        <span className="text-slate-500">Min stars</span>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setFilter({ minStars: n })}
            className={`rounded px-2 py-0.5 ${
              filter.minStars === n ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            {n === 0 ? 'all' : `${n}★`}
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-slate-700" />

      {/* Unwritten only */}
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={filter.unwrittenOnly}
          onChange={(e) => setFilter({ unwrittenOnly: e.target.checked })}
          className="accent-amber-400"
        />
        <span>Unwritten only</span>
      </label>
    </div>
  );
}
