import React from 'react';
import type { PhotoImage } from '../../shared/types';
import { effectiveStars } from '../../shared/types';
import { mediaUrl } from '../../shared/ipc';
import { useImageStore } from '../store/imageStore';
import { StarRating } from './StarRating';

function Metric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex justify-between border-b border-stone-200 py-2 text-sm dark:border-zinc-700">
      <span className="text-stone-500 dark:text-zinc-400">{label}</span>
      <span className="text-stone-900 dark:text-zinc-100">{value}</span>
    </div>
  );
}

export function DetailView({ image, onClose }: { image: PhotoImage; onClose: () => void }): React.JSX.Element {
  const setManualStars = useImageStore((s) => s.setManualStars);
  const stars = effectiveStars(image);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-1 items-center justify-center bg-black p-4">
          {image.previewPath ? (
            <img src={mediaUrl(image.previewPath)} alt={image.name} className="max-h-[80vh] max-w-full object-contain" />
          ) : (
            <span className="text-zinc-500">No preview</span>
          )}
        </div>

        <div className="flex w-80 shrink-0 flex-col gap-4 p-6 text-stone-900 dark:text-zinc-100">
          <div className="flex items-start justify-between">
            <h2 className="break-all text-sm font-semibold">{image.name}</h2>
            <button onClick={onClose} className="ml-2 shrink-0 rounded px-2 text-stone-400 hover:bg-stone-100 dark:text-zinc-400 dark:hover:bg-zinc-700">
              ✕
            </button>
          </div>

          <div>
            <p className="mb-1 text-xs uppercase text-stone-500 dark:text-zinc-400">
              Rating {image.manualStars !== undefined ? '(manual)' : '(suggested)'}
            </p>
            <StarRating
              value={stars}
              derived={image.manualStars === undefined}
              size="lg"
              onChange={(n) => setManualStars(image.path, n === 0 ? null : n)}
            />
            {image.manualStars !== undefined && (
              <button onClick={() => setManualStars(image.path, null)} className="mt-1 text-xs text-stone-500 hover:text-stone-700 dark:text-zinc-400 dark:hover:text-zinc-200">
                Reset to suggestion
              </button>
            )}
          </div>

          <div>
            <Metric label="Type" value={image.type.toUpperCase()} />
            <Metric label="Sharpness" value={image.sharpnessScore !== undefined ? String(Math.round(image.sharpnessScore)) : '—'} />
            <Metric
              label="Exposure"
              value={
                image.exposureScore !== undefined
                  ? `${Math.round(image.exposureScore)} (${image.exposureHint ?? 'ok'})`
                  : '—'
              }
            />
            <Metric
              label="Aesthetics"
              value={image.aestheticsScore !== undefined ? `${image.aestheticsScore.toFixed(1)} / 10` : '—'}
            />
            <Metric
              label="Eyes"
              value={
                image.eyeStatus === undefined
                  ? '—'
                  : image.eyeStatus.facesDetected === 0
                  ? 'no faces'
                  : image.eyeStatus.allEyesOpen
                  ? `open (${image.eyeStatus.facesDetected})`
                  : `closed (${image.eyeStatus.facesDetected})`
              }
            />
            {image.eyeStatus && image.eyeStatus.facesDetected > 0 && (
              <>
                <Metric
                  label="Smile"
                  value={image.eyeStatus.smileScore !== undefined
                    ? `${Math.round(image.eyeStatus.smileScore * 100)}%`
                    : '—'}
                />
                <Metric
                  label="Mouth"
                  value={image.eyeStatus.mouthOpen === undefined ? '—' : image.eyeStatus.mouthOpen ? 'open' : 'closed'}
                />
                <Metric
                  label="Head tilt"
                  value={image.eyeStatus.headTiltDeg !== undefined
                    ? `${image.eyeStatus.headTiltDeg.toFixed(1)}°`
                    : '—'}
                />
              </>
            )}
            {image.burstGroup && (
              <Metric
                label="Burst"
                value={`group ${image.burstGroup} · rank ${image.burstRank ?? '?'}`}
              />
            )}
            <Metric label="Suggested" value={image.derivedStars !== undefined ? `${image.derivedStars}★` : '—'} />
            <Metric label="Written" value={image.written ? 'yes' : 'no'} />
          </div>
        </div>
      </div>
    </div>
  );
}
