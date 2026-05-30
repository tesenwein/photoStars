import React from 'react';
import { useImageStore } from '../../store/imageStore';
import { Chip, FilterGroup } from './controls';

export function StarFilter(): React.JSX.Element {
  const minStars  = useImageStore((s) => s.filter.minStars);
  const setFilter = useImageStore((s) => s.setFilter);

  return (
    <FilterGroup label="Min stars">
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <Chip key={n} active={minStars === n} onClick={() => setFilter({ minStars: n })}>
          {n === 0 ? 'all' : `${n}★`}
        </Chip>
      ))}
    </FilterGroup>
  );
}
