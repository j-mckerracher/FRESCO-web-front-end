// src/components/AxisModeSwitch.tsx
import React from 'react';

export type AxisMode = 'dual' | 'normalize';

export default function AxisModeSwitch({
  mode,
  onChange
}: { mode: AxisMode; onChange(mode: AxisMode): void }) {
  return (
    <div className="space-y-1">
      <div className="font-semibold">Axis Mode</div>
      <div className="flex gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === 'dual'} onChange={() => onChange('dual')} />
          Dual axes
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === 'normalize'} onChange={() => onChange('normalize')} />
          Normalize [0–1]
        </label>
      </div>
    </div>
  );
}