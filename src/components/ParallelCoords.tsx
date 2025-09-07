// src/components/ParallelCoords.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { useDebouncedQuery, useSelectionHash, useCacheInvalidation } from '@/hooks/useDebouncedQuery';

interface ParallelCoordsProps {
  db: AsyncDuckDB;
  table: string;
  metrics: string[];
  crossFilterName?: string;
  width?: number;
  height?: number;
  maxRows?: number;
}

interface DataPoint {
  [key: string]: number | null;
}

interface AxisBrush {
  min: number;
  max: number;
}

export default function ParallelCoords({
  db, table, metrics, crossFilterName = 'cf',
  width = 960, height = 400, maxRows = 20000
}: ParallelCoordsProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<DataPoint[]>([]);
  const [axisBrushes, setAxisBrushes] = useState<Map<string, AxisBrush>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  // Get selection hash for cache invalidation
  const selectionHash = useSelectionHash(null);
  useCacheInvalidation(selectionHash);

  // Fetch data with current metrics
  useEffect(() => {
    if (!db || metrics.length === 0) {
      setData([]);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const conn = await db.connect();
        try {
          // Build SELECT clause with null handling
          const selectCols = metrics.map(m => `${m}`).join(', ');
          const sql = `
            SELECT ${selectCols}
            FROM ${table}
            WHERE ${metrics.map(m => `${m} IS NOT NULL`).join(' AND ')}
            LIMIT ${maxRows};
          `;

          console.log(`📊 ParallelCoords: Fetching ${maxRows} rows for ${metrics.length} metrics`);
          const result = await conn.query(sql);
          const rows = result.toArray() as DataPoint[];
          
          console.log(`📊 ParallelCoords: Got ${rows.length} rows`);
          setData(rows);
        } finally {
          await conn.close();
        }
      } catch (error) {
        console.error('ParallelCoords: Error fetching data:', error);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [db, table, metrics, maxRows, selectionHash]);

  // Calculate scales for each metric
  const scales = useMemo(() => {
    if (data.length === 0 || metrics.length === 0) return new Map();

    const scaleMap = new Map<string, { min: number; max: number; scale: (val: number) => number }>();
    
    metrics.forEach(metric => {
      const values = data.map(d => d[metric]).filter(v => v !== null) as number[];
      if (values.length === 0) return;

      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;

      scaleMap.set(metric, {
        min,
        max,
        scale: (val: number) => height - 60 - ((val - min) / range) * (height - 120)
      });
    });

    return scaleMap;
  }, [data, metrics, height]);

  // Handle axis brush updates
  const updateAxisBrush = (metric: string, brush: AxisBrush) => {
    setAxisBrushes(prev => {
      const next = new Map(prev);
      next.set(metric, brush);
      return next;
    });

    // TODO: Update crossfilter with brush constraints
    console.log(`📊 ParallelCoords: Brush updated for ${metric}:`, brush);
  };

  // Clear all brushes
  const clearBrushes = () => {
    setAxisBrushes(new Map());
    console.log('📊 ParallelCoords: All brushes cleared');
  };

  // Filter data based on brushes
  const filteredData = useMemo(() => {
    if (axisBrushes.size === 0) return data;

    return data.filter(row => {
      for (const [metric, brush] of axisBrushes) {
        const value = row[metric];
        if (value === null || value < brush.min || value > brush.max) {
          return false;
        }
      }
      return true;
    });
  }, [data, axisBrushes]);

  // Render the parallel coordinates
  useEffect(() => {
    if (!svgRef.current || metrics.length === 0 || scales.size === 0) return;

    const svg = svgRef.current;
    const axisWidth = (width - 100) / Math.max(1, metrics.length - 1);

    // Clear previous content
    svg.innerHTML = '';

    // Create main group
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(50, 20)');
    svg.appendChild(g);

    // Draw axes
    metrics.forEach((metric, i) => {
      const x = i * axisWidth;
      const scale = scales.get(metric);
      if (!scale) return;

      // Axis line
      const axisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      axisLine.setAttribute('x1', x.toString());
      axisLine.setAttribute('y1', '40');
      axisLine.setAttribute('x2', x.toString());
      axisLine.setAttribute('y2', (height - 80).toString());
      axisLine.setAttribute('stroke', '#333');
      axisLine.setAttribute('stroke-width', '2');
      g.appendChild(axisLine);

      // Axis label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', x.toString());
      label.setAttribute('y', '30');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '12');
      label.setAttribute('font-weight', 'bold');
      label.setAttribute('fill', '#333');
      label.textContent = metric;
      g.appendChild(label);

      // Min/Max labels
      const minLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      minLabel.setAttribute('x', (x - 5).toString());
      minLabel.setAttribute('y', (height - 70).toString());
      minLabel.setAttribute('text-anchor', 'end');
      minLabel.setAttribute('font-size', '10');
      minLabel.setAttribute('fill', '#666');
      minLabel.textContent = scale.min.toFixed(1);
      g.appendChild(minLabel);

      const maxLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      maxLabel.setAttribute('x', (x - 5).toString());
      maxLabel.setAttribute('y', '50');
      maxLabel.setAttribute('text-anchor', 'end');
      maxLabel.setAttribute('font-size', '10');
      maxLabel.setAttribute('fill', '#666');
      maxLabel.textContent = scale.max.toFixed(1);
      g.appendChild(maxLabel);
    });

    // Draw polylines for filtered data
    const maxLinesToDraw = Math.min(filteredData.length, 5000); // Performance limit
    const opacity = Math.max(0.1, Math.min(0.8, 200 / maxLinesToDraw));

    for (let idx = 0; idx < maxLinesToDraw; idx++) {
      const row = filteredData[idx];
      const points: [number, number][] = [];

      // Calculate points for this polyline
      let hasValidPoints = false;
      metrics.forEach((metric, i) => {
        const value = row[metric];
        const scale = scales.get(metric);
        if (value !== null && scale) {
          const x = i * axisWidth;
          const y = scale.scale(value);
          points.push([x, y]);
          hasValidPoints = true;
        }
      });

      if (!hasValidPoints || points.length < 2) continue;

      // Create polyline
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', points.map(([x, y]) => `${x},${y}`).join(' '));
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', '#4F46E5');
      polyline.setAttribute('stroke-width', '1');
      polyline.setAttribute('stroke-opacity', opacity.toString());
      g.appendChild(polyline);
    }

    // Draw brush overlays (simplified for baseline)
    metrics.forEach((metric, i) => {
      const x = i * axisWidth;
      const brush = axisBrushes.get(metric);
      const scale = scales.get(metric);
      
      if (brush && scale) {
        const y1 = scale.scale(brush.max);
        const y2 = scale.scale(brush.min);
        
        // Brush rectangle
        const brushRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        brushRect.setAttribute('x', (x - 8).toString());
        brushRect.setAttribute('y', y1.toString());
        brushRect.setAttribute('width', '16');
        brushRect.setAttribute('height', (y2 - y1).toString());
        brushRect.setAttribute('fill', 'rgba(79, 70, 229, 0.3)');
        brushRect.setAttribute('stroke', '#4F46E5');
        brushRect.setAttribute('stroke-width', '1');
        brushRect.setAttribute('cursor', 'ns-resize');
        g.appendChild(brushRect);
      }
    });

    // Add simple click handler for brush demo (simplified baseline)
    const handleAxisClick = (event: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      const mouseX = event.clientX - rect.left - 50;
      const mouseY = event.clientY - rect.top - 20;

      // Find which axis was clicked
      const axisIndex = Math.round(mouseX / axisWidth);
      if (axisIndex >= 0 && axisIndex < metrics.length) {
        const metric = metrics[axisIndex];
        const scale = scales.get(metric);
        if (!scale) return;

        // Calculate value at click position
        const clickValue = scale.min + ((height - 80 - mouseY) / (height - 120)) * (scale.max - scale.min);
        
        // Create or update brush around click (±10% range)
        const range = (scale.max - scale.min) * 0.1;
        const brush: AxisBrush = {
          min: Math.max(scale.min, clickValue - range),
          max: Math.min(scale.max, clickValue + range)
        };
        
        updateAxisBrush(metric, brush);
      }
    };

    svg.addEventListener('click', handleAxisClick);
    return () => svg.removeEventListener('click', handleAxisClick);

  }, [metrics, scales, filteredData, axisBrushes, width, height]);

  if (metrics.length === 0) {
    return (
      <div className="rounded border bg-white p-8 text-center text-gray-500">
        Select metrics to show parallel coordinates
      </div>
    );
  }

  return (
    <div className="rounded border bg-white relative">
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
          <div className="text-sm text-gray-600">Loading parallel coordinates...</div>
        </div>
      )}
      
      <div className="p-2 flex items-center justify-between border-b">
        <div className="text-sm text-gray-600">
          Parallel Coordinates — {filteredData.length.toLocaleString()} of {data.length.toLocaleString()} jobs
          {axisBrushes.size > 0 && ` (${axisBrushes.size} brush${axisBrushes.size > 1 ? 'es' : ''})`}
        </div>
        <div className="flex gap-2">
          {axisBrushes.size > 0 && (
            <button
              onClick={clearBrushes}
              className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-800 rounded border"
            >
              Clear Brushes
            </button>
          )}
        </div>
      </div>
      
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="w-full"
        style={{ minHeight: `${height}px` }}
      />
      
      <div className="p-2 text-xs text-gray-500 border-t">
        💡 Click on any axis to create a brush filter. Showing up to {Math.min(filteredData.length, 5000).toLocaleString()} lines for performance.
      </div>
    </div>
  );
}