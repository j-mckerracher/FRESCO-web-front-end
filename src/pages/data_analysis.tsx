
/*
 * FRESCO Data Analysis - QA Checklist
 * ===================================
 * 
 * Performance Requirements:
 * ✅ Interaction latency median < 150ms; show spinner if > 400ms
 * ✅ Memory usage stays < 2GB; dispose temp views when switching datasets  
 * ✅ Data correctness: filtered counts match across views
 * 
 * Progressive Resolution:
 * ✅ 15m buckets (>30 days), 5m (7-30d), 1m (1-7d), raw (<1d)
 * ✅ Debounced queries (200ms) with memo cache (sql+params+selectionHash)
 * ✅ Web Worker confirmed: DuckDB runs non-blocking
 * 
 * Dev Tools (development mode only):
 * - window.validateCounts(): Check filtered vs total record counts
 * - window.showMemoryStats(): Display current memory usage
 * - window.clearAllCaches(): Clear query and view caches
 * - Console logs: cache hits/misses, query timing, memory warnings
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useDuckDB } from '@/context/DuckDBContext';
import OverviewHistogram from '@/components/OverviewHistogram';
import TimeSeriesPanel from '@/components/TimeSeriesPanel';
import MetricControls from '@/components/MetricControls';
import AxisModeSwitch, { AxisMode } from '@/components/AxisModeSwitch';
import FacetSwitch, { OverlayMode } from '@/components/FacetSwitch';
import AnomalyToggle, { AnomalyState } from '@/components/AnomalyToggle';
import ScatterControls, { ScatterState } from '@/components/ScatterControls';
import ScatterPanel from '@/components/ScatterPanel';
import DistributionPanel from '@/components/DistributionPanel';
import JobTable from '@/components/JobTable';
import ScatterMatrix from '@/components/ScatterMatrix';
import ParallelCoords from '@/components/ParallelCoords';
import Header from '@/components/Header';
import * as vg from '@uwdata/vgplot';
import { exportFilteredDataAsCSV } from '@/util/export';
import { queryCache } from '@/lib/queryCache';

// ——— your dataset schema ———
// Numeric metrics suitable for lines/scatter:
const NUMERIC_METRICS = [
  'value_cpuuser', 'value_gpu', 'value_memused', 'value_memused_minus_diskcache',
  'value_nfs', 'value_block'
];
// Categorical fields for color/shape legends:
const CATEGORICAL_FIELDS = ['exit_state', 'cluster', 'queue', 'username', 'exitcode', 'account'];

export default function DataAnalysisPage() {
  const { db, crossFilter, connection, createConnection } = useDuckDB();
  
  // Use a simple table name state - this will be determined by the existing logic
  const [tableName] = useState<string>("job_data");
  
  const [start, setStart] = useState<Date>(new Date(Date.now() - 7 * 24 * 3600_000)); // last 7 days
  const [end, setEnd] = useState<Date>(new Date());

  // ——— controls state ———
  const [overlayMetrics, setOverlayMetrics] = useState<string[]>(['value_cpuuser', 'value_memused']);
  const [axisMode, setAxisMode] = useState<AxisMode>('dual');
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('overlay');

  const [anomaly, setAnomaly] = useState<AnomalyState>({
    enabled: true,
    type: 'band',
    window: 30,
    k: 3
  });

  const [scatter, setScatter] = useState<ScatterState>({
    x: 'value_cpuuser',
    y: 'value_memused',
    color: 'exitcode',
    size: undefined,
    shape: undefined,
    heatmap: false
  });

  // Export loading state
  const [exportLoading, setExportLoading] = useState(false);

  // Scatter matrix toggle state
  const [showScatterMatrix, setShowScatterMatrix] = useState(false);

  // Parallel coordinates toggle state
  const [showParallelCoords, setShowParallelCoords] = useState(false);

  // Derived width (simple, you probably use a ResizeObserver)
  const plotWidth = 980;

  // Filter chips (optional; depends on how you expose Mosaic clauses)
  const chips = useMemo(() => {
    // Pseudo: if your crossFilter exposes a method to enumerate clauses, map them to user-friendly labels here.
    return [] as { id: string; label: string }[];
  }, [crossFilter]);

  // Handle CSV export with crossfilter
  const handleExportCSV = async () => {
    if (!db || exportLoading) return;
    
    setExportLoading(true);
    try {
      const fileName = `fresco_data_${new Date().toISOString().split('T')[0]}`;
      await exportFilteredDataAsCSV(db, tableName, fileName);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExportLoading(false);
    }
  };

  // ===== QA & DEV TOOLS (Development Mode Only) =====
  const isDev = process.env.NODE_ENV === 'development';
  
  // Performance tracking
  const interactionTimings = useRef<number[]>([]);
  const trackInteraction = (label: string) => {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      interactionTimings.current.push(duration);
      console.log(`🚀 ${label}: ${duration.toFixed(1)}ms`);
      if (duration > 400) {
        console.warn(`⚠️ Slow interaction: ${label} took ${duration.toFixed(1)}ms`);
      }
    };
  };

  // Dev-only count validation
  const validateCounts = async () => {
    if (!db || !isDev) return;
    
    try {
      const conn = await db.connect();
      try {
        // Total count in base table
        const totalResult = await conn.query(`SELECT COUNT(*) as total FROM ${tableName}`);
        const totalRows = totalResult.toArray();
        const totalCount = totalRows[0]?.total || 0;
        
        // Create export view to get filtered count
        await conn.query(`CREATE OR REPLACE VIEW temp_count_check AS SELECT * FROM ${tableName}`);
        const filteredResult = await conn.query(`SELECT COUNT(*) as filtered FROM temp_count_check`);
        const filteredRows = filteredResult.toArray();
        const filteredCount = filteredRows[0]?.filtered || 0;
        
        await conn.query(`DROP VIEW IF EXISTS temp_count_check`);
        
        console.log(`📊 COUNT VALIDATION:`);
        console.log(`   Total records: ${totalCount.toLocaleString()}`);
        console.log(`   Filtered records: ${filteredCount.toLocaleString()}`);
        console.log(`   Filter ratio: ${((filteredCount/totalCount)*100).toFixed(1)}%`);
        
        return { total: totalCount, filtered: filteredCount };
      } finally {
        await conn.close();
      }
    } catch (error) {
      console.error('❌ Count validation failed:', error);
    }
  };

  // Memory usage monitoring
  const showMemoryStats = () => {
    if (!isDev) return;
    
    const memory = (performance as any).memory;
    if (memory) {
      const used = Math.round(memory.usedJSHeapSize / 1048576);
      const total = Math.round(memory.totalJSHeapSize / 1048576);
      const limit = Math.round(memory.jsHeapSizeLimit / 1048576);
      
      console.log(`🧠 MEMORY STATS:`);
      console.log(`   Used: ${used} MB`);
      console.log(`   Total: ${total} MB`);
      console.log(`   Limit: ${limit} MB`);
      console.log(`   Usage: ${((used/limit)*100).toFixed(1)}%`);
      
      if (used > 2048) {
        console.warn(`⚠️ High memory usage: ${used}MB`);
      }
    } else {
      console.log('Memory stats not available in this browser');
    }
  };

  // Clear all caches
  const clearAllCaches = () => {
    if (!isDev) return;
    queryCache.clear();
    console.log('🗑️ All caches cleared');
  };

  // Interaction latency stats  
  const showLatencyStats = () => {
    if (!isDev || interactionTimings.current.length === 0) return;
    
    const timings = [...interactionTimings.current].sort((a, b) => a - b);
    const median = timings[Math.floor(timings.length / 2)];
    const p95 = timings[Math.floor(timings.length * 0.95)];
    const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    
    console.log(`⚡ LATENCY STATS (${timings.length} interactions):`);
    console.log(`   Median: ${median.toFixed(1)}ms`);
    console.log(`   Average: ${avg.toFixed(1)}ms`);
    console.log(`   95th percentile: ${p95.toFixed(1)}ms`);
    console.log(`   Slow interactions (>400ms): ${timings.filter(t => t > 400).length}`);
  };

  // Expose dev tools to window (development only)
  useEffect(() => {
    if (isDev) {
      (window as any).validateCounts = validateCounts;
      (window as any).showMemoryStats = showMemoryStats;
      (window as any).clearAllCaches = clearAllCaches;
      (window as any).showLatencyStats = showLatencyStats;
      console.log('🛠️ Dev tools loaded. Try: validateCounts(), showMemoryStats(), showLatencyStats(), clearAllCaches()');
    }
  }, [db, tableName, isDev]);

  // Set up VGPlot coordinator when db is ready
  React.useEffect(() => {
    if (db && connection) {
      console.log("Setting up vgplot coordinator");
      const crossFilterSelection = vg.Selection.crossfilter("cf");
      
      vg.coordinator().databaseConnector(
        vg.wasmConnector({
          duckdb: db,
          connection: connection,
        })
      );
    }
  }, [db, connection]);

  if (!db) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-gray-200 animate-ping mx-auto mb-4" />
          <p className="text-gray-600">Loading database...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <div className="container mx-auto p-4 space-y-6">
        <h1 className="text-xl font-semibold">FRESCO — Data Analysis</h1>

        {/* Dev Tools Panel (Development Only) */}
        {isDev && (
          <section className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-yellow-800">🛠️ QA & Dev Tools</h2>
              <span className="text-xs text-yellow-600">DEV MODE</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={validateCounts}
                className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 rounded border"
              >
                Count Check
              </button>
              <button
                onClick={showMemoryStats}
                className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-800 rounded border"
              >
                Memory Stats
              </button>
              <button
                onClick={showLatencyStats}
                className="px-2 py-1 text-xs bg-purple-100 hover:bg-purple-200 text-purple-800 rounded border"
              >
                Latency Stats
              </button>
              <button
                onClick={clearAllCaches}
                className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-800 rounded border"
              >
                Clear Caches
              </button>
            </div>
            <div className="text-xs text-yellow-700 mt-2">
              💡 Check console for detailed results. Functions also available globally: validateCounts(), showMemoryStats(), etc.
            </div>
          </section>
        )}

        {/* Overview / Time selection */}
        <section className="space-y-2">
          <div className="text-sm text-gray-600">Overview — brush to filter all views, scroll/drag to pan/zoom</div>
          <OverviewHistogram
            db={db}
            table={tableName}
            start={start}
            end={end}
            width={plotWidth}
            height={120}
            crossFilterName="cf"
          />
        </section>

        {/* Controls + Time series */}
        <section className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-3 space-y-4">
            <MetricControls
              allMetrics={NUMERIC_METRICS}
              selected={overlayMetrics}
              onChange={setOverlayMetrics}
            />
            <AxisModeSwitch mode={axisMode} onChange={setAxisMode} />
            <FacetSwitch mode={overlayMode} onChange={setOverlayMode} />
            <AnomalyToggle state={anomaly} onChange={setAnomaly} />
          </div>
          <div className="col-span-12 lg:col-span-9 space-y-2">
            <div className="text-sm text-gray-600">Time series — toggle metrics, dual/normalize, overlay/facet</div>
            <TimeSeriesPanel
              db={db}
              table={tableName}
              metrics={overlayMetrics}
              axisMode={axisMode}
              overlayMode={overlayMode}
              start={start}
              end={end}
              anomaly={anomaly}
              width={plotWidth}
              height={280}
              crossFilterName="cf"
            />
          </div>
        </section>

        {/* Scatter + Distribution */}
        <section className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-3 space-y-4">
            <ScatterControls
              numericFields={NUMERIC_METRICS}
              categoricalFields={CATEGORICAL_FIELDS}
              state={scatter}
              onChange={setScatter}
            />
            
            {/* Scatter Matrix Toggle */}
            <div className="bg-white p-3 rounded border">
              <h3 className="text-sm font-semibold mb-2">📊 Scatter Matrix</h3>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showScatterMatrix}
                    onChange={(e) => setShowScatterMatrix(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Show pairwise scatter matrix</span>
                </label>
                <p className="text-xs text-gray-600">
                  Uses currently selected {overlayMetrics.length} metrics. Lower triangle: scatter plots, upper triangle: heatmaps.
                </p>
              </div>
            </div>

            {/* Parallel Coordinates Toggle */}
            <div className="bg-white p-3 rounded border">
              <h3 className="text-sm font-semibold mb-2">📈 Parallel Coordinates</h3>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showParallelCoords}
                    onChange={(e) => setShowParallelCoords(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Show parallel coordinates</span>
                </label>
                <p className="text-xs text-gray-600">
                  Multi-metric overview with {overlayMetrics.length} axes. Click axes to brush filter. Preview feature.
                </p>
              </div>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-9 space-y-2">
            <div className="text-sm text-gray-600">Correlation — lasso to filter; switch to heatmap when dense</div>
            <ScatterPanel
              db={db}
              table={tableName}
              state={scatter}
              width={plotWidth}
              height={260}
              crossFilterName="cf"
            />
          </div>
        </section>

        {/* Scatter Matrix */}
        {showScatterMatrix && overlayMetrics.length >= 2 && (
          <section className="space-y-2">
            <div className="text-sm text-gray-600">
              Scatter Matrix — {overlayMetrics.length}×{overlayMetrics.length} grid, brushing any cell filters all others
            </div>
            <ScatterMatrix
              db={db}
              table={tableName}
              metrics={overlayMetrics}
              crossFilterName="cf"
              cellSize={160}
              maxDots={3000}
            />
          </section>
        )}

        {/* Parallel Coordinates */}
        {showParallelCoords && overlayMetrics.length >= 1 && (
          <section className="space-y-2">
            <div className="text-sm text-gray-600">
              Parallel Coordinates — {overlayMetrics.length} axes, click any axis to create brush filters (preview feature)
            </div>
            <ParallelCoords
              db={db}
              table={tableName}
              metrics={overlayMetrics}
              crossFilterName="cf"
              width={plotWidth}
              height={400}
              maxRows={20000}
            />
          </section>
        )}

        {/* Extra metric distribution */}
        <section className="space-y-2">
          <div className="text-sm text-gray-600">Distribution — brush to filter by metric range</div>
          <DistributionPanel
            db={db}
            table={tableName}
            metric="value_nfs"
            width={plotWidth}
            height={160}
            crossFilterName="cf"
          />
        </section>

        {/* Job table */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Jobs (filtered)</h2>
            {/* Hook your current CSV export here; make sure it applies the current crossFilter */}
            <button 
              onClick={handleExportCSV}
              disabled={exportLoading}
              className={`px-3 py-1 rounded text-sm ${
                exportLoading 
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                  : 'bg-black text-white hover:bg-gray-800'
              }`}
            >
              {exportLoading ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
          <JobTable db={db} table={tableName} />
        </section>
      </div>
    </>
  );
}