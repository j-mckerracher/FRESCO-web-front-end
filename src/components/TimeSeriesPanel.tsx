// src/components/TimeSeriesPanel.tsx
import React, { useEffect, useState, useMemo } from 'react';
import * as vg from '@uwdata/vgplot';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { timeResolution, truncExpr } from '@/lib/duck';
import { useDebouncedQuery, useSelectionHash, useCacheInvalidation } from '@/hooks/useDebouncedQuery';
import type { AxisMode } from '@/components/AxisModeSwitch';
import type { OverlayMode } from '@/components/FacetSwitch';
import type { AnomalyState } from '@/components/AnomalyToggle';

function normExpr(mode: AxisMode, col: string) {
  if (mode === 'normalize') {
    return `( ${col} - MIN(${col}) OVER () ) / NULLIF(MAX(${col}) OVER () - MIN(${col}) OVER (), 0)`;
  }
  return col;
}

export default function TimeSeriesPanel({
  db, table, metrics, axisMode, overlayMode,
  start, end, anomaly, crossFilterName = 'cf',
  width = 960, height = 260
}: {
  db: AsyncDuckDB;
  table: string;
  metrics: string[];
  axisMode: AxisMode;
  overlayMode: OverlayMode;
  start: Date;
  end: Date;
  anomaly: AnomalyState;
  crossFilterName?: string;
  width?: number;
  height?: number;
}) {
  // Get selection hash for cache invalidation
  const selectionHash = useSelectionHash(null); // We'll connect this to actual crossfilter state later
  useCacheInvalidation(selectionHash);

  // Correlation state (for 2 metrics)
  const [correlation, setCorrelation] = useState<number | null>(null);
  const [lagMinutes, setLagMinutes] = useState<number>(0);
  const [correlationLoading, setCorrelationLoading] = useState(false);

  // Progressive resolution: choose appropriate time bucketing
  const res = timeResolution(start, end);
  const tcol = truncExpr(res, 'time');

  // Build SELECT list with chosen metrics (aggregated by bucket)
  const aggCols = metrics.map(m => `AVG(${m}) AS ${m}`).join(',\n       ');
  const baseSQL = `
    WITH s AS (
      SELECT ${tcol} AS t_bin,
             ${aggCols}
      FROM ${table}
      GROUP BY 1
    )
    SELECT * FROM s ORDER BY t_bin;
  `;

  // Use debounced query for main time series data
  useDebouncedQuery(
    db,
    'ts_overlay',
    metrics.length ? baseSQL : 'SELECT NULL WHERE 1=0', // Empty query when no metrics
    [table, metrics, start, end], // Dependencies
    {},
    selectionHash,
    200 // 200ms debounce
  );

  // Anomaly detection query (separate debounced query)
  const anomalySQL = (anomaly.enabled && metrics.length === 1) ? (() => {
    const m = metrics[0];
    const y = axisMode === 'normalize' ? `v_norm` : `v`;
    return `
      WITH base AS (
        SELECT t_bin, AVG(${m}) AS v
        FROM ${table}
        GROUP BY 1
      ),
      roll AS (
        SELECT
          t_bin, v,
          (v - MIN(v) OVER ()) / NULLIF(MAX(v) OVER () - MIN(v) OVER (),0) AS v_norm,
          AVG(${y}) OVER (ORDER BY t_bin ROWS BETWEEN ${anomaly.window} PRECEDING AND CURRENT ROW) AS mu,
          STDDEV_SAMP(${y}) OVER (ORDER BY t_bin ROWS BETWEEN ${anomaly.window} PRECEDING AND CURRENT ROW) AS sd,
          QUANTILE_CONT(0.1) WITHIN GROUP (ORDER BY ${y}) OVER (ORDER BY t_bin ROWS BETWEEN ${anomaly.window} PRECEDING AND CURRENT ROW) AS p10,
          QUANTILE_CONT(0.9) WITHIN GROUP (ORDER BY ${y}) OVER (ORDER BY t_bin ROWS BETWEEN ${anomaly.window} PRECEDING AND CURRENT ROW) AS p90
        FROM base
      )
      SELECT
        t_bin, ${y} AS v, mu, sd,
        (mu - ${anomaly.k}*sd) AS lo, (mu + ${anomaly.k}*sd) AS hi, p10, p90
      FROM roll
      ORDER BY t_bin;
    `;
  })() : 'SELECT NULL WHERE 1=0';

  useDebouncedQuery(
    db,
    'ts_anomaly',
    anomalySQL,
    [table, metrics, axisMode, anomaly, start, end], // Dependencies
    {},
    selectionHash,
    200 // 200ms debounce
  );

  // Correlation computation (when exactly 2 metrics are selected)
  useEffect(() => {
    if (metrics.length !== 2 || !db) {
      setCorrelation(null);
      return;
    }

    const computeCorrelation = async () => {
      setCorrelationLoading(true);
      try {
        const conn = await db.connect();
        try {
          const [metricA, metricB] = metrics;
          
          // Build correlation query with optional lag
          const lagExpression = lagMinutes !== 0 
            ? `time + INTERVAL '${lagMinutes} minutes'` 
            : 'time';
            
          const correlationSQL = `
            WITH base_data AS (
              SELECT 
                ${tcol} AS t_bin,
                AVG(${metricA}) AS metric_a,
                AVG(${metricB}) AS metric_b
              FROM ${table}
              GROUP BY 1
            ),
            lagged_data AS (
              SELECT 
                a.t_bin,
                a.metric_a,
                b.metric_b AS metric_b_lagged
              FROM base_data a
              LEFT JOIN base_data b ON b.t_bin = a.t_bin + INTERVAL '${lagMinutes} minutes'
              WHERE a.metric_a IS NOT NULL AND b.metric_b IS NOT NULL
            )
            SELECT CORR(metric_a, metric_b_lagged) AS correlation
            FROM lagged_data;
          `;

          console.log(`📊 Computing correlation between ${metricA} and ${metricB} (lag: ${lagMinutes}min)`);
          const result = await conn.query(correlationSQL);
          const rows = result.toArray();
          const corrValue = rows[0]?.correlation;
          
          setCorrelation(corrValue !== null ? Number(corrValue) : null);
          console.log(`📊 Correlation: ${corrValue?.toFixed(3) || 'N/A'}`);
          
        } finally {
          await conn.close();
        }
      } catch (error) {
        console.error('Error computing correlation:', error);
        setCorrelation(null);
      } finally {
        setCorrelationLoading(false);
      }
    };

    // Debounce correlation computation
    const timer = setTimeout(computeCorrelation, 300);
    return () => clearTimeout(timer);
    
  }, [db, metrics, lagMinutes, table, tcol, selectionHash]);

  useEffect(() => {
    if (!metrics.length) {
      const el = document.getElementById('ts-panel');
      if (el) el.replaceChildren();
      return;
    }

    const layers: any[] = [];
    if (overlayMode === 'overlay') {
      for (const m of metrics) {
        layers.push(
          vg.lineY(vg.from('ts_overlay'), {
            x: 't_bin',
            y: (_, i, d) => normExpr(axisMode, m),
            stroke: m,
            tip: true
          })
        );
      }
      if (anomaly.enabled && metrics.length === 1) {
        const bandY = anomaly.type === 'band' ? ['lo', 'hi'] : ['p10', 'p90'];
        layers.push(
          vg.areaY(vg.from('ts_anomaly'), { x: 't_bin', y1: bandY[0], y2: bandY[1], fillOpacity: 0.15 })
        );
        layers.push(
          vg.lineY(vg.from('ts_anomaly'), { x: 't_bin', y: 'v', stroke: metrics[0], strokeWidth: 1.5 })
        );
      }

      const plot = vg.plot(
        ...layers,
        vg.xDomain(vg.Fixed),
        vg.intervalX({ as: crossFilterName }),
        vg.panZoomX({ as: crossFilterName }),
        vg.colorLegend(),
        vg.width(width),
        vg.height(height),
        vg.margins(28, 36, 28, 12)
      );
      const el = document.getElementById('ts-panel');
      if (el) el.replaceChildren(plot);
      return () => plot?.remove?.();
    } else {
      // Small multiples
      const charts = metrics.map(m =>
        vg.plot(
          vg.lineY(vg.from('ts_overlay'), {
            x: 't_bin',
            y: (_, i, d) => normExpr(axisMode, m),
            stroke: '#444'
          }),
          vg.xDomain(vg.Fixed),
          vg.intervalX({ as: crossFilterName }),
          vg.panZoomX({ as: crossFilterName }),
          vg.width(width),
          vg.height(Math.max(180, Math.floor(height * 0.65))),
          vg.margins(24, 36, 18, 12)
        )
      );

      const vcat = vg.vconcat(...charts);
      const el = document.getElementById('ts-panel');
      if (el) el.replaceChildren(vcat);
      return () => vcat?.remove?.();
    }
  }, [metrics, axisMode, overlayMode, anomaly, width, height, crossFilterName]);

  return (
    <div className="space-y-2">
      {/* Correlation Controls (when exactly 2 metrics) */}
      {metrics.length === 2 && (
        <div className="flex items-center justify-between gap-4 p-3 bg-blue-50 rounded border border-blue-200">
          <div className="flex items-center gap-4">
            {/* Correlation Badge */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-blue-800">Correlation:</span>
              <div className={`px-2 py-1 rounded text-sm font-mono ${
                correlationLoading 
                  ? 'bg-gray-100 text-gray-500' 
                  : correlation !== null
                    ? Math.abs(correlation) > 0.7
                      ? 'bg-green-100 text-green-800 border border-green-300'
                      : Math.abs(correlation) > 0.4
                        ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                        : 'bg-gray-100 text-gray-600 border border-gray-300'
                    : 'bg-gray-100 text-gray-500'
              }`}>
                {correlationLoading ? '...' : correlation !== null ? correlation.toFixed(3) : 'N/A'}
              </div>
            </div>
            
            {/* Lag Slider */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-700">Lag {metrics[1]} by:</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="-60"
                  max="60"
                  step="5"
                  value={lagMinutes}
                  onChange={(e) => setLagMinutes(parseInt(e.target.value))}
                  className="w-24 h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm font-mono text-blue-800 min-w-[3rem]">
                  {lagMinutes > 0 ? `+${lagMinutes}` : lagMinutes}min
                </span>
              </div>
            </div>
          </div>
          
          <div className="text-xs text-blue-600">
            📊 Pearson r between {metrics[0]} and {metrics[1]}
            {lagMinutes !== 0 && ` (${lagMinutes > 0 ? 'lagged' : 'leading'} by ${Math.abs(lagMinutes)}min)`}
          </div>
        </div>
      )}
      
      {/* Main Chart */}
      <div id="ts-panel" className="rounded border bg-white" />
    </div>
  );
}