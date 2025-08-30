import React from 'react';

export interface ScatterState {
  x: string;
  y: string;
  color: string;
  size: string | undefined;
  shape: string | undefined;
  heatmap: boolean;
}

interface ScatterControlsProps {
  numericFields: string[];
  categoricalFields: string[];
  state: ScatterState;
  onChange: (state: ScatterState) => void;
}

export default function ScatterControls({
  numericFields,
  categoricalFields,
  state,
  onChange
}: ScatterControlsProps) {
  const handleFieldChange = (field: keyof ScatterState, value: string | undefined | boolean) => {
    onChange({ ...state, [field]: value });
  };

  return (
    <div className="bg-white p-4 rounded border">
      <h3 className="text-sm font-semibold mb-3">Scatter Plot Controls</h3>
      
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">X Axis</label>
          <select
            value={state.x}
            onChange={(e) => handleFieldChange('x', e.target.value)}
            className="w-full text-sm border rounded px-2 py-1"
          >
            {numericFields.map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-xs font-medium mb-1">Y Axis</label>
          <select
            value={state.y}
            onChange={(e) => handleFieldChange('y', e.target.value)}
            className="w-full text-sm border rounded px-2 py-1"
          >
            {numericFields.map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-xs font-medium mb-1">Color By</label>
          <select
            value={state.color}
            onChange={(e) => handleFieldChange('color', e.target.value)}
            className="w-full text-sm border rounded px-2 py-1"
          >
            <option value="">None</option>
            {categoricalFields.map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-xs font-medium mb-1">Size By</label>
          <select
            value={state.size || ''}
            onChange={(e) => handleFieldChange('size', e.target.value || undefined)}
            className="w-full text-sm border rounded px-2 py-1"
          >
            <option value="">None</option>
            {numericFields.map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-xs font-medium mb-1">Shape By</label>
          <select
            value={state.shape || ''}
            onChange={(e) => handleFieldChange('shape', e.target.value || undefined)}
            className="w-full text-sm border rounded px-2 py-1"
          >
            <option value="">None</option>
            {categoricalFields.map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={state.heatmap}
              onChange={(e) => handleFieldChange('heatmap', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show as heatmap</span>
          </label>
        </div>
      </div>
    </div>
  );
}
