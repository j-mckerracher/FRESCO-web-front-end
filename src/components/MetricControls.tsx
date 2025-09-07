// src/components/MetricControls.tsx
import React from 'react';

export type MetricControlsProps = {
  allMetrics: string[];
  selected: string[];
  onChange(selected: string[]): void;
};

export default function MetricControls({ allMetrics, selected, onChange }: MetricControlsProps) {
  return (
    <div className="space-y-2">
      <div className="font-semibold">Metrics</div>
      <div className="grid grid-cols-2 gap-1 max-h-48 overflow-auto p-2 rounded border">
        {allMetrics.map(m => {
          const checked = selected.includes(m);
          return (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={e => {
                  if (e.target.checked) onChange([...selected, m]);
                  else onChange(selected.filter(x => x !== m));
                }}
              />
              <span>{m}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}