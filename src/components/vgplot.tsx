"use client";
import * as vg from "@uwdata/vgplot";
import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { VgPlotProps } from "@/components/component_types";
import { BOIILERMAKER_GOLD, PlotType } from "./component_types";

// Import column pretty names map
const column_pretty_names = new Map([
  ["time", "Time"],
  ["submit_time", "Submit Time"],
  ["start_time", "Start Time"],
  ["end_time", "End Time"],
  ["timelimit", "Time Limit"],
  ["nhosts", "Number of Hosts"],
  ["ncores", "Number of Cores"],
  ["account", "Account"],
  ["queue", "Queue"],
  ["host", "Host"],
  ["jid", "Job ID"],
  ["unit", "Unit"],
  ["jobname", "Job Name"],
  ["exitcode", "Exit Code"],
  ["host_list", "Host List"],
  ["username", "Username"],
  ["value_cpuuser", "CPU Usage"],
  ["value_gpu", "GPU Usage"],
  ["value_memused", "Memory Used"],
  ["value_memused_minus_diskcache", "Memory Used Minus Disk Cache"],
  ["value_nfs", "NFS Usage"],
  ["value_block", "Block Usage"],
]);

const VgPlot: React.FC<VgPlotProps> = ({
                                         db,
                                         conn,
                                         crossFilter,
                                         dbLoading,
                                         dataLoading,
                                         tableName,
                                         xAxis = "",
                                         columnName,
                                         plotType,
                                         width,
                                         height,
                                       }) => {
  const [windowWidth, setWindowWidth] = useState(0);
  const [windowHeight, setWindowHeight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const plotsRef = useRef<HTMLDivElement | null>(null);

  // Get a descriptive title for the plot
  let title = "";
  switch (plotType) {
    case PlotType.CategoricalHistogram:
      title = `Frequency of ${column_pretty_names.get(columnName) || columnName}`;
      break;
    case PlotType.LinePlot:
      title = `${column_pretty_names.get(columnName) || columnName} over ${column_pretty_names.get(xAxis) || xAxis}`;
      break;
    case PlotType.NumericalHistogram:
      title = `${column_pretty_names.get(columnName) || columnName} Distribution`;
      break;
  }

  // Handle window resizing
  const updateDimensions = () => {
    setWindowWidth(window.innerWidth);
    setWindowHeight(window.innerHeight);
  };

  useEffect(() => {
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Set up the visualization
  const setupDb = useCallback(async () => {
    if (dbLoading || !db || dataLoading || !conn || !plotsRef.current) {
      return;
    }

    try {
      // Verify the column exists in the table to prevent errors
      try {
        const columnCheck = await conn.query(`
          SELECT * FROM ${tableName} LIMIT 1
        `);

        const columns = columnCheck.schema.fields.map(f => f.name);
        if (!columns.includes(columnName)) {
          throw new Error(`Column "${columnName}" not found in table`);
        }

        if (plotType === PlotType.LinePlot && !columns.includes(xAxis)) {
          throw new Error(`X-axis column "${xAxis}" not found in table`);
        }
      } catch (err) {
        console.error(`Error checking columns: ${err}`);
        setError(`Could not display plot: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return;
      }

      // Check if there's data in the table for the column
      try {
        const dataCheck = await conn.query(`
          SELECT COUNT(*) as count FROM ${tableName} 
          WHERE ${columnName} IS NOT NULL
        `);

        const count = dataCheck.toArray()[0].count;
        if (count === 0) {
          throw new Error(`No data available for column "${columnName}"`);
        }
      } catch (err) {
        console.error(`Error checking data: ${err}`);
        setError(`No data to display: ${err instanceof Error ? err.message : 'No data found'}`);
        return;
      }

      // Set up the coordinator if not already done
      try {
        vg.coordinator().databaseConnector(
            vg.wasmConnector({
              duckdb: db,
              connection: conn,
            })
        );
      } catch (err) {
        console.warn("Coordinator might already be set up:", err);
        // Continue since the coordinator might already be set up
      }

      let plot = undefined;

      // Create the appropriate plot based on the type
      switch (plotType) {
        case PlotType.LinePlot:
          try {
            plot = vg.plot(
                vg.lineY(vg.from(tableName, { filterBy: crossFilter }), {
                  x: xAxis,
                  y: columnName,
                  inset: 0.5,
                  stroke: BOIILERMAKER_GOLD,
                }),
                vg.dotY(vg.from(tableName, { filterBy: crossFilter }), {
                  x: xAxis,
                  y: columnName,
                  inset: 0.5,
                  stroke: BOIILERMAKER_GOLD,
                }),
                vg.panZoomX(crossFilter),
                vg.marginLeft(75),
                vg.width(Math.min(windowWidth * width, 800)),
                vg.height(200),
                vg.style({
                  color: "#FFFFFF",
                  backgroundColor: "transparent",
                  fontSize: "14px",
                  ".vgplot-x-axis line, .vgplot-y-axis line": {
                    stroke: "#FFFFFF",
                  },
                  ".vgplot-x-axis text, .vgplot-y-axis text": {
                    fill: "#FFFFFF",
                  }
                })
            );
          } catch (err) {
            console.error(`Error creating line plot: ${err}`);
            setError(`Could not create line plot: ${err instanceof Error ? err.message : 'Unknown error'}`);
            return;
          }
          break;
        case PlotType.NumericalHistogram:
          try {
            plot = vg.plot(
                vg.rectY(vg.from(tableName, { filterBy: crossFilter }), {
                  x: vg.bin(columnName),
                  y: vg.count(),
                  inset: 1,
                  fill: BOIILERMAKER_GOLD,
                }),
                vg.marginLeft(60),
                vg.marginBottom(55),
                vg.intervalX({ as: crossFilter }),
                vg.xDomain(vg.Fixed),
                vg.width(Math.min(windowWidth * width, 800)),
                vg.height(Math.min(windowHeight * height, 300)),
                vg.style({
                  "font-size": "0.8rem",
                  color: "#FFFFFF",
                  backgroundColor: "transparent",
                  ".vgplot-x-axis line, .vgplot-y-axis line": {
                    stroke: "#FFFFFF",
                  },
                  ".vgplot-x-axis text, .vgplot-y-axis text": {
                    fill: "#FFFFFF",
                  }
                })
            );
          } catch (err) {
            console.error(`Error creating numerical histogram: ${err}`);
            setError(`Could not create histogram: ${err instanceof Error ? err.message : 'Unknown error'}`);
            return;
          }
          break;
        case PlotType.CategoricalHistogram:
          try {
            const highlight = vg.Selection.intersect();

            plot = vg.plot(
                vg.rectY(vg.from(tableName, { filterBy: crossFilter }), {
                  x: columnName,
                  y: vg.count(),
                  inset: 1,
                  fill: BOIILERMAKER_GOLD,
                }),
                vg.marginLeft(60),
                vg.marginBottom(55),
                vg.toggleX({ as: crossFilter }),
                vg.toggleX({ as: highlight }),
                vg.highlight({ by: highlight }),
                vg.xDomain(vg.Fixed),
                vg.width(Math.min(windowWidth * width, 800)),
                vg.height(Math.min(windowHeight * height, 300)),
                vg.style({
                  "font-size": "0.9rem",
                  color: "#FFFFFF",
                  backgroundColor: "transparent",
                  ".vgplot-x-axis line, .vgplot-y-axis line": {
                    stroke: "#FFFFFF",
                  },
                  ".vgplot-x-axis text, .vgplot-y-axis text": {
                    fill: "#FFFFFF",
                  }
                })
            );
          } catch (err) {
            console.error(`Error creating categorical histogram: ${err}`);
            setError(`Could not create categorical plot: ${err instanceof Error ? err.message : 'Unknown error'}`);
            return;
          }
          break;
      }

      if (plotsRef.current && plot) {
        // Clear any previous content and add the new plot
        plotsRef.current.innerHTML = '';
        plotsRef.current.appendChild(plot);
      } else {
        console.error("Plot or container reference is missing");
        setError("Could not render plot - container is missing");
      }
    } catch (err) {
      console.error("Error in setupDb:", err);
      setError(`Failed to create visualization: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [
    dbLoading,
    db,
    dataLoading,
    conn,
    plotType,
    tableName,
    crossFilter,
    xAxis,
    columnName,
    width,
    windowWidth,
    height,
    windowHeight,
  ]);

  useEffect(() => {
    setupDb();
  }, [setupDb]);

  if (error) {
    return (
        <div className="flex flex-col w-full text-white bg-zinc-900 p-4 rounded-lg min-h-40">
          <h1 className="text-center text-xl text-red-400">{title}</h1>
          <div className="flex items-center justify-center flex-1 p-4">
            <p className="text-red-400">{error}</p>
          </div>
        </div>
    );
  }

  return (
      <div className="flex flex-col w-full text-white">
        <h1 className="text-center text-xl">{title}</h1>
        <div className="overflow-visible w-full min-h-40" ref={plotsRef} />
      </div>
  );
};

export default React.memo(VgPlot);