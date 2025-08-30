import React from 'react';

interface MetricControlsProps {
  allMetrics: string[];
  selected: string[];
  onChange: (metrics: string[]) => void;
}

export default function MetricControls({
  allMetrics,
  selected,
  onChange
}: MetricControlsProps) {
  const handleMetricToggle = (metric: string) => {
    if (selected.includes(metric)) {
      onChange(selected.filter(m => m !== metric));
    } else {
      onChange([...selected, metric]);
    }
  };

  const handleSelectAll = () => {
    onChange([...allMetrics]);
  };

  const handleSelectNone = () => {
    onChange([]);
  };

  return (
    <div className="bg-white p-4 rounded border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Metrics</h3>
        <div className="flex gap-1">
          <button
            onClick={handleSelectAll}
            className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded"
          >
            All
          </button>
          <button
            onClick={handleSelectNone}
            className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded"
          >
            None
          </button>
        </div>
      </div>
      
      <div className="space-y-2">
        {allMetrics.map((metric) => (
          <label key={metric} className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={selected.includes(metric)}
              onChange={() => handleMetricToggle(metric)}
              className="rounded"
            />
            <span className="text-sm">{metric}</span>
          </label>
        ))}
      </div>
      
      <div className="text-xs text-gray-500 mt-2">
        {selected.length} of {allMetrics.length} selected
      </div>
    </div>
  );
}
