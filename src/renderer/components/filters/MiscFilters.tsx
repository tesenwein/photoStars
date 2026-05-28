import React from 'react';
import { useImageStore } from '../../store/imageStore';
import { Toggle } from './controls';

export function MiscFilters(): React.JSX.Element {
  const portraitOnly    = useImageStore((s) => s.filter.portraitOnly);
  const unwrittenOnly   = useImageStore((s) => s.filter.unwrittenOnly);
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
        checked={relativeRating}
        onChange={setRelative}
        title="Rate relative to the whole shoot (top shots get more stars as the set grows). Off = absolute per-image score."
      >
        Relative rating
      </Toggle>
    </div>
  );
}
