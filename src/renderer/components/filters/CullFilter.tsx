import React from 'react';
import { useImageStore, type CullFilter as CullFilterValue } from '../../store/imageStore';
import { FilterGroup, SegmentedControl } from './controls';

const OPTIONS: { value: CullFilterValue; label: string; title: string }[] = [
  { value: 'all',     label: 'all', title: 'All cull states' },
  { value: 'keep',    label: '✓',   title: 'Kept only' },
  { value: 'neutral', label: '○',   title: 'Undecided only' },
  { value: 'reject',  label: '🗑',  title: 'Rejected only' },
];

export function CullFilter(): React.JSX.Element {
  const cull      = useImageStore((s) => s.filter.cull);
  const setFilter = useImageStore((s) => s.setFilter);

  return (
    <FilterGroup label="Cull">
      <SegmentedControl value={cull} options={OPTIONS} onChange={(v) => setFilter({ cull: v })} />
    </FilterGroup>
  );
}
