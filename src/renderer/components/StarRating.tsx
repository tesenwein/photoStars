import React from 'react';

interface StarRatingProps {
  value?: number;
  /** When true, the value is a derived suggestion rather than a manual choice. */
  derived?: boolean;
  size?: 'sm' | 'lg';
  onChange?: (stars: number) => void;
}

export function StarRating({ value, derived, size = 'sm', onChange }: StarRatingProps): React.JSX.Element {
  const filled = value ?? 0;
  const interactive = !!onChange;
  const starClass = size === 'lg' ? 'text-2xl' : 'text-sm';

  return (
    <div className={`flex ${interactive ? 'cursor-pointer' : ''}`} role="radiogroup" aria-label="rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= filled;
        const color = on
          ? (derived ? 'text-amber-400/60' : 'text-amber-400')
          : 'text-stone-300 dark:text-zinc-600';
        return (
          <span
            key={n}
            className={`${starClass} ${color} ${interactive ? 'hover:text-amber-300' : ''}`}
            onClick={
              onChange
                ? (e) => {
                    e.stopPropagation();
                    onChange(n === filled ? 0 : n);
                  }
                : undefined
            }
            role={interactive ? 'radio' : undefined}
            aria-checked={interactive ? on : undefined}
          >
            ★
          </span>
        );
      })}
    </div>
  );
}
