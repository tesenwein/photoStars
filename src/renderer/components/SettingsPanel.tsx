import React from 'react';
import { useScoringStore } from '../store/scoringStore';
import { MIN_SAMPLES, type LearnedModel } from '../../shared/learning';
import { relearnAndApply } from '../lib/relearn';

function Slider({
  label, value, min, max, step = 0.01, format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}): React.JSX.Element {
  const display = format ? format(value) : value.toFixed(2);
  return (
    <label className="flex flex-col gap-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-stone-600 dark:text-zinc-400">{label}</span>
        <span className="font-mono text-stone-900 dark:text-zinc-100">{display}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-amber-500"
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 dark:text-zinc-500">{title}</p>
      {children}
    </div>
  );
}

/** "Learn from my ratings": reads the persisted corrections, fits a personalised
 * model, and applies it to the active scoring config. Fully transparent — shows
 * how many samples it learned from and how well it reproduces the user's picks. */
function LearningSection(): React.JSX.Element {
  const learnedModel = useScoringStore((s) => s.learnedModel);
  const [status, setStatus] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<LearnedModel | null>(null);

  const learn = React.useCallback(async () => {
    setBusy(true);
    setStatus(null);
    try {
      const model = await relearnAndApply();
      setPreview(model);
      if (!model.weightsPersonalised && !model.portraitWeightsPersonalised) {
        setStatus(
          `Only ${model.sampleCount} rating${model.sampleCount === 1 ? '' : 's'} so far — ` +
            `need ${MIN_SAMPLES} per type before personalising. Keep culling!`
        );
        return;
      }
      const agree =
        model.burstAgreement !== undefined
          ? ` · matches ${Math.round(model.burstAgreement * 100)}% of your burst picks`
          : '';
      setStatus(`Applied — learned from ${model.sampleCount} ratings${agree}.`);
    } catch {
      setStatus('Could not read the rating history.');
    } finally {
      setBusy(false);
    }
  }, []);

  const shown = preview ?? learnedModel;

  return (
    <Section title="Learn from my ratings">
      <p className="text-[10px] text-stone-400 dark:text-zinc-500">
        Fits the weights above to the star ratings you actually give, gradually personalising
        as you cull more. Regularised toward the defaults, so it never swings wildly.
      </p>
      {shown && (
        <div className="rounded-md bg-stone-100 px-3 py-2 text-[11px] dark:bg-zinc-800">
          <div className="flex justify-between text-stone-600 dark:text-zinc-400">
            <span>Samples</span>
            <span className="font-mono text-stone-900 dark:text-zinc-100">
              {shown.sampleCount} ({shown.portraitSampleCount} portrait)
            </span>
          </div>
          <div className="mt-1 flex justify-between text-stone-600 dark:text-zinc-400">
            <span>Learned weights</span>
            <span className="font-mono text-stone-900 dark:text-zinc-100">
              {`${(shown.weights.sharpness * 100).toFixed(0)}/${(shown.weights.exposure * 100).toFixed(0)}/${(shown.weights.aesthetics * 100).toFixed(0)}`}
            </span>
          </div>
          {shown.burstAgreement !== undefined && (
            <div className="mt-1 flex justify-between text-stone-600 dark:text-zinc-400">
              <span>Burst-pick agreement</span>
              <span className="font-mono text-stone-900 dark:text-zinc-100">
                {Math.round(shown.burstAgreement * 100)}%
              </span>
            </div>
          )}
        </div>
      )}
      <button
        onClick={learn}
        disabled={busy}
        className="w-full rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {busy ? 'Learning…' : 'Learn from my ratings'}
      </button>
      {status && <p className="text-[10px] text-stone-500 dark:text-zinc-400">{status}</p>}
    </Section>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { config, setWeights, setPortraitWeights, setConfig, setHardCaps, setSharpnessRange, reset } =
    useScoringStore();

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-stone-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-zinc-100">Scoring Settings</h2>
        <button
          onClick={onClose}
          className="text-stone-400 hover:text-stone-700 dark:text-zinc-500 dark:hover:text-zinc-200"
          aria-label="Close settings"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

        <LearningSection />

        <Section title="General weights">
          <Slider label="Sharpness"  value={config.weights.sharpness}  min={0} max={1}
            onChange={(v) => setWeights({ sharpness: v })} />
          <Slider label="Exposure"   value={config.weights.exposure}   min={0} max={1}
            onChange={(v) => setWeights({ exposure: v })} />
          <Slider label="Aesthetics" value={config.weights.aesthetics} min={0} max={1}
            onChange={(v) => setWeights({ aesthetics: v })} />
          <p className="text-[10px] text-stone-400 dark:text-zinc-500">
            Weights are auto-normalised — only the ratios matter.
          </p>
        </Section>

        <Section title="Portrait weights">
          <Slider label="Sharpness"  value={config.portraitWeights.sharpness}  min={0} max={1}
            onChange={(v) => setPortraitWeights({ sharpness: v })} />
          <Slider label="Exposure"   value={config.portraitWeights.exposure}   min={0} max={1}
            onChange={(v) => setPortraitWeights({ exposure: v })} />
          <Slider label="Aesthetics" value={config.portraitWeights.aesthetics} min={0} max={1}
            onChange={(v) => setPortraitWeights({ aesthetics: v })} />
        </Section>

        <Section title="Portrait — face region">
          <Slider
            label="Face vs whole sharpness blend"
            value={config.faceBlend} min={0} max={1}
            format={(v) => `${Math.round(v * 100)}% face`}
            onChange={(v) => setConfig({ faceBlend: v })}
          />
          <Slider
            label="Bokeh bonus max"
            value={config.bokehBonusMax} min={0} max={0.2}
            format={(v) => `+${(v * 100).toFixed(1)}%`}
            onChange={(v) => setConfig({ bokehBonusMax: v })}
          />
        </Section>

        <Section title="Quality curve">
          <Slider
            label="Quality power"
            value={config.qualityPower} min={0.5} max={4} step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => setConfig({ qualityPower: v })}
          />
          <p className="text-[10px] text-stone-400 dark:text-zinc-500">
            Higher = harder to reach 4–5★; lower = more images rated highly.
          </p>
        </Section>

        <Section title="Sharpness normalization">
          <Slider
            label="Floor (blurry)"
            value={config.sharpness.floor} min={0} max={200} step={1}
            format={(v) => String(Math.round(v))}
            onChange={(v) => setSharpnessRange({ floor: v })}
          />
          <Slider
            label="Ceiling (sharp)"
            value={config.sharpness.ceil} min={100} max={2000} step={10}
            format={(v) => String(Math.round(v))}
            onChange={(v) => setSharpnessRange({ ceil: v })}
          />
        </Section>

        <Section title="Hard caps">
          <Slider
            label="Blurry variance threshold"
            value={config.hardCaps.blurryVariance} min={0} max={200} step={1}
            format={(v) => String(Math.round(v))}
            onChange={(v) => setHardCaps({ blurryVariance: v })}
          />
          <Slider
            label="Blurry max stars"
            value={config.hardCaps.blurryMaxStars} min={0} max={5} step={1}
            format={(v) => `${Math.round(v)}★`}
            onChange={(v) => setHardCaps({ blurryMaxStars: Math.round(v) })}
          />
          <Slider
            label="Closed-eyes penalty"
            value={config.hardCaps.closedEyesPenalty} min={0} max={3} step={1}
            format={(v) => `-${Math.round(v)}★`}
            onChange={(v) => setHardCaps({ closedEyesPenalty: Math.round(v) })}
          />
        </Section>
      </div>

      <div className="border-t border-stone-200 px-5 py-3 dark:border-zinc-700">
        <button
          onClick={reset}
          className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Reset to defaults
        </button>
        <p className="mt-1.5 text-center text-[10px] text-stone-400 dark:text-zinc-500">
          Settings saved automatically
        </p>
      </div>
    </div>
  );
}
