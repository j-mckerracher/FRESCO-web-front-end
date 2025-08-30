import React from 'react';
import * as vg from '@uwdata/vgplot';

interface ParallelCoordsProps {
  db: any;
  table: string;
  metrics: string[];
  crossFilterName: string;
  width: number;
  height: number;
  maxRows: number;
}

export default function ParallelCoords({
  db,
  table,
  metrics,
  crossFilterName,
  width,
  height,
  maxRows
}: ParallelCoordsProps) {
  React.useEffect(() => {
    if (!db || metrics.length === 0) return;

    // For parallel coordinates, we'll create a simple line chart for now
    // since vg.cross and vg.value are not available
    const plot = vg.plot(
      vg.lineY(
        vg.from(table, { limit: maxRows }),
        { 
          x: metrics[0] || 'timestamp',
          y: metrics[1] || 'value_cpuuser',
          stroke: 'steelblue',
          strokeOpacity: 0.3,
          strokeWidth: 1
        }
      ),
      {
        width,
        height,
        x: { 
          grid: true,
          type: 'linear'
        },
        y: { grid: true },
        marks: [
          vg.ruleY([0], { stroke: '#999', strokeOpacity: 0.5 })
        ]
      }
    );

    const container = document.getElementById('parallel-coords');
    if (container) {
      container.innerHTML = '';
      container.appendChild(plot);
    }
  }, [db, table, metrics, width, height, maxRows]);

  if (metrics.length === 0) {
    return (
      <div className="bg-white border rounded p-4">
        <div className="text-center text-gray-500">
          No metrics selected for parallel coordinates
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded p-4">
      <div id="parallel-coords" style={{ width, height }} />
    </div>
  );
}
