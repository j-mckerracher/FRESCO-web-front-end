import React from 'react';

export type OverlayMode = 'overlay' | 'facet';

interface FacetSwitchProps {
  mode: OverlayMode;
  onChange: (mode: OverlayMode) => void;
}

export default function FacetSwitch({
  mode,
  onChange
}: FacetSwitchProps) {
  return (
    <div className="bg-white p-4 rounded border">
      <h3 className="text-sm font-semibold mb-3">Display Mode</h3>
      
      <div className="space-y-2">
        <label className="flex items-center space-x-2">
          <input
            type="radio"
            name="overlayMode"
            value="overlay"
            checked={mode === 'overlay'}
            onChange={(e) => onChange(e.target.value as OverlayMode)}
            className="rounded"
          />
          <span className="text-sm">Overlay</span>
        </label>
        
        <label className="flex items-center space-x-2">
          <input
            type="radio"
            name="overlayMode"
            value="facet"
            checked={mode === 'facet'}
            onChange={(e) => onChange(e.target.value as OverlayMode)}
            className="rounded"
          />
          <span className="text-sm">Faceted</span>
        </label>
      </div>
      
      <div className="text-xs text-gray-500 mt-2">
        {mode === 'overlay' 
          ? 'All metrics displayed on the same chart' 
          : 'Each metric displayed in a separate subplot'
        }
      </div>
    </div>
  );
}
