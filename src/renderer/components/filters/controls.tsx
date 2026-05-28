import React from 'react';

/** Toggleable pill button. */
export function Chip({ active, onClick, title, children }: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded px-2 py-0.5 transition-colors ${
        active
          ? 'bg-amber-500 text-stone-900'
          : 'bg-white shadow-sm hover:bg-stone-50 dark:bg-zinc-800 dark:hover:bg-zinc-700'
      }`}
    >
      {children}
    </button>
  );
}

/** Checkbox + label. */
export function Toggle({ checked, onChange, title, children }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-center gap-1.5" title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-amber-500"
      />
      <span>{children}</span>
    </label>
  );
}

/** Single-select segmented control. */
export function SegmentedControl<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
}): React.JSX.Element {
  return (
    <div className="flex overflow-hidden rounded shadow-sm">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          title={o.title}
          className={`px-2 py-0.5 transition-colors ${
            value === o.value
              ? 'bg-amber-500 text-stone-900'
              : 'bg-white hover:bg-stone-50 dark:bg-zinc-800 dark:hover:bg-zinc-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Labelled cluster of controls. */
export function FilterGroup({ label, children }: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="text-stone-400 dark:text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

export function Divider(): React.JSX.Element {
  return <div className="h-4 w-px bg-stone-300 dark:bg-zinc-700" />;
}
