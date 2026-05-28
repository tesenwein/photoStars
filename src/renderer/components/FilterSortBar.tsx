import React from 'react';
import { Divider } from './filters/controls';
import { SortControls } from './filters/SortControls';
import { StarFilter } from './filters/StarFilter';
import { CullFilter } from './filters/CullFilter';
import { ExposureFilter } from './filters/ExposureFilter';
import { BurstControls } from './filters/BurstControls';
import { FaceFilters } from './filters/FaceFilters';
import { MiscFilters } from './filters/MiscFilters';

export function FilterSortBar(): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-stone-200 bg-stone-100/60 px-6 py-2 text-xs text-stone-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
      <SortControls />
      <Divider />
      <StarFilter />
      <Divider />
      <CullFilter />
      <Divider />
      <ExposureFilter />
      <Divider />
      <BurstControls />
      <Divider />
      <FaceFilters />
      <Divider />
      <MiscFilters />
    </div>
  );
}
