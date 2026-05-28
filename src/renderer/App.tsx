import React, { useEffect, useState } from 'react';
import { useImageStore } from './store/imageStore';
import { ImageTile } from './components/ImageTile';
import { DetailView } from './components/DetailView';
import { effectiveStars } from '../shared/types';
import type { WriteRatingItem } from '../shared/ipc';

export function App(): React.JSX.Element {
  const folder = useImageStore((s) => s.folder);
  const images = useImageStore((s) => s.images);
  const selected = useImageStore((s) => s.selected);
  const setFolder = useImageStore((s) => s.setFolder);
  const setImages = useImageStore((s) => s.setImages);
  const updateImage = useImageStore((s) => s.updateImage);
  const clearSelection = useImageStore((s) => s.clearSelection);

  const [openPath, setOpenPath] = useState<string | undefined>();
  const [writing, setWriting] = useState(false);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    const offPreview = window.api.onPreviewReady((p) => updateImage(p.path, { previewPath: p.previewPath }));
    const offAnalysis = window.api.onAnalysisReady((p) => {
      if (p.error) return;
      updateImage(p.path, {
        sharpnessScore: p.sharpnessScore,
        exposureScore: p.exposureScore,
        exposureHint: p.exposureHint,
        derivedStars: p.derivedStars,
      });
    });
    return () => {
      offPreview();
      offAnalysis();
    };
  }, [updateImage]);

  const handleOpenFolder = async (): Promise<void> => {
    const picked = await window.api.selectFolder();
    if (!picked) return;
    setFolder(picked);
    clearSelection();
    setStatus('');
    setImages(await window.api.ingestFolder(picked));
  };

  const apply = async (scope: 'selected' | 'all'): Promise<void> => {
    const targets = images.filter((img) => {
      if (scope === 'selected' && !selected.has(img.path)) return false;
      return effectiveStars(img) !== undefined;
    });
    if (targets.length === 0) {
      setStatus('Nothing to apply.');
      return;
    }

    setWriting(true);
    setStatus(`Writing ${targets.length}…`);
    const items: WriteRatingItem[] = targets.map((img) => ({
      path: img.path,
      type: img.type,
      stars: effectiveStars(img) as number,
    }));

    const results = await window.api.writeRatings(items);
    let ok = 0;
    for (const r of results) {
      if (r.ok) {
        ok++;
        updateImage(r.path, { written: true });
      }
    }
    const failed = results.length - ok;
    setStatus(`Wrote ${ok}${failed ? `, ${failed} failed` : ''}.`);
    setWriting(false);
  };

  const open = images.find((i) => i.path === openPath);
  const pending = images.filter((i) => !i.previewPath).length;
  const selectedCount = selected.size;

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">PhotoStars</h1>
          {folder && <p className="mt-0.5 text-xs text-slate-400">{folder}</p>}
        </div>
        <div className="flex items-center gap-4">
          {status && <span className="text-sm text-slate-400">{status}</span>}
          {images.length > 0 && (
            <span className="text-sm text-slate-400">
              {images.length} images{pending > 0 ? ` · ${pending} loading` : ''}
            </span>
          )}
          {images.length > 0 && (
            <>
              <button
                onClick={() => apply('selected')}
                disabled={writing || selectedCount === 0}
                className="rounded border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
              >
                Apply selected{selectedCount ? ` (${selectedCount})` : ''}
              </button>
              <button
                onClick={() => apply('all')}
                disabled={writing}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-40"
              >
                Apply all
              </button>
            </>
          )}
          <button
            onClick={handleOpenFolder}
            disabled={writing}
            className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400 disabled:opacity-40"
          >
            Open folder
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {images.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <p>Open a folder to load photos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
            {images.map((img) => (
              <ImageTile
                key={img.path}
                image={img}
                selected={selected.has(img.path)}
                onOpen={() => setOpenPath(img.path)}
              />
            ))}
          </div>
        )}
      </main>

      {open && <DetailView image={open} onClose={() => setOpenPath(undefined)} />}
    </div>
  );
}
