import React from 'react';

export type AxisMode = 'dual' | 'normalize';

interface AxisModeSwitchProps {
  mode: AxisMode;
  onChange: (mode: AxisMode) => void;
}

export default function AxisModeSwitch({
  mode,
  onChange
}: AxisModeSwitchProps) {
  return (
    <div className="bg-white p-4 rounded border">
      <h3 className="text-sm font-semibold mb-3">Axis Mode</h3>
      
      <div className="space-y-2">
        <label className="flex items-center space-x-2">
          <input
            type="radio"
            name="axisMode"
            value="dual"
            checked={mode === 'dual'}
            onChange={(e) => onChange(e.target.value as AxisMode)}
            className="rounded"
          />
          <span className="text-sm">Dual Y-axis</span>
        </label>
        
        <label className="flex items-center space-x-2">
          <input
            type="radio"
            name="axisMode"
            value="normalize"
            checked={mode === 'normalize'}
            onChange={(e) => onChange(e.target.value as AxisMode)}
            className="rounded"
          />
          <span className="text-sm">Normalized (0-1)</span>
        </label>
      </div>
      
      <div className="text-xs text-gray-500 mt-2">
        {mode === 'dual' 
          ? 'Each metric uses its own Y-axis scale' 
          : 'All metrics are normalized to 0-1 range for comparison'
        }
      </div>
    </div>
  );
}
