import React from 'react';

export interface AnomalyState {
  enabled: boolean;
  type: 'band' | 'threshold';
  window: number;
  k: number;
}

interface AnomalyToggleProps {
  state: AnomalyState;
  onChange: (state: AnomalyState) => void;
}

export default function AnomalyToggle({
  state,
  onChange
}: AnomalyToggleProps) {
  const handleToggle = (enabled: boolean) => {
    onChange({ ...state, enabled });
  };

  const handleTypeChange = (type: 'band' | 'threshold') => {
    onChange({ ...state, type });
  };

  const handleWindowChange = (window: number) => {
    onChange({ ...state, window });
  };

  const handleKChange = (k: number) => {
    onChange({ ...state, k });
  };

  return (
    <div className="bg-white p-4 rounded border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Anomaly Detection</h3>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={state.enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">Enable</span>
        </label>
      </div>
      
      {state.enabled && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Type</label>
            <select
              value={state.type}
              onChange={(e) => handleTypeChange(e.target.value as 'band' | 'threshold')}
              className="w-full text-sm border rounded px-2 py-1"
            >
              <option value="band">Band (rolling window)</option>
              <option value="threshold">Threshold</option>
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-medium mb-1">
              Window Size: {state.window}
            </label>
            <input
              type="range"
              min="5"
              max="100"
              value={state.window}
              onChange={(e) => handleWindowChange(parseInt(e.target.value))}
              className="w-full"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium mb-1">
              Sensitivity (k): {state.k}
            </label>
            <input
              type="range"
              min="1"
              max="5"
              step="0.5"
              value={state.k}
              onChange={(e) => handleKChange(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          
          <div className="text-xs text-gray-500">
            {state.type === 'band' 
              ? `Detects values outside ${state.k}× standard deviation from ${state.window}-point rolling mean`
              : `Detects values above ${state.k}× threshold`
            }
          </div>
        </div>
      )}
    </div>
  );
}
