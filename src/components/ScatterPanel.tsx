// src/components/ScatterPanel.tsx
import React, { useEffect } from 'react';
import * as vg from '@uwdata/vgplot';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { createOrReplaceView } from '@/lib/duck';
import type { ScatterState } from '@/components/ScatterControls';

export default function ScatterPanel({
  db, table, state, crossFilterName = 'cf',
  width = 960, height = 260, maxDots = 200_000
}: {
  db: AsyncDuckDB;
  table: string;
  state: ScatterState;
  crossFilterName?: string;
  width?: number;
  height?: number;
  maxDots?: number;
}) {
  useEffect(() => {
    const { x, y, color, size, shape, heatmap } = state;

    // Build base selection (we rely on Mosaic to inject crossFilter predicates down to the view)
    const limitClause = heatmap ? '' : `LIMIT ${maxDots}`;

    const sqlDots = `
      SELECT
        ${x} AS x,
        ${y} AS y,
        ${color ? color : 'NULL'} AS color,
        ${size ? size : 'NULL'} AS sz,
        ${shape ? shape : 'NULL'} AS shp
      FROM ${table}
      WHERE x IS NOT NULL AND y IS NOT NULL
      ${limitClause};
    `;

    const sqlBins = `
      WITH ext AS (
        SELECT
          MIN(${x}) AS xmin, MAX(${x}) AS xmax,
          MIN(${y}) AS ymin, MAX(${y}) AS ymax
        FROM ${table}
      ),
      bins AS (
        SELECT
          width_bucket(${x}, xmin, xmax, 80) AS bx,
          width_bucket(${y}, ymin, ymax, 80) AS by,
          COUNT(*) AS c
        FROM ${table}, ext
        WHERE ${x} IS NOT NULL AND ${y} IS NOT NULL
        GROUP BY 1,2
      )
      SELECT bx, by, c FROM bins;
    `;

    createOrReplaceView(db, 'scatter_dots', sqlDots);
    createOrReplaceView(db, 'scatter_bins', sqlBins);
  }, [db, table, state]);

  useEffect(() => {
    const { color, size, shape, heatmap } = state;

    const plot = heatmap
      ? vg.plot(
          vg.heatmap(vg.from('scatter_bins'), { x: 'bx', y: 'by', fill: 'c' }),
          vg.intervalXY({ as: crossFilterName }),
          vg.width(width),
          vg.height(height),
          vg.margins(24, 28, 28, 18),
        )
      : vg.plot(
          vg.dot(vg.from('scatter_dots'), {
            x: 'x',
            y: 'y',
            fill: color ? 'color' : undefined,
            r: size ? { channel: 'sz', range: [2, 6] } : 3,
            symbol: shape ? 'shp' : undefined,
            tip: true
          }),
          vg.intervalXY({ as: crossFilterName }),
          vg.highlight({ of: crossFilterName }),
          color ? vg.colorLegend() : undefined,
          vg.width(width),
          vg.height(height),
          vg.margins(24, 28, 28, 18)
        );

    const el = document.getElementById('scatter-panel');
    if (el) el.replaceChildren(plot);
    return () => plot?.remove?.();
  }, [state, width, height, crossFilterName]);

  return <div id="scatter-panel" className="rounded border bg-white" />;
}