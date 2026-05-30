import React from 'react';
import { useImageStore, type ExposureFilter as ExposureFilterValue } from '../../store/imageStore';
import { FilterGroup, SegmentedControl } from './controls';

const OPTIONS: { value: ExposureFilterValue; label: string; title: string }[] = [
  { value: 'all',          label: 'all',  title: 'Any exposure' },
  { value: 'ok',           label: 'ok',   title: 'Well-exposed only' },
  { value: 'overexposed',  label: 'over', title: 'Overexposed only' },
  { value: 'underexposed', label: 'under', title: 'Underexposed only' },
];

export function ExposureFilter(): React.JSX.Element {
  const exposure  = useImageStore((s) => s.filter.exposure);
  const setFilter = useImageStore((s) => s.setFilter);

  return (
    <FilterGroup label="Exposure">
      <SegmentedControl value={exposure} options={OPTIONS} onChange={(v) => setFilter({ exposure: v })} />
    </FilterGroup>
  );
}
