// src/components/ScatterControls.tsx
import React from 'react';

export type ScatterState = {
  x: string;
  y: string;
  color?: string;
  size?: string;
  shape?: string;
  heatmap: boolean;
};

export default function ScatterControls({
  numericFields,
  categoricalFields,
  state,
  onChange
}: {
  numericFields: string[];
  categoricalFields: string[];
  state: ScatterState;
  onChange(s: ScatterState): void;
}) {
  const set = (k: keyof ScatterState, v: any) => onChange({ ...state, [k]: v });

  return (
    <div className="space-y-2">
      <div className="font-semibold">Scatter</div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col">
          <span>X</span>
          <select value={state.x} onChange={e => set('x', e.target.value)} className="border rounded px-2 py-1">
            {numericFields.map(f => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label className="flex flex-col">
          <span>Y</span>
          <select value={state.y} onChange={e => set('y', e.target.value)} className="border rounded px-2 py-1">
            {numericFields.map(f => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label className="flex flex-col">
          <span>Color (categorical)</span>
          <select value={state.color ?? ''} onChange={e => set('color', e.target.value || undefined)} className="border rounded px-2 py-1">
            <option value="">(none)</option>
            {categoricalFields.map(f => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label className="flex flex-col">
          <span>Size (numeric)</span>
          <select value={state.size ?? ''} onChange={e => set('size', e.target.value || undefined)} className="border rounded px-2 py-1">
            <option value="">(none)</option>
            {numericFields.map(f => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 col-span-2">
          <input type="checkbox" checked={state.heatmap} onChange={e => set('heatmap', e.target.checked)} />
          Use heatmap (2D bins) when dense
        </label>
      </div>
    </div>
  );
}