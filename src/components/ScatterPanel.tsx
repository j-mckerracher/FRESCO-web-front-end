import React from 'react';
import * as vg from '@uwdata/vgplot';
import { ScatterState } from './ScatterControls';

interface ScatterPanelProps {
  db: any;
  table: string;
  state: ScatterState;
  width: number;
  height: number;
  crossFilterName: string;
}

export default function ScatterPanel({
  db,
  table,
  state,
  width,
  height,
  crossFilterName
}: ScatterPanelProps) {
  React.useEffect(() => {
    if (!db || !state.x || !state.y) return;

    const mark = state.heatmap 
      ? vg.rect(
          vg.from(table),
          { 
            x: vg.bin(state.x, { maxbins: 50 }),
            y: vg.bin(state.y, { maxbins: 50 }),
            fill: vg.count(),
            fillOpacity: 0.8
          }
        )
      : vg.dot(
          vg.from(table),
          { 
            x: state.x,
            y: state.y,
            fill: state.color || undefined,
            size: state.size || undefined,
            shape: state.shape || undefined,
            fillOpacity: 0.7
          }
        );

    const plot = vg.plot(
      mark,
      {
        width,
        height,
        x: { grid: true },
        y: { grid: true },
        color: state.color ? { domain: 'auto' } : undefined,
        marks: [
          vg.ruleY([0], { stroke: '#999', strokeOpacity: 0.5 }),
          vg.ruleX([0], { stroke: '#999', strokeOpacity: 0.5 })
        ]
      }
    );

    const container = document.getElementById('scatter-panel');
    if (container) {
      container.innerHTML = '';
      container.appendChild(plot);
    }
  }, [db, table, state, width, height]);

  return (
    <div className="bg-white border rounded p-4">
      <div id="scatter-panel" style={{ width, height }} />
    </div>
  );
}
