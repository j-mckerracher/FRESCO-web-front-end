// src/components/FacetSwitch.tsx
import React from 'react';

export type OverlayMode = 'overlay' | 'facet';

export default function FacetSwitch({
  mode,
  onChange
}: { mode: OverlayMode; onChange(mode: OverlayMode): void }) {
  return (
    <div className="space-y-1">
      <div className="font-semibold">Layout</div>
      <div className="flex gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === 'overlay'} onChange={() => onChange('overlay')} />
          Overlay
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === 'facet'} onChange={() => onChange('facet')} />
          Small multiples
        </label>
      </div>
    </div>
  );
}