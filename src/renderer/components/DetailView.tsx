import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PhotoImage } from '../../shared/types';
import { mediaUrl } from '../../shared/ipc';
import { useImageStore } from '../store/imageStore';
import { StarRating } from './StarRating';

// ── Zoom image ─────────────────────────────────────────────────────────────

function ZoomImage({ src, alt }: { src: string; alt: string }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!zoomed) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setOrigin({
      x: ((e.clientX - r.left) / r.width)  * 100,
      y: ((e.clientY - r.top)  / r.height) * 100,
    });
  }, [zoomed]);

  const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setOrigin({
      x: ((e.clientX - r.left) / r.width)  * 100,
      y: ((e.clientY - r.top)  / r.height) * 100,
    });
    setZoomed((z) => !z);
  }, []);

  return (
    <div
      ref={ref}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ cursor: zoomed ? 'zoom-out' : 'zoom-in' }}
      onClick={onClick}
      onMouseMove={onMove}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="h-full w-full object-contain select-none"
        style={{
          transform:       zoomed ? 'scale(2.8)' : 'scale(1)',
          transformOrigin: `${origin.x}% ${origin.y}%`,
          transition:      zoomed ? 'none' : 'transform 0.18s ease',
          willChange:      'transform',
        }}
      />
    </div>
  );
}

// ── Metric row ─────────────────────────────────────────────────────────────

function Metric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex justify-between border-b border-stone-100 py-1.5 text-sm dark:border-zinc-700">
      <span className="text-stone-500 dark:text-zinc-400">{label}</span>
      <span className="font-mono text-stone-900 dark:text-zinc-100">{value}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function DetailView({
  image,
  suggested,
  onClose,
  onPrev,
  onNext,
}: {
  image: PhotoImage;
  suggested?: number;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}): React.JSX.Element {
  const setManualStars      = useImageStore((s) => s.setManualStars);
  const toggleMarkForDelete = useImageStore((s) => s.toggleMarkForDelete);

  const [hiResPath, setHiRes] = useState<string | undefined>();

  // Load 4K hi-res whenever the image changes.
  useEffect(() => {
    setHiRes(undefined);
    if (!image.previewPath) return;
    let cancelled = false;
    void window.api.getHiResPreview(image.path, image.type).then((p) => {
      if (!cancelled) setHiRes(p ?? undefined);
    });
    return () => { cancelled = true; };
  }, [image.path]);

  // Keyboard: Escape closes, arrows navigate.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
      if (e.key === 'x' || e.key === 'X') toggleMarkForDelete(image.path);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext, image.path, toggleMarkForDelete]);

  const stars     = image.manualStars ?? suggested;
  const isDerived = image.manualStars === undefined;
  const eye       = image.eyeStatus;
  const imgSrc    = hiResPath ?? image.previewPath;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative m-6 flex w-full max-w-[96vw] overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl"
        style={{ maxHeight: 'calc(100vh - 3rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Large image pane ── */}
        <div className="relative flex flex-1 overflow-hidden bg-black">
          {imgSrc ? (
            <ZoomImage src={mediaUrl(imgSrc)} alt={image.name} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-500">
              Loading preview…
            </div>
          )}

          {/* Delete border */}
          {image.markedForDelete && (
            <div className="pointer-events-none absolute inset-0 border-4 border-rose-500 z-10" />
          )}

          {/* Prev / Next */}
          {onPrev && (
            <button
              onClick={(e) => { e.stopPropagation(); onPrev(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/50 p-3 text-white text-xl hover:bg-black/75"
            >‹</button>
          )}
          {onNext && (
            <button
              onClick={(e) => { e.stopPropagation(); onNext(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/50 p-3 text-white text-xl hover:bg-black/75"
            >›</button>
          )}

          {/* Hi-res loading indicator */}
          {!hiResPath && image.previewPath && (
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-zinc-400">
              Loading hi-res…
            </span>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <h2 className="break-all text-sm font-semibold text-zinc-100">{image.name}</h2>
            <button
              onClick={onClose}
              className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
              aria-label="Close"
            >✕</button>
          </div>

          {/* Rating */}
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
              Rating {isDerived ? '(suggested)' : '(manual)'}
            </p>
            <StarRating
              value={stars}
              derived={isDerived}
              size="lg"
              onChange={(n) => setManualStars(image.path, n === 0 ? null : n)}
            />
            {!isDerived && (
              <button
                onClick={() => setManualStars(image.path, null)}
                className="mt-1 text-xs text-zinc-500 hover:text-zinc-300"
              >
                Reset to suggestion
              </button>
            )}
            {image.existingRating !== undefined && (
              <p className="mt-2 text-xs text-zinc-500">
                File rating: {'★'.repeat(image.existingRating)}{'☆'.repeat(5 - image.existingRating)}
                <span className="ml-1 text-zinc-600">({image.existingRating}★ from XMP)</span>
              </p>
            )}
          </div>

          {/* Mark for delete */}
          <button
            onClick={() => toggleMarkForDelete(image.path)}
            className={`w-full rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              image.markedForDelete
                ? 'bg-rose-600 text-white hover:bg-rose-500'
                : 'border border-zinc-700 text-zinc-400 hover:border-rose-600 hover:text-rose-400'
            }`}
          >
            {image.markedForDelete ? '🗑 Marked for delete' : '🗑 Mark for delete'}
          </button>

          {/* Scores */}
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Scores</p>
            <Metric label="Type"       value={image.type.toUpperCase()} />
            <Metric label="Sharpness"  value={image.sharpnessScore  !== undefined ? String(Math.round(image.sharpnessScore))  : '—'} />
            <Metric label="Exposure"   value={image.exposureScore   !== undefined ? `${Math.round(image.exposureScore)} (${image.exposureHint ?? 'ok'})` : '—'} />
            <Metric label="Aesthetics" value={image.aestheticsScore !== undefined ? `${image.aestheticsScore.toFixed(1)} / 10` : '—'} />
            <Metric label="Suggested"  value={suggested !== undefined ? `${suggested}★` : '—'} />
            <Metric label="Written"    value={image.written ? 'yes' : 'no'} />
          </div>

          {/* Face / expression */}
          {eye && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Face</p>
              {eye.facesDetected === 0 ? (
                <p className="text-xs text-zinc-500">No faces detected</p>
              ) : (
                <>
                  <Metric label="Faces" value={String(eye.facesDetected)} />
                  <Metric label="Eyes"  value={eye.allEyesOpen ? 'open ✓' : 'CLOSED ✗'} />
                  {eye.smileScore   !== undefined && <Metric label="Smile"     value={`${Math.round(eye.smileScore * 100)}%`} />}
                  {eye.mouthOpen    !== undefined && <Metric label="Mouth"     value={eye.mouthOpen ? 'open ✗' : 'closed ✓'} />}
                  {eye.headTiltDeg  !== undefined && <Metric label="Tilt"      value={`${eye.headTiltDeg.toFixed(1)}°`} />}
                  {eye.badExpression && (
                    <p className="mt-1 rounded bg-rose-900/40 px-2 py-1 text-xs text-rose-300">
                      Bad expression flagged
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Burst */}
          {image.burstGroup && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Burst</p>
              <Metric label="Rank" value={image.burstRank === 1 ? '#1 (best)' : `#${image.burstRank ?? '?'}`} />
            </div>
          )}

          <p className="mt-auto text-[10px] text-zinc-600">
            ← → navigate · X mark delete · Esc close
          </p>
        </div>
      </div>
    </div>
  );
}
