import React from 'react';

export function Logo({ size = 32 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ps-bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="0.55" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="ps-star" x1="256" y1="120" x2="256" y2="392" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#fff7ed" />
        </linearGradient>
      </defs>

      <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#ps-bg)" />

      <circle cx="256" cy="256" r="172" fill="none" stroke="#ffffff" strokeOpacity="0.30" strokeWidth="14" />
      <g stroke="#ffffff" strokeOpacity="0.55" strokeWidth="14" strokeLinecap="round">
        <line x1="256" y1="84" x2="256" y2="138" />
        <line x1="411.9" y1="170" x2="365.2" y2="197" />
        <line x1="411.9" y1="342" x2="365.2" y2="315" />
        <line x1="256" y1="428" x2="256" y2="374" />
        <line x1="100.1" y1="342" x2="146.8" y2="315" />
        <line x1="100.1" y1="170" x2="146.8" y2="197" />
      </g>

      <path
        fill="url(#ps-star)"
        d="M256 106 L292.4 205.8 L398.7 209.6 L315 275.2 L344.2 377.4 L256 318 L167.8 377.4 L197 275.2 L113.3 209.6 L219.6 205.8 Z"
      />
    </svg>
  );
}
