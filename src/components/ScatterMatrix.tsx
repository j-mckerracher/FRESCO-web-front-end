import React from 'react';
import * as vg from '@uwdata/vgplot';

interface ScatterMatrixProps {
  db: any;
  table: string;
  metrics: string[];
  crossFilterName: string;
  cellSize: number;
  maxDots: number;
}

export default function ScatterMatrix({
  db,
  table,
  metrics,
  crossFilterName,
  cellSize,
  maxDots
}: ScatterMatrixProps) {
  React.useEffect(() => {
    if (!db || metrics.length < 2) return;

    const matrixSize = metrics.length;
    const totalWidth = matrixSize * cellSize;
    const totalHeight = matrixSize * cellSize;

    const plot = vg.plot(
      vg.frame({
        width: totalWidth,
        height: totalHeight,
        grid: true,
        columns: matrixSize,
        rows: matrixSize
      }),
      {
        width: totalWidth,
        height: totalHeight,
        marks: metrics.flatMap((yMetric, yIndex) =>
          metrics.map((xMetric, xIndex) => {
            if (xIndex === yIndex) {
              // Diagonal: histogram
              return vg.rectY(
                vg.from(table),
                { 
                  x: vg.bin(xMetric, { maxbins: 20 }),
                  y: vg.count(),
                  fill: 'steelblue',
                  fillOpacity: 0.6
                }
              );
            } else {
              // Off-diagonal: scatter plot
              return vg.dot(
                vg.from(table, { limit: maxDots }),
                { 
                  x: xMetric,
                  y: yMetric,
                  fill: 'steelblue',
                  fillOpacity: 0.5,
                  size: 3
                }
              );
            }
          })
        )
      }
    );

    const container = document.getElementById('scatter-matrix');
    if (container) {
      container.innerHTML = '';
      container.appendChild(plot);
    }
  }, [db, table, metrics, cellSize, maxDots]);

  if (metrics.length < 2) {
    return (
      <div className="bg-white border rounded p-4">
        <div className="text-center text-gray-500">
          Need at least 2 metrics for scatter matrix
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded p-4">
      <div id="scatter-matrix" />
    </div>
  );
}
