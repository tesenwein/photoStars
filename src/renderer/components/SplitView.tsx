import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useImageStore } from '../store/imageStore';
import { type PhotoImage } from '../../shared/types';
import { mediaUrl } from '../../shared/ipc';
import { StarRating } from './StarRating';

// ── Shared CSS background-zoom helper ─────────────────────────────────────

function BgZoom({
  src, bbox, size, className = '', children,
}: {
  src: string;
  bbox: { x: number; y: number; w: number; h: number };
  size: number;
  className?: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  const scale  = Math.min(1 / bbox.w, 1 / bbox.h);
  const bgSize = scale * 100;
  const posX   = bbox.x / Math.max(1 - bbox.w, 0.01) * 100;
  const posY   = bbox.y / Math.max(1 - bbox.h, 0.01) * 100;

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        width:              size,
        height:             size,
        backgroundImage:    `url("${src}")`,
        backgroundRepeat:   'no-repeat',
        backgroundSize:     `${bgSize.toFixed(1)}%`,
        backgroundPosition: `${posX.toFixed(1)}% ${posY.toFixed(1)}%`,
      }}
    >
      {children}
    </div>
  );
}

// ── Face zoom + eye inset ─────────────────────────────────────────────────

function FaceZoom({ previewPath, faceBbox, eyeBbox, allEyesOpen }: {
  previewPath: string;
  faceBbox: { x: number; y: number; w: number; h: number };
  eyeBbox?: { x: number; y: number; w: number; h: number };
  allEyesOpen?: boolean;
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <BgZoom
        src={mediaUrl(previewPath)}
        bbox={faceBbox}
        size={220}
        className="rounded-lg border border-stone-300 shadow-xl dark:border-zinc-600"
      />
      {eyeBbox && (
        <div>
          <p className="mb-1 text-xs text-stone-400 dark:text-zinc-500">
            Eyes{' '}
            <span className={allEyesOpen === false ? 'text-rose-500 font-medium dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
              {allEyesOpen === false ? '✗ closed' : '✓ open'}
            </span>
          </p>
          {/* Wide landscape panel — eyes are side-by-side */}
          <div
            className="rounded-lg border-2 border-stone-400 shadow-lg overflow-hidden dark:border-zinc-500"
            style={{
              width: 220,
              height: 100,
              backgroundImage: `url("${mediaUrl(previewPath)}")`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${(1 / eyeBbox.w * 100).toFixed(1)}%`,
              backgroundPosition: `${(eyeBbox.x / Math.max(1 - eyeBbox.w, 0.01) * 100).toFixed(1)}% ${(eyeBbox.y / Math.max(1 - eyeBbox.h, 0.01) * 100).toFixed(1)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Score row helper ───────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex justify-between border-b border-stone-200 py-1.5 text-sm dark:border-zinc-700">
      <span className="text-stone-500 dark:text-zinc-400">{label}</span>
      <span className="font-mono text-stone-900 dark:text-zinc-100">{value}</span>
    </div>
  );
}

// ── Filmstrip thumb ────────────────────────────────────────────────────────

function Thumb({
  image, stars, active, onClick,
}: { image: PhotoImage; stars?: number; active: boolean; onClick: () => void }): React.JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [active]);

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`relative shrink-0 overflow-hidden rounded border-2 transition-all ${
        active ? 'border-amber-400 shadow-md shadow-amber-400/30' : 'border-transparent opacity-60 hover:opacity-90'
      }`}
      style={{ width: 80, height: 80 }}
    >
      {image.previewPath ? (
        <img src={mediaUrl(image.previewPath)} alt={image.name}
          className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-stone-200 flex items-center justify-center dark:bg-zinc-800">
          <span className="text-stone-400 text-xs dark:text-zinc-600">…</span>
        </div>
      )}
      {stars !== undefined && (
        <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-[9px] text-amber-300 leading-4">
          {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
        </span>
      )}
      {image.eyeStatus?.badExpression && (
        <span className="absolute top-0.5 right-0.5 rounded-sm bg-rose-600 px-0.5 text-[8px] text-white">!</span>
      )}
      {image.burstGroup && image.burstRank !== 1 && (
        <span className="absolute top-0.5 left-0.5 rounded-sm bg-slate-600 px-0.5 text-[8px] text-white">B</span>
      )}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function SplitView({ images, filteredImages, getSuggested }: {
  images: PhotoImage[];        // full list for updateImage
  filteredImages: PhotoImage[]; // currently visible (post-filter)
  getSuggested: (img: PhotoImage) => number | undefined;
}): React.JSX.Element {
  const setManualStars = useImageStore((s) => s.setManualStars);

  const [idx, setIdx] = useState(0);
  const clampedIdx    = Math.min(idx, Math.max(0, filteredImages.length - 1));
  const image         = filteredImages[clampedIdx];

  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIdx((i) => Math.min(filteredImages.length - 1, i + 1)), [filteredImages.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prev, next]);

  if (!image) {
    return (
      <div className="flex flex-1 items-center justify-center text-stone-400 dark:text-zinc-500">
        No images to show.
      </div>
    );
  }

  const stars      = image.manualStars ?? getSuggested(image);
  const isDerived  = image.manualStars === undefined;
  const eye        = image.eyeStatus;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Top: preview + sidebar ─────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Large preview */}
        <div className="relative flex flex-1 items-center justify-center bg-stone-100 dark:bg-black">
          {image.previewPath ? (
            <img
              src={mediaUrl(image.previewPath)}
              alt={image.name}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-stone-400 dark:text-zinc-600">Loading preview…</span>
          )}

          {/* Arrow buttons */}
          <button onClick={prev} disabled={clampedIdx === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white hover:bg-black/70 disabled:opacity-20 text-lg">
            ‹
          </button>
          <button onClick={next} disabled={clampedIdx === filteredImages.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white hover:bg-black/70 disabled:opacity-20 text-lg">
            ›
          </button>

          {/* Position counter */}
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-zinc-200">
            {clampedIdx + 1} / {filteredImages.length}
          </span>
        </div>

        {/* Right sidebar */}
        <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-stone-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-800">
          <h2 className="break-all text-sm font-semibold text-stone-900 dark:text-zinc-100">{image.name}</h2>

          {/* Face zoom + eye inset */}
          {image.previewPath && eye && eye.faceBbox && (
            <div>
              <p className="mb-1.5 text-xs uppercase tracking-wide text-stone-400 dark:text-zinc-500">Face</p>
              <FaceZoom
                previewPath={image.previewPath}
                faceBbox={eye.faceBbox}
                eyeBbox={eye.eyeBbox}
                allEyesOpen={eye.allEyesOpen}
              />
            </div>
          )}

          {/* Star rating */}
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-stone-400 dark:text-zinc-500">
              Rating {isDerived ? '(suggested)' : '(manual)'}
            </p>
            <StarRating
              value={stars}
              derived={isDerived}
              size="lg"
              onChange={(n) => setManualStars(image.path, n === 0 ? null : n)}
            />
            {!isDerived && (
              <button onClick={() => setManualStars(image.path, null)}
                className="mt-1 text-xs text-stone-500 hover:text-stone-700 dark:text-zinc-400 dark:hover:text-zinc-200">
                Reset to suggestion
              </button>
            )}
          </div>

          {/* Scores */}
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-stone-400 dark:text-zinc-500">Scores</p>
            <Row label="Sharpness" value={image.sharpnessScore !== undefined ? String(Math.round(image.sharpnessScore)) : '—'} />
            <Row label="Exposure"  value={image.exposureScore  !== undefined ? `${Math.round(image.exposureScore)} (${image.exposureHint ?? 'ok'})` : '—'} />
            <Row label="Aesthetics" value={image.aestheticsScore !== undefined ? `${image.aestheticsScore.toFixed(1)} / 10` : '—'} />
            <Row label="Suggested" value={image.derivedStars !== undefined ? `${image.derivedStars}★` : '—'} />
          </div>

          {/* Face / expression */}
          {eye && (
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-stone-400 dark:text-zinc-500">Face</p>
              {eye.facesDetected === 0 ? (
                <p className="text-xs text-stone-400 dark:text-zinc-500">No faces detected</p>
              ) : (
                <>
                  <Row label="Faces" value={String(eye.facesDetected)} />
                  <Row label="Eyes"  value={eye.allEyesOpen ? 'open ✓' : 'CLOSED ✗'} />
                  {eye.smileScore !== undefined && (
                    <Row label="Smile" value={`${Math.round(eye.smileScore * 100)}%`} />
                  )}
                  {eye.mouthOpen !== undefined && (
                    <Row label="Mouth" value={eye.mouthOpen ? 'open ✗' : 'closed ✓'} />
                  )}
                  {eye.headTiltDeg !== undefined && (
                    <Row label="Tilt" value={`${eye.headTiltDeg.toFixed(1)}°${Math.abs(eye.headTiltDeg) > 25 ? ' ✗' : ' ✓'}`} />
                  )}
                  {eye.badExpression && (
                    <p className="mt-1 rounded bg-rose-100 px-2 py-1 text-xs text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">
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
              <p className="mb-1 text-xs uppercase tracking-wide text-stone-400 dark:text-zinc-500">Burst</p>
              <Row label="Shots" value={`${images.filter((i) => i.burstGroup === image.burstGroup).length} in burst`} />
              <Row label="Rank"  value={image.burstRank === 1 ? '#1 (best)' : `#${image.burstRank ?? '?'}`} />
            </div>
          )}
        </div>
      </div>

      {/* ── Filmstrip ───────────────────────────────────────────────── */}
      <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-stone-200 bg-stone-100/60 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        {filteredImages.map((img, i) => (
          <Thumb
            key={img.path}
            image={img}
            stars={img.manualStars ?? getSuggested(img)}
            active={i === clampedIdx}
            onClick={() => setIdx(i)}
          />
        ))}
      </div>
    </div>
  );
}
