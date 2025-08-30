import React from 'react';
import * as vg from '@uwdata/vgplot';

interface TimeSeriesPanelProps {
  db: any;
  table: string;
  metrics: string[];
  axisMode: 'dual' | 'normalize';
  overlayMode: 'overlay' | 'facet';
  start: Date;
  end: Date;
  anomaly: any;
  width: number;
  height: number;
  crossFilterName: string;
}

export default function TimeSeriesPanel({
  db,
  table,
  metrics,
  axisMode,
  overlayMode,
  start,
  end,
  anomaly,
  width,
  height,
  crossFilterName
}: TimeSeriesPanelProps) {
  React.useEffect(() => {
    if (!db || metrics.length === 0) return;

          const marks = metrics.map((metric, index) => {
        const colors = ['steelblue', 'red', 'green', 'orange', 'purple', 'brown'];
        const color = colors[index % colors.length];
        return vg.lineY(
          vg.from(table, { 
            filter: `timestamp >= '${start.toISOString()}' AND timestamp <= '${end.toISOString()}'` 
          }),
          { 
            x: 'timestamp',
            y: metric,
            stroke: color,
            strokeWidth: 2
          }
        );
      });

    const plot = vg.plot(
      marks,
      {
        width,
        height,
        x: { grid: true, type: 'time' },
        y: { grid: true },
        color: { domain: metrics },
        marks: [
          vg.ruleY([0], { stroke: '#999', strokeOpacity: 0.5 })
        ]
      }
    );

    const container = document.getElementById('time-series-panel');
    if (container) {
      container.innerHTML = '';
      container.appendChild(plot);
    }
  }, [db, table, metrics, axisMode, overlayMode, start, end, anomaly, width, height]);

  return (
    <div className="bg-white border rounded p-4">
      <div id="time-series-panel" style={{ width, height }} />
    </div>
  );
}
