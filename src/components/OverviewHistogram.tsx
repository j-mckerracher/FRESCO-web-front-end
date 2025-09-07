// src/components/OverviewHistogram.tsx
import React, { useEffect } from 'react';
import * as vg from '@uwdata/vgplot';
import { timeResolution, truncExpr } from '@/lib/duck';
import { useDebouncedQuery, useSelectionHash, useCacheInvalidation } from '@/hooks/useDebouncedQuery';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';

export default function OverviewHistogram({
  db, table, start, end, width = 960, height = 120, crossFilterName = 'cf'
}: {
  db: AsyncDuckDB;
  table: string;     // base view/table name (already filtered to selected clusters, etc.)
  start: Date;
  end: Date;
  width?: number;
  height?: number;
  crossFilterName?: string; // the Mosaic selection id you've created
}) {
  // Get selection hash for cache invalidation
  const selectionHash = useSelectionHash(null); // We'll connect this to actual crossfilter state later
  useCacheInvalidation(selectionHash);

  // Progressive resolution: choose appropriate time bucketing
  const res = timeResolution(start, end);
  const tcol = truncExpr(res, 'time');

  const sql = `
    WITH binned AS (
      SELECT ${tcol} AS t_bin, COUNT(*) AS c
      FROM ${table}
      GROUP BY 1
    )
    SELECT * FROM binned ORDER BY t_bin;
  `;

  // Use debounced query with 200ms delay for selection/zoom changes
  useDebouncedQuery(
    db,
    'overview_hist',
    sql,
    [table, start, end], // Dependencies that trigger re-query
    {}, // No additional params
    selectionHash,
    200 // 200ms debounce
  );

  useEffect(() => {
    const plot = vg.plot(
      vg.rectY(vg.from('overview_hist'), { x: 't_bin', y: 'c' }),
      vg.xDomain(vg.Fixed),
      vg.intervalX({ as: crossFilterName }),
      vg.panZoomX({ as: crossFilterName }),
      vg.width(width),
      vg.height(height),
      vg.margins(24, 8, 18, 8)
    );
    const el = document.getElementById('overview-hist');
    if (el) {
      el.replaceChildren(plot);
    }
    return () => plot?.remove?.();
  }, [start, end, width, height, crossFilterName]);

  return <div id="overview-hist" className="rounded border bg-white" />;
}