import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useImageStore, passesEyeFilter } from './store/imageStore';
import { useScoringStore } from './store/scoringStore';
import { ImageTile } from './components/ImageTile';
import { DetailView } from './components/DetailView';
import { FilterSortBar } from './components/FilterSortBar';
import { SplitView } from './components/SplitView';
import { BurstGroup } from './components/BurstGroup';
import { SettingsPanel } from './components/SettingsPanel';
import { useTheme } from './useTheme';
import { assignRelativeStars } from '../shared/relativeRating';
import { bucketBursts } from '../shared/burst';
import { recomputeStars } from '../shared/scoring';
import { lrLabel, lrPickLabel, type PhotoImage } from '../shared/types';
import type { WriteRatingItem } from '../shared/ipc';

type ViewMode = 'grid' | 'split';

function sortImages(
  images: PhotoImage[],
  field: string,
  dir: string,
  starOf: (img: PhotoImage) => number | undefined
): PhotoImage[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...images].sort((a, b) => {
    let av: number | string, bv: number | string;
    switch (field) {
      case 'stars':      av = starOf(a) ?? -1; bv = starOf(b) ?? -1; break;
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
  const folder         = useImageStore((s) => s.folder);
  const images         = useImageStore((s) => s.images);
  const selected       = useImageStore((s) => s.selected);
  const sort           = useImageStore((s) => s.sort);
  const filter         = useImageStore((s) => s.filter);
  const setFolder      = useImageStore((s) => s.setFolder);
  const setImages      = useImageStore((s) => s.setImages);
  const updateImage    = useImageStore((s) => s.updateImage);
  const clearSelection = useImageStore((s) => s.clearSelection);
  const relativeRating = useImageStore((s) => s.relativeRating);
  const groupBursts    = useImageStore((s) => s.groupBursts);
  const removeImages   = useImageStore((s) => s.removeImages);

  const { theme, toggle: toggleTheme } = useTheme();
  const scoringConfig = useScoringStore((s) => s.config);

  // Re-derive stars from raw scores using user-configurable weights.
  // This runs purely in the renderer so changes take effect instantly.
  const reScore = useCallback(
    (img: PhotoImage) => recomputeStars(img, scoringConfig),
    [scoringConfig]
  );

  // Relative (whole-shoot) rating: rank all loaded images by recomputed quality
  // and map to a target star distribution. Recomputes as analyses stream in.
  const relativeMap = useMemo(() => {
    if (!relativeRating) return null;
    const scored = images.map((img) => ({
      ...img,
      qualityScore: reScore(img).qualityScore,
    }));
    return assignRelativeStars(scored);
  }, [images, relativeRating, reScore]);

  const getSuggested = useCallback(
    (img: PhotoImage): number | undefined =>
      (relativeMap ? relativeMap.get(img.path) : undefined) ?? reScore(img).derivedStars,
    [relativeMap, reScore]
  );
  const effectiveOf = useCallback(
    (img: PhotoImage): number | undefined => img.manualStars ?? getSuggested(img),
    [getSuggested]
  );

  // Stable burst-group numbering (in scan order) for the grouped grid headers.
  const burstNumbers = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const img of images) {
      if (img.burstGroup && !m.has(img.burstGroup)) m.set(img.burstGroup, ++n);
    }
    return m;
  }, [images]);

  const [openPath, setOpenPath]       = useState<string | undefined>();
  const [viewMode, setViewMode]       = useState<ViewMode>('grid');
  const [writing,   setWriting]       = useState(false);
  const [deleting,  setDeleting]      = useState(false);
  const [backup,   setBackup]         = useState(false);
  const [writeLr,  setWriteLr]        = useState(true);
  const [status,   setStatus]         = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  const toggleMarkForDelete = useImageStore((s) => s.toggleMarkForDelete);

  // X in grid view → toggle mark-for-delete on every selected image.
  useEffect(() => {
    if (viewMode !== 'grid') return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'x' && e.key !== 'X') return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      for (const path of selected) toggleMarkForDelete(path);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewMode, selected, toggleMarkForDelete]);

  useEffect(() => {
    const offPreview  = window.api.onPreviewReady((p) => updateImage(p.path, {
      previewPath:  p.previewPath,
      timestamp:    p.timestamp,
      burstGroup:   p.burstGroup,
      burstRank:    p.burstRank,
      // If the file already carries a rating, treat it as a manual star and
      // flag it as already-written so we don't overwrite it unintentionally.
      ...(p.existingRating !== undefined && {
        manualStars: p.existingRating,
        written:     true,
      }),
    }));
    const offAnalysis = window.api.onAnalysisReady((p) => {
      if (p.error) return;
      updateImage(p.path, {
        sharpnessScore:     p.sharpnessScore,
        exposureScore:      p.exposureScore,
        exposureHint:       p.exposureHint,
        eyeStatus:          p.eyeStatus,
        aestheticsScore:    p.aestheticsScore,
        isPortrait:         p.isPortrait,
        faceSharpnessScore: p.faceSharpnessScore,
        bokehRatio:         p.bokehRatio,
        qualityScore:       p.qualityScore,
        derivedStars:       p.derivedStars,
      });
    });
    return () => { offPreview(); offAnalysis(); };
  }, [updateImage]);

  // Re-group bursts live when the window slider changes (or timestamps arrive).
  // Bucketing is pure and deterministic, so we only write back when an
  // assignment actually changed — that breaks the images→effect→images loop.
  useEffect(() => {
    const windowMs = filter.burstWindowSec * 1000;
    const assignments = bucketBursts(
      images.map((i) => ({ path: i.path, ts: i.timestamp ?? -1 })),
      windowMs
    );
    let changed = false;
    const next = images.map((img) => {
      const info = assignments.get(img.path);
      if (img.burstGroup === info?.burstGroup && img.burstRank === info?.burstRank) return img;
      changed = true;
      return { ...img, burstGroup: info?.burstGroup, burstRank: info?.burstRank };
    });
    if (changed) setImages(next);
  }, [images, filter.burstWindowSec, setImages]);

  const visibleImages = useMemo(() => {
    let result = images;
    if (filter.minStars > 0) {
      result = result.filter((i) => (effectiveOf(i) ?? 0) >= filter.minStars);
    }
    if (filter.burstBestOnly) {
      result = result.filter((i) => !i.burstGroup || i.burstRank === 1);
    }
    if (filter.unwrittenOnly) {
      result = result.filter((i) => !i.written);
    }
    result = result.filter((i) => passesEyeFilter(filter.eyes, i));
    return sortImages(result, sort.field, sort.dir, effectiveOf);
  }, [images, sort, filter, effectiveOf]);

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
      return effectiveOf(img) !== undefined;
    });
    if (targets.length === 0) { setStatus('Nothing to apply.'); return; }

    setWriting(true);
    setStatus(`Writing ${targets.length}…`);
    const items: WriteRatingItem[] = targets.map((img) => {
      const stars = effectiveOf(img) as number;
      const bad   = img.eyeStatus?.badExpression ?? false;
      return {
        path:  img.path,
        type:  img.type,
        stars,
        backup,
        lrLabel:     writeLr ? lrLabel(stars, bad) : undefined,
        lrPickLabel: writeLr ? lrPickLabel(stars)   : undefined,
      };
    });

    const results = await window.api.writeRatings(items);
    let ok = 0;
    for (const r of results) {
      if (r.ok) { ok++; updateImage(r.path, { written: true }); }
    }
    const failed = results.length - ok;
    setStatus(`Wrote ${ok}${failed ? `, ${failed} failed` : ''}.`);
    setWriting(false);
  };

  const markedCount  = images.filter((i) => i.markedForDelete).length;

  const deleteMarked = async (): Promise<void> => {
    const marked = images.filter((i) => i.markedForDelete).map((i) => i.path);
    if (marked.length === 0) return;
    if (!window.confirm(`Move ${marked.length} image${marked.length > 1 ? 's' : ''} to Recycle Bin?`)) return;
    setDeleting(true);
    setStatus(`Deleting ${marked.length}…`);
    const failed = await window.api.trashFiles(marked);
    const removed = marked.filter((p) => !failed.includes(p));
    removeImages(removed);
    setStatus(failed.length ? `Deleted ${removed.length}, ${failed.length} failed.` : `Deleted ${removed.length}.`);
    setDeleting(false);
  };

  const open         = images.find((i) => i.path === openPath);
  const pending      = images.filter((i) => !i.previewPath).length;
  const selectedCount = selected.size;

  return (
    <div className="theme-transition flex h-full flex-col bg-stone-50 text-stone-900 dark:bg-zinc-900 dark:text-zinc-100">
      <header className="flex items-center justify-between border-b border-stone-200 px-6 py-3 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">PhotoStars</h1>
          {folder && <p className="mt-0.5 text-xs text-stone-500 dark:text-zinc-400">{folder}</p>}
        </div>
        <div className="flex items-center gap-3">
          {status && <span className="text-sm text-stone-500 dark:text-zinc-400">{status}</span>}
          {images.length > 0 && (
            <span className="text-sm text-stone-500 dark:text-zinc-400">
              {images.length} images{pending > 0 ? ` · ${pending} loading` : ''}
            </span>
          )}

          {/* View toggle */}
          {images.length > 0 && (
            <div className="flex overflow-hidden rounded-md border border-stone-300 text-sm dark:border-zinc-700">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 ${viewMode === 'grid' ? 'bg-stone-200 text-stone-900 dark:bg-zinc-700 dark:text-white' : 'text-stone-500 hover:bg-stone-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}
                title="Grid view"
              >⊞</button>
              <button
                onClick={() => setViewMode('split')}
                className={`px-3 py-1.5 ${viewMode === 'split' ? 'bg-stone-200 text-stone-900 dark:bg-zinc-700 dark:text-white' : 'text-stone-500 hover:bg-stone-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}
                title="Split view"
              >▤</button>
            </div>
          )}

          {images.length > 0 && (
            <>
              <button
                onClick={() => apply('selected')}
                disabled={writing || selectedCount === 0}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Apply selected{selectedCount ? ` (${selectedCount})` : ''}
              </button>
              <button
                onClick={() => apply('all')}
                disabled={writing}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                Apply all
              </button>
            </>
          )}

          {/* Options */}
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-stone-500 dark:text-zinc-400">
            <input type="checkbox" checked={writeLr} onChange={(e) => setWriteLr(e.target.checked)} className="accent-amber-500" />
            LR labels
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-stone-500 dark:text-zinc-400">
            <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} className="accent-amber-500" />
            Backup
          </label>

          {markedCount > 0 && (
            <button
              onClick={deleteMarked}
              disabled={deleting || writing}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-40"
              title="Move marked images to Recycle Bin"
            >
              🗑 Delete marked ({markedCount})
            </button>
          )}

          {images.length > 0 && (
            <button
              onClick={async () => {
                setStatus('Clearing cache…');
                await window.api.clearCache();
                setStatus('Cache cleared — re-open folder to re-analyse.');
              }}
              disabled={writing}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              title="Delete cached previews and analysis — forces full re-run"
            >
              Clear cache
            </button>
          )}
          <button
            onClick={handleOpenFolder}
            disabled={writing}
            className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-stone-900 hover:bg-amber-400 disabled:opacity-40"
          >
            Open folder
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="rounded-md border border-stone-300 px-2.5 py-1.5 text-sm text-stone-600 hover:bg-stone-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          {/* Scoring settings */}
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={`rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
              showSettings
                ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-400'
                : 'border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
            title="Scoring settings"
            aria-label="Scoring settings"
          >
            ⚙
          </button>
        </div>
      </header>

      {images.length > 0 && <FilterSortBar />}

      {viewMode === 'split' && images.length > 0 ? (
        <SplitView images={images} filteredImages={visibleImages} getSuggested={getSuggested} />
      ) : (
        <main className="flex-1 overflow-y-auto p-6">
          {visibleImages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-stone-400 dark:text-zinc-500">
              <p>{images.length === 0 ? 'Open a folder to load photos.' : 'No images match the current filters.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
              {(() => {
                const tile = (img: PhotoImage): React.JSX.Element => (
                  <ImageTile
                    key={img.path}
                    image={img}
                    suggested={getSuggested(img)}
                    selected={selected.has(img.path)}
                    onOpen={() => setOpenPath(img.path)}
                  />
                );
                if (!groupBursts) return visibleImages.map(tile);

                const seen = new Set<string>();
                const nodes: React.ReactNode[] = [];
                for (const img of visibleImages) {
                  if (img.burstGroup) {
                    if (seen.has(img.burstGroup)) continue;
                    seen.add(img.burstGroup);
                    const members = visibleImages.filter((i) => i.burstGroup === img.burstGroup);
                    if (members.length >= 2) {
                      nodes.push(
                        <BurstGroup
                          key={`burst-${img.burstGroup}`}
                          groupNumber={burstNumbers.get(img.burstGroup) ?? 0}
                          members={members}
                          selectedPaths={selected}
                          getSuggested={getSuggested}
                          onOpen={setOpenPath}
                        />
                      );
                      continue;
                    }
                  }
                  nodes.push(tile(img));
                }
                return nodes;
              })()}
            </div>
          )}
        </main>
      )}

      {open && <DetailView image={open} suggested={getSuggested(open)} onClose={() => setOpenPath(undefined)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
