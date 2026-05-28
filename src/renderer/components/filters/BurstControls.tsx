import React from 'react';
import { useImageStore } from '../../store/imageStore';
import { FilterGroup, Toggle } from './controls';

export function BurstControls(): React.JSX.Element {
  const burstWindowSec = useImageStore((s) => s.filter.burstWindowSec);
  const burstBestOnly  = useImageStore((s) => s.filter.burstBestOnly);
  const groupBursts    = useImageStore((s) => s.groupBursts);
  const setFilter      = useImageStore((s) => s.setFilter);
  const setGroupBursts = useImageStore((s) => s.setGroupBursts);

  return (
    <div className="flex items-center gap-4">
      <FilterGroup label="Burst">
        <input
          type="range" min={1} max={10} step={1}
          value={burstWindowSec}
          onChange={(e) => setFilter({ burstWindowSec: Number(e.target.value) })}
          className="w-20 accent-amber-500"
          title="Burst grouping window in seconds"
        />
        <span className="w-8 text-stone-600 dark:text-zinc-300">{burstWindowSec}s</span>
      </FilterGroup>
      <Toggle checked={burstBestOnly} onChange={(v) => setFilter({ burstBestOnly: v })}>Best only</Toggle>
      <Toggle checked={groupBursts} onChange={setGroupBursts}>Group bursts</Toggle>
    </div>
  );
}
