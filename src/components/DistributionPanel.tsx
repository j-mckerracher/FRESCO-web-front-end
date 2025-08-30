import React from 'react';
import * as vg from '@uwdata/vgplot';

interface DistributionPanelProps {
  db: any;
  table: string;
  metric: string;
  width: number;
  height: number;
  crossFilterName: string;
}

export default function DistributionPanel({
  db,
  table,
  metric,
  width,
  height,
  crossFilterName
}: DistributionPanelProps) {
  React.useEffect(() => {
    if (!db || !metric) return;

    const plot = vg.plot(
      vg.rectY(
        vg.from(table),
        { 
          x: vg.bin(metric, { maxbins: 50 }),
          y: vg.count(),
          fill: 'steelblue',
          fillOpacity: 0.8
        }
      ),
      {
        width,
        height,
        x: { grid: true, title: metric },
        y: { grid: true, title: 'Count' },
        marks: [
          vg.ruleY([0], { stroke: '#999', strokeOpacity: 0.5 })
        ]
      }
    );

    const container = document.getElementById('distribution-panel');
    if (container) {
      container.innerHTML = '';
      container.appendChild(plot);
    }
  }, [db, table, metric, width, height]);

  return (
    <div className="bg-white border rounded p-4">
      <div id="distribution-panel" style={{ width, height }} />
    </div>
  );
}
