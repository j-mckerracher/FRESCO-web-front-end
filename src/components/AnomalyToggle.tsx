// src/components/AnomalyToggle.tsx
import React from 'react';

export type AnomalyState = {
  enabled: boolean;
  type: 'band' | 'percentile';
  window: number;   // rolling window in points (post-aggregation)
  k: number;        // stddev multiplier for band
};

export default function AnomalyToggle({
  state, onChange
}: { state: AnomalyState; onChange(s: AnomalyState): void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Anomaly Aid</div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.enabled}
            onChange={e => onChange({ ...state, enabled: e.target.checked })}
          />
          Enabled
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <label className="col-span-1 flex items-center gap-2">
          <input
            type="radio"
            checked={state.type === 'band'}
            onChange={() => onChange({ ...state, type: 'band' })}
          />
          mean ± k·σ
        </label>
        <label className="col-span-2 flex items-center gap-2">
          <input
            type="radio"
            checked={state.type === 'percentile'}
            onChange={() => onChange({ ...state, type: 'percentile' })}
          />
          p10–p90
        </label>

        <label className="col-span-2 flex items-center gap-2">
          Window
          <input
            type="number"
            min={5}
            className="w-20 border rounded px-2 py-1"
            value={state.window}
            onChange={e => onChange({ ...state, window: Number(e.target.value) })}
          />
        </label>
        <label className="col-span-1 flex items-center gap-2">
          k
          <input
            type="number"
            step={0.5}
            className="w-20 border rounded px-2 py-1"
            value={state.k}
            onChange={e => onChange({ ...state, k: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}