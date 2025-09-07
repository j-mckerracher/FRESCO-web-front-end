// src/components/DistributionPanel.tsx
import React, { useEffect } from 'react';
import * as vg from '@uwdata/vgplot';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { createOrReplaceView } from '@/lib/duck';

export default function DistributionPanel({
  db, table, metric, bins = 60, crossFilterName = 'cf',
  width = 960, height = 160
}: {
  db: AsyncDuckDB;
  table: string;
  metric: string;
  bins?: number;
  crossFilterName?: string;
  width?: number;
  height?: number;
}) {
  useEffect(() => {
    if (!metric) return;

    const sql = `
      WITH ext AS (
        SELECT MIN(${metric}) AS lo, MAX(${metric}) AS hi FROM ${table}
      ),
      hist AS (
        SELECT width_bucket(${metric}, lo, hi, ${bins}) AS b, COUNT(*) AS c
        FROM ${table}, ext
        WHERE ${metric} IS NOT NULL
        GROUP BY 1
      )
      SELECT b, c FROM hist ORDER BY b;
    `;
    createOrReplaceView(db, 'metric_hist', sql);
  }, [db, table, metric, bins]);

  useEffect(() => {
    if (!metric) return;
    const p = vg.plot(
      vg.barY(vg.from('metric_hist'), { x: 'b', y: 'c' }),
      vg.intervalX({ as: crossFilterName }),
      vg.width(width),
      vg.height(height),
      vg.margins(24, 16, 18, 8),
    );
    const el = document.getElementById('dist-panel');
    if (el) el.replaceChildren(p);
    return () => p?.remove?.();
  }, [metric, width, height, crossFilterName]);

  return <div id="dist-panel" className="rounded border bg-white" />;
}