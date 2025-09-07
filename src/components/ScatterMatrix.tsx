// src/components/ScatterMatrix.tsx
import React, { useEffect } from 'react';
import * as vg from '@uwdata/vgplot';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { useDebouncedQuery, useSelectionHash, useCacheInvalidation } from '@/hooks/useDebouncedQuery';

export default function ScatterMatrix({
  db, table, metrics, crossFilterName = 'cf',
  cellSize = 180, maxDots = 5000
}: {
  db: AsyncDuckDB;
  table: string;
  metrics: string[];
  crossFilterName?: string;
  cellSize?: number;
  maxDots?: number;
}) {
  // Get selection hash for cache invalidation
  const selectionHash = useSelectionHash(null);
  useCacheInvalidation(selectionHash);

  // Create data views for scatter plots (lower triangle) and heatmaps (upper triangle)
  useEffect(() => {
    if (!db || metrics.length < 2) return;

    // For each pair of metrics, create appropriate data views
    metrics.forEach((xMetric, i) => {
      metrics.forEach((yMetric, j) => {
        if (i === j) return; // Skip diagonal
        
        const viewName = `scatter_matrix_${i}_${j}`;
        
        if (i > j) {
          // Lower triangle: scatter plot data (sampled for performance)
          const sql = `
            SELECT 
              ${xMetric} AS x,
              ${yMetric} AS y
            FROM ${table}
            WHERE ${xMetric} IS NOT NULL AND ${yMetric} IS NOT NULL
            LIMIT ${maxDots};
          `;
          
          useDebouncedQuery(
            db,
            viewName,
            sql,
            [table, xMetric, yMetric, maxDots],
            {},
            selectionHash,
            200
          );
        } else {
          // Upper triangle: heatmap bins
          const sql = `
            WITH ext AS (
              SELECT
                MIN(${xMetric}) AS xmin, MAX(${xMetric}) AS xmax,
                MIN(${yMetric}) AS ymin, MAX(${yMetric}) AS ymax
              FROM ${table}
            ),
            bins AS (
              SELECT
                width_bucket(${xMetric}, xmin, xmax, 20) AS bx,
                width_bucket(${yMetric}, ymin, ymax, 20) AS by,
                COUNT(*) AS c
              FROM ${table}, ext
              WHERE ${xMetric} IS NOT NULL AND ${yMetric} IS NOT NULL
              GROUP BY 1, 2
            )
            SELECT bx, by, c FROM bins;
          `;
          
          useDebouncedQuery(
            db,
            viewName,
            sql,
            [table, xMetric, yMetric],
            {},
            selectionHash,
            200
          );
        }
      });
    });
  }, [db, table, metrics, maxDots, selectionHash]);

  useEffect(() => {
    if (metrics.length < 2) {
      const el = document.getElementById('scatter-matrix');
      if (el) el.replaceChildren();
      return;
    }

    // Build grid of scatter plots and heatmaps
    const rows: any[] = [];
    
    for (let j = 0; j < metrics.length; j++) {
      const cells: any[] = [];
      
      for (let i = 0; i < metrics.length; i++) {
        const xMetric = metrics[i];
        const yMetric = metrics[j];
        
        if (i === j) {
          // Diagonal: metric name labels
          cells.push(
            vg.plot(
              vg.text([{label: xMetric}], {
                x: () => 0.5,
                y: () => 0.5,
                text: 'label',
                fontSize: 12,
                textAnchor: 'middle'
              }),
              vg.width(cellSize),
              vg.height(cellSize),
              vg.margins(8, 8, 8, 8),
              vg.xDomain([0, 1]),
              vg.yDomain([0, 1])
            )
          );
        } else if (i > j) {
          // Lower triangle: scatter plots
          const viewName = `scatter_matrix_${i}_${j}`;
          cells.push(
            vg.plot(
              vg.dot(vg.from(viewName), {
                x: 'x',
                y: 'y',
                r: 2,
                fillOpacity: 0.6,
                tip: true
              }),
              vg.intervalXY({ as: crossFilterName }),
              vg.highlight({ of: crossFilterName }),
              vg.width(cellSize),
              vg.height(cellSize),
              vg.margins(20, 8, 8, 20),
              // Add axis labels only on edges
              ...(j === metrics.length - 1 ? [vg.xLabel(xMetric)] : []),
              ...(i === 0 ? [vg.yLabel(yMetric)] : [])
            )
          );
        } else {
          // Upper triangle: heatmaps
          const viewName = `scatter_matrix_${i}_${j}`;
          cells.push(
            vg.plot(
              vg.heatmap(vg.from(viewName), {
                x: 'bx',
                y: 'by',
                fill: 'c'
              }),
              vg.intervalXY({ as: crossFilterName }),
              vg.highlight({ of: crossFilterName }),
              vg.width(cellSize),
              vg.height(cellSize),
              vg.margins(20, 8, 8, 20),
              // Add axis labels only on edges
              ...(j === 0 ? [vg.xLabel(xMetric)] : []),
              ...(i === metrics.length - 1 ? [vg.yLabel(yMetric)] : [])
            )
          );
        }
      }
      
      rows.push(vg.hconcat(...cells));
    }

    const matrix = vg.vconcat(...rows);
    const el = document.getElementById('scatter-matrix');
    if (el) el.replaceChildren(matrix);
    
    return () => matrix?.remove?.();
  }, [metrics, cellSize, crossFilterName]);

  if (metrics.length < 2) {
    return (
      <div id="scatter-matrix" className="rounded border bg-white p-8 text-center text-gray-500">
        Select at least 2 metrics to show scatter matrix
      </div>
    );
  }

  return <div id="scatter-matrix" className="rounded border bg-white overflow-auto" />;
}