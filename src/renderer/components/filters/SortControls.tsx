import React from 'react';
import { useImageStore, type SortField } from '../../store/imageStore';
import { FilterGroup } from './controls';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name',       label: 'Name' },
  { value: 'stars',      label: 'Stars' },
  { value: 'sharpness',  label: 'Sharpness' },
  { value: 'exposure',   label: 'Exposure' },
  { value: 'aesthetics', label: 'Aesthetics' },
];

export function SortControls(): React.JSX.Element {
  const sort    = useImageStore((s) => s.sort);
  const setSort = useImageStore((s) => s.setSort);

  return (
    <FilterGroup label="Sort">
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
    </FilterGroup>
  );
}
