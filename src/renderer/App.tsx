import React, { useEffect, useMemo, useState } from 'react';
import { useImageStore } from './store/imageStore';
import { ImageTile } from './components/ImageTile';
import { DetailView } from './components/DetailView';
import { FilterSortBar } from './components/FilterSortBar';
import { effectiveStars, type PhotoImage } from '../shared/types';
import type { WriteRatingItem } from '../shared/ipc';

function sortImages(images: PhotoImage[], field: string, dir: string): PhotoImage[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...images].sort((a, b) => {
    let av: number | string, bv: number | string;
    switch (field) {
      case 'stars':      av = effectiveStars(a) ?? -1; bv = effectiveStars(b) ?? -1; break;
      case 'sharpness':  av = a.sharpnessScore  ?? -1; bv = b.sharpnessScore  ?? -1; break;
      case 'exposure':   av = a.exposureScore   ?? -1; bv = b.exposureScore   ?? -1; break;
      case 'aesthetics': av = a.aestheticsScore ?? -1; bv = b.aestheticsScore ?? -1; break;
      default:           av = a.name; bv = b.name;
    }
    if (av < bv) return -sign;
    if (av > bv) return  sign;
    return 0;
  });
}

export function App(): React.JSX.Element {
  const folder        = useImageStore((s) => s.folder);
  const images        = useImageStore((s) => s.images);
  const selected      = useImageStore((s) => s.selected);
  const sort          = useImageStore((s) => s.sort);
  const filter        = useImageStore((s) => s.filter);
  const setFolder     = useImageStore((s) => s.setFolder);
  const setImages     = useImageStore((s) => s.setImages);
  const updateImage   = useImageStore((s) => s.updateImage);
  const clearSelection = useImageStore((s) => s.clearSelection);

  const [openPath, setOpenPath] = useState<string | undefined>();
  const [writing,  setWriting]  = useState(false);
  const [backup,   setBackup]   = useState(false);
  const [status,   setStatus]   = useState<string>('');

  useEffect(() => {
    const offPreview  = window.api.onPreviewReady((p) => updateImage(p.path, {
      previewPath: p.previewPath,
      burstGroup:  p.burstGroup,
      burstRank:   p.burstRank,
    }));
    const offAnalysis = window.api.onAnalysisReady((p) => {
      if (p.error) return;
      updateImage(p.path, {
        sharpnessScore:  p.sharpnessScore,
        exposureScore:   p.exposureScore,
        exposureHint:    p.exposureHint,
        eyeStatus:       p.eyeStatus,
        aestheticsScore: p.aestheticsScore,
        derivedStars:    p.derivedStars,
      });
    });
    return () => { offPreview(); offAnalysis(); };
  }, [updateImage]);

  const visibleImages = useMemo(() => {
    let result = images;
    if (filter.minStars > 0) {
      result = result.filter((i) => (effectiveStars(i) ?? 0) >= filter.minStars);
    }
    if (filter.burstBestOnly) {
      result = result.filter((i) => !i.burstGroup || i.burstRank === 1);
    }
    if (filter.unwrittenOnly) {
      result = result.filter((i) => !i.written);
    }
    return sortImages(result, sort.field, sort.dir);
  }, [images, sort, filter]);

  const handleOpenFolder = async (): Promise<void> => {
    const picked = await window.api.selectFolder();
    if (!picked) return;
    setFolder(picked);
    clearSelection();
    setImages([]);
    setStatus('Scanning…');
    const imgs = await window.api.ingestFolder(picked);
    setImages(imgs);
    setStatus(imgs.length === 0 ? 'No supported images found.' : '');
  };

  const apply = async (scope: 'selected' | 'all'): Promise<void> => {
    const targets = images.filter((img) => {
      if (scope === 'selected' && !selected.has(img.path)) return false;
      return effectiveStars(img) !== undefined;
    });
    if (targets.length === 0) { setStatus('Nothing to apply.'); return; }

    setWriting(true);
    setStatus(`Writing ${targets.length}…`);
    const items: WriteRatingItem[] = targets.map((img) => ({
      path: img.path,
      type: img.type,
      stars: effectiveStars(img) as number,
      backup,
    }));

    const results = await window.api.writeRatings(items);
    let ok = 0;
    for (const r of results) {
      if (r.ok) { ok++; updateImage(r.path, { written: true }); }
    }
    const failed = results.length - ok;
    setStatus(`Wrote ${ok}${failed ? `, ${failed} failed` : ''}.`);
    setWriting(false);
  };

  const open    = images.find((i) => i.path === openPath);
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
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={backup}
              onChange={(e) => setBackup(e.target.checked)}
              className="accent-amber-400"
            />
            Backup
          </label>
          <button
            onClick={handleOpenFolder}
            disabled={writing}
            className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400 disabled:opacity-40"
          >
            Open folder
          </button>
        </div>
      </header>

      {images.length > 0 && <FilterSortBar />}

      <main className="flex-1 overflow-y-auto p-6">
        {visibleImages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <p>{images.length === 0 ? 'Open a folder to load photos.' : 'No images match the current filters.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
            {visibleImages.map((img) => (
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
