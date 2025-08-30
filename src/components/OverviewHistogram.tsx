import React from 'react';
import * as vg from '@uwdata/vgplot';

interface OverviewHistogramProps {
  db: any;
  table: string;
  start: Date;
  end: Date;
  width: number;
  height: number;
  crossFilterName: string;
}

export default function OverviewHistogram({
  db,
  table,
  start,
  end,
  width,
  height,
  crossFilterName
}: OverviewHistogramProps) {
  React.useEffect(() => {
    if (!db) return;

    const plot = vg.plot(
      vg.rectY(
        vg.from(table, { 
          filter: `timestamp >= '${start.toISOString()}' AND timestamp <= '${end.toISOString()}'` 
        }),
        { 
          x: vg.bin('timestamp', { maxbins: 50 }),
          y: vg.count(),
          fill: 'steelblue',
          fillOpacity: 0.8
        }
      ),
      {
        width,
        height,
        x: { grid: true },
        y: { grid: true },
        marks: [
          vg.ruleY([0], { stroke: '#999', strokeOpacity: 0.5 })
        ]
      }
    );

    const container = document.getElementById('overview-histogram');
    if (container) {
      container.innerHTML = '';
      container.appendChild(plot);
    }
  }, [db, table, start, end, width, height]);

  return (
    <div className="bg-white border rounded p-4">
      <div id="overview-histogram" style={{ width, height }} />
    </div>
  );
}
