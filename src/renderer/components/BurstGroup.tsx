import React from 'react';
import type { PhotoImage } from '../../shared/types';
import { ImageTile } from './ImageTile';

export function BurstGroup({
  groupNumber,
  members,
  selectedPaths,
  getSuggested,
  onOpen,
}: {
  groupNumber: number;
  members: PhotoImage[];
  selectedPaths: Set<string>;
  getSuggested: (img: PhotoImage) => number | undefined;
  onOpen: (path: string) => void;
}): React.JSX.Element {
  return (
    <div className="col-span-full rounded-xl border border-stone-300 bg-stone-100/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
      <div className="mb-2.5 flex items-center gap-2 text-xs">
        <span className="rounded bg-sky-600 px-2 py-0.5 font-medium text-white">Burst {groupNumber}</span>
        <span className="text-stone-500 dark:text-zinc-400">{members.length} shots</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {members.map((img) => (
          <ImageTile
            key={img.path}
            image={img}
            suggested={getSuggested(img)}
            selected={selectedPaths.has(img.path)}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
