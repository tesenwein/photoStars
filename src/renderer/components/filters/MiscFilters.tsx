import React from 'react';
import { useImageStore } from '../../store/imageStore';
import { Toggle } from './controls';

export function MiscFilters(): React.JSX.Element {
  const portraitOnly    = useImageStore((s) => s.filter.portraitOnly);
  const unwrittenOnly   = useImageStore((s) => s.filter.unwrittenOnly);
  const modifiedOnly    = useImageStore((s) => s.filter.modifiedOnly);
  const rawOnly         = useImageStore((s) => s.filter.rawOnly);
  const relativeRating  = useImageStore((s) => s.relativeRating);
  const setFilter       = useImageStore((s) => s.setFilter);
  const setRelative     = useImageStore((s) => s.setRelativeRating);

  return (
    <div className="flex items-center gap-4">
      <Toggle checked={portraitOnly} onChange={(v) => setFilter({ portraitOnly: v })} title="Only images detected as portraits">
        Portrait
      </Toggle>
      <Toggle checked={unwrittenOnly} onChange={(v) => setFilter({ unwrittenOnly: v })}>
        Unwritten only
      </Toggle>
      <Toggle
        checked={modifiedOnly}
        onChange={(v) => setFilter({ modifiedOnly: v })}
        title="Only images you've touched — rated with stars or flagged keep/reject"
      >
        Modified only
      </Toggle>
      <Toggle checked={rawOnly} onChange={(v) => setFilter({ rawOnly: v })} title="Only RAW files">
        RAW only
      </Toggle>
      <Toggle
        checked={relativeRating}
        onChange={setRelative}
        title="Rate relative to the whole shoot (top shots get more stars as the set grows). Off = absolute per-image score."
      >
        Relative rating
      </Toggle>
    </div>
  );
}
