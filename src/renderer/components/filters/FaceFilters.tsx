import React from 'react';
import { useImageStore, type EyeFilterState } from '../../store/imageStore';
import { Chip, FilterGroup } from './controls';

const EYE_FILTERS: { key: keyof EyeFilterState; label: string; title: string }[] = [
  { key: 'facesOnly',         label: 'Faces',       title: 'Only images with a detected face' },
  { key: 'multipleFacesOnly', label: 'Group',       title: 'Only images with 2+ detected faces' },
  { key: 'eyesOpenOnly',      label: 'Eyes open',   title: 'Only images where all detected eyes are open' },
  { key: 'eyesClosedOnly',    label: 'Eyes closed', title: 'Only images where at least one eye is closed' },
  { key: 'smilingOnly',       label: 'Smiling',     title: 'Only images with a pronounced smile' },
  { key: 'notSmilingOnly',    label: 'Not smiling', title: 'Only images with a neutral/serious expression' },
  { key: 'mouthOpenOnly',     label: 'Mouth open',  title: 'Only images with the mouth open' },
  { key: 'hideFlagged',       label: 'No flags',    title: 'Hide images flagged for closed eyes / open mouth / extreme tilt' },
];

export function FaceFilters(): React.JSX.Element {
  const eyes         = useImageStore((s) => s.filter.eyes);
  const setEyeFilter = useImageStore((s) => s.setEyeFilter);

  return (
    <FilterGroup label="Faces">
      {EYE_FILTERS.map((f) => (
        <Chip
          key={f.key}
          active={eyes[f.key]}
          onClick={() => setEyeFilter({ [f.key]: !eyes[f.key] })}
          title={f.title}
        >
          {f.label}
        </Chip>
      ))}
    </FilterGroup>
  );
}
