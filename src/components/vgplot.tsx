"use client";
import * as vg from "@uwdata/vgplot";
import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { VgPlotProps } from "@/components/component_types";
import { BOIILERMAKER_GOLD, PlotType } from "./component_types";

// Import column pretty names map
export const column_pretty_names = new Map([
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

// New code
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
    const [domReady, setDomReady] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
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

    useEffect(() => {
        // Check if the ref is attached to the DOM
        if (plotsRef.current && !domReady) {
            console.log(`DEBUG: DOM element for ${columnName} plot is now ready`);
            setDomReady(true);
        }
    }, [plotsRef.current, columnName, domReady]);

    const needsSpecialScaling = (columnName: string, min: number, max: number): boolean => {
        // If it's block usage or has very small values
        if (columnName === 'value_block') {
            return true;
        }

        // If all values are very small
        if (Math.abs(max) < 0.01 && Math.abs(min) < 0.01) {
            return true;
        }

        return false;
    };

    // Set up the visualization
    const setupDb = useCallback(async () => {
        if (dbLoading || !db || dataLoading || !conn) {
            return;
        }

        if (!plotsRef.current) {
            // Container not ready yet, retry a few times before showing error
            if (retryCount < 5) {
                console.log(`DEBUG: Plot container not ready for ${columnName}, retry ${retryCount + 1}/5`);
                setTimeout(() => {
                    setRetryCount(prev => prev + 1);
                }, 300); // Retry after a short delay
                return;
            } else {
                setError(`Unable to render plot: container element not available after ${retryCount} attempts`);
                return;
            }
        }

        // Reset retry count if we got here
        if (retryCount > 0) {
            setRetryCount(0);
        }

        try {
            // Verify the column exists in the table to prevent errors
            try {
                console.log(`DEBUG: Checking for column "${columnName}" in table "${tableName}"`);

                let tableCheck;
                try {
                    tableCheck = await conn.query(`
                        SELECT name FROM sqlite_master 
                        WHERE type='table' AND name='${tableName}'
                    `);
                    console.log(`DEBUG: Table check for "${tableName}" returned ${tableCheck.toArray().length} results`);
                } catch (tableCheckError) {
                    console.error(`DEBUG: Error checking table "${tableName}":`, tableCheckError);
                    throw new Error(`Unable to verify table "${tableName}": ${tableCheckError instanceof Error ? tableCheckError.message : 'Unknown error'}`);
                }

                if (tableCheck.toArray().length === 0) {
                    console.error(`DEBUG: Table "${tableName}" does not exist!`);
                    throw new Error(`Table "${tableName}" not found`);
                }

                // Check all available columns in the table
                const columnCheck = await conn.query(`
          SELECT * FROM ${tableName} LIMIT 1
        `);

                const columns = columnCheck.schema.fields.map(f => f.name);
                console.log(`DEBUG: Available columns in ${tableName}:`, columns);

                // Check if our specific column exists
                if (!columns.includes(columnName)) {
                    console.error(`DEBUG: Column "${columnName}" not found in table "${tableName}"`);

                    // Try case-insensitive match as a fallback
                    const matchingColumn = columns.find(c =>
                        c.toLowerCase() === columnName.toLowerCase());

                    if (matchingColumn) {
                        console.log(`DEBUG: Found case-insensitive match: "${matchingColumn}"`);
                        // Use the correctly cased column name
                        // (We would need to modify the component to accept this)
                    } else {
                        throw new Error(`Column "${columnName}" not found in table`);
                    }
                } else {
                    console.log(`DEBUG: Column "${columnName}" found in table "${tableName}"`);
                }

                // Also check the x-axis for line plots
                if (plotType === PlotType.LinePlot && !columns.includes(xAxis)) {
                    console.error(`DEBUG: X-axis column "${xAxis}" not found in table`);
                    throw new Error(`X-axis column "${xAxis}" not found in table`);
                }

                // Attempt to query the actual data for this column
                try {
                    const dataCheck = await conn.query(`
            SELECT ${columnName} FROM ${tableName} LIMIT 5
          `);
                    console.log(`DEBUG: Sample data for ${columnName}:`, dataCheck.toArray());
                } catch (err) {
                    console.error(`DEBUG: Error querying column ${columnName}:`, err);
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
                        console.log(`DEBUG: Creating line plot for ${columnName} vs ${xAxis}`);

                        // Check data range
                        const rangeCheck = await conn.query(`
                          SELECT 
                            MIN(${columnName}) as min_val,
                            MAX(${columnName}) as max_val,
                            COUNT(*) as count,
                            COUNT(CASE WHEN ${columnName} IS NULL THEN 1 END) as null_count
                          FROM ${tableName}
                          WHERE ${columnName} IS NOT NULL
                        `);

                        // try {
                        //     const statsCheck = await conn.query(`
                        //         WITH sample_data AS (
                        //             SELECT ${columnName}
                        //             FROM ${tableName}
                        //             WHERE ${columnName} IS NOT NULL
                        //             ORDER BY time
                        //             LIMIT 100
                        //         )
                        //         SELECT
                        //             STDDEV(${columnName}) as std_dev,
                        //             MAX(${columnName}) - MIN(${columnName}) as value_range
                        //         FROM sample_data
                        //     `);
                        //
                        //     const stats = statsCheck.toArray()[0];
                        //     const variationRatio = stats.std_dev / (stats.value_range || 1);
                        //
                        //     console.log(`DEBUG: Pattern check for ${columnName}: std_dev=${stats.std_dev}, range=${stats.value_range}, ratio=${variationRatio}`);
                        //
                        //     // Pure synthetic patterns (sine/cosine) typically have very regular distribution
                        //     // This check is less aggressive than the previous one
                        //     if (stats.value_range > 10 && variationRatio < 0.05) {
                        //         console.warn(`DEBUG: ${columnName} data appears synthetic (variation ratio: ${variationRatio})`);
                        //         throw new Error(`No real data available for ${columnName}`);
                        //     }
                        // } catch (patternCheckError) {
                        //     // If the pattern check itself fails, log but continue
                        //     // This ensures the pattern detection doesn't block showing real data
                        //     if (!(patternCheckError.message.includes("No real data"))) {
                        //         console.warn(`Pattern check error for ${columnName}: ${patternCheckError}`);
                        //         // Continue execution - don't re-throw the error
                        //     } else {
                        //         throw patternCheckError; // Re-throw if it was our "No real data" error
                        //     }
                        // }

                        const range = rangeCheck.toArray()[0];
                        console.log(`DEBUG: Value range for ${columnName}: min=${range.min_val}, max=${range.max_val}, count=${range.count}, null_count=${range.null_count}`);

                        if (range.count === 0) {
                            throw new Error(`No non-null data found for column "${columnName}"`);
                        }

                        // Get time range for x-axis
                        const timeRangeCheck = await conn.query(`
              SELECT 
                MIN(${xAxis}) as min_time,
                MAX(${xAxis}) as max_time
              FROM ${tableName}
              WHERE ${xAxis} IS NOT NULL
            `);

                        const timeRange = timeRangeCheck.toArray()[0];
                        console.log(`DEBUG: Time range: min=${timeRange.min_time}, max=${timeRange.max_time}`);

                        // Generate a unique view name with timestamp and random suffix to avoid conflicts
                        const uniqueId = Date.now().toString() + '_' + Math.floor(Math.random() * 10000);
                        let viewName = `${tableName}_agg_${columnName.replace(/[^a-zA-Z0-9]/g, '_')}_${uniqueId}`;

                        // Check if we have any data points for this column in the time range
                        const dataPointCheck = await conn.query(`
                          SELECT COUNT(*) as count 
                          FROM ${tableName}
                          WHERE ${columnName} IS NOT NULL AND ${xAxis} IS NOT NULL
                        `);
                        const dataPointCount = dataPointCheck.toArray()[0].count;

                        // If no data points, show a message instead of an empty plot
                        if (dataPointCount === 0) {
                            setError(`No data points available for ${columnName} in the selected time range`);
                            return;
                        }
                        // Log the range of values to help diagnose scaling issues
                        console.log(`DEBUG: ${columnName} has ${dataPointCount} data points in range: ${range.min_val} to ${range.max_val}`);

                        // Special handling for CPU usage with extreme outliers
                        if (columnName === 'value_cpuuser' && Math.abs(range.min_val) > 1000) {
                            console.log(`DEBUG: Using percentile-based approach for CPU usage with extreme outliers`);

                            try {
                                // Create a percentile-based view that excludes the most extreme values
                                const robustViewName = `${viewName}_robust`;

                                await conn.query(`
                                  CREATE TEMPORARY VIEW ${robustViewName} AS
                                  WITH percentiles AS (
                                    SELECT
                                      PERCENTILE_CONT(0.01) WITHIN GROUP (ORDER BY ${columnName}) AS p01,
                                      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ${columnName}) AS p99
                                    FROM ${tableName}
                                    WHERE ${columnName} IS NOT NULL AND ${xAxis} IS NOT NULL
                                  ),
                                  robust_data AS (
                                    SELECT 
                                      t.${xAxis},
                                      t.${columnName}
                                    FROM ${tableName} t, percentiles p
                                    WHERE 
                                      t.${columnName} IS NOT NULL AND 
                                      t.${xAxis} IS NOT NULL AND
                                      t.${columnName} BETWEEN p.p01 AND p.p99
                                  )
                                  SELECT 
                                    date_trunc('hour', ${xAxis}) as hour,
                                    AVG(${columnName}) as avg_value,
                                    MIN(${columnName}) as min_value,
                                    MAX(${columnName}) as max_value,
                                    COUNT(*) as count
                                  FROM robust_data
                                  GROUP BY date_trunc('hour', ${xAxis})
                                  ORDER BY hour
                                `);

                                // Log the percentile-based view
                                const robustStats = await conn.query(`
                                  SELECT * FROM ${robustViewName} LIMIT 10
                                `);

                                console.log(`DEBUG: Robust view stats for CPU usage (excluding extreme outliers):`);
                                const robustData = robustStats.toArray();
                                robustData.forEach((row, i) => {
                                    console.log(`  Hour ${i}: min=${row.min_value}, max=${row.max_value}, avg=${row.avg_value}, count=${row.count}`);
                                });

                                // Get new y-domain range from the robust view
                                const robustRange = await conn.query(`
                                  SELECT 
                                    MIN(min_value) as min_val,
                                    MAX(max_value) as max_val
                                  FROM ${robustViewName}
                                `);

                                const newRange = robustRange.toArray()[0];
                                const newYMin = newRange.min_val;
                                const newYMax = newRange.max_val;
                                const newYRange = newYMax - newYMin;
                                const newYBuffer = newYRange * 0.1;

                                // Create the plot using the robust data view
                                plot = vg.plot(
                                    vg.lineY(vg.from(robustViewName), {
                                        x: "hour",
                                        y: "avg_value",
                                        stroke: BOIILERMAKER_GOLD,
                                        strokeWidth: 3,
                                    }),
                                    vg.areaY(vg.from(robustViewName), {
                                        x: "hour",
                                        y1: "min_value",
                                        y2: "max_value",
                                        fillOpacity: 0.2,
                                        fill: BOIILERMAKER_GOLD
                                    }),
                                    vg.dotY(vg.from(robustViewName), {
                                        x: "hour",
                                        y: "avg_value",
                                        fill: BOIILERMAKER_GOLD,
                                        stroke: "#000000",
                                        strokeWidth: 1
                                    }),
                                    vg.panZoomX(crossFilter),
                                    vg.marginLeft(75),
                                    vg.marginBottom(50),
                                    vg.marginTop(30),
                                    vg.marginRight(30),
                                    vg.width(Math.min(windowWidth * width, 800)),
                                    vg.height(400),
                                    vg.xScale('time'),
                                    vg.yScale('linear'),
                                    vg.yDomain([newYMin - newYBuffer, newYMax + newYBuffer]),
                                    vg.xLabel("Time"),
                                    vg.yLabel(`${column_pretty_names.get(columnName) || columnName} (excluding outliers)`),
                                    vg.style({
                                        color: "#FFFFFF",
                                        backgroundColor: "transparent",
                                        fontSize: "14px",
                                        ".vgplot-x-axis line, .vgplot-y-axis line": {
                                            stroke: "#FFFFFF",
                                        },
                                        ".vgplot-x-axis text, .vgplot-y-axis text": {
                                            fill: "#FFFFFF",
                                        },
                                        ".vgplot-marks path": {
                                            strokeWidth: "3px"
                                        },
                                        ".vgplot-marks circle": {
                                            r: "5px"
                                        }
                                    })
                                );

                                console.log(`DEBUG: Created robust plot for CPU usage excluding extreme outliers`);

                                // Mount the plot before returning
                                if (plotsRef.current) {
                                    // Clear any previous content and add the new plot
                                    plotsRef.current.innerHTML = '';
                                    plotsRef.current.appendChild(plot);
                                }

                                // Return after properly mounting the plot
                                return;
                            } catch (robustErr) {
                                console.error(`DEBUG: Error creating robust plot for CPU usage:`, robustErr);
                                // Fall through to regular approach if this fails
                            }
                        }
                        // Special handling for Block usage with small values
                        else if (columnName === 'value_block') {
                            console.log(`DEBUG: Using specialized approach for Block usage with small values`);

                            try {
                                // Create a regular aggregated view
                                await conn.query(`
                                  CREATE TEMPORARY VIEW ${viewName} AS
                                  SELECT 
                                    date_trunc('hour', ${xAxis}) as hour,
                                    AVG(${columnName}) as avg_value,
                                    MIN(${columnName}) as min_value,
                                    MAX(${columnName}) as max_value,
                                    COUNT(*) as count
                                  FROM ${tableName}
                                  WHERE ${columnName} IS NOT NULL AND ${xAxis} IS NOT NULL
                                  GROUP BY date_trunc('hour', ${xAxis})
                                  ORDER BY hour
                                `);

                                                // After creating the view, let's log some sample data
                                                try {
                                                    const sampleData = await conn.query(`
                                    SELECT * FROM ${viewName} 
                                    ORDER BY hour
                                    LIMIT 20
                                  `);

                                    const samples = sampleData.toArray();
                                    console.log(`DEBUG: Sample data from Block usage view (${viewName}):`);
                                    samples.forEach((row, i) => {
                                        console.log(`  Row ${i}: hour=${row.hour}, avg_value=${row.avg_value}, min=${row.min_value}, max=${row.max_value}, count=${row.count}`);
                                    });
                                } catch (debugErr) {
                                    console.error(`DEBUG: Error during Block usage debugging queries:`, debugErr);
                                }

                                const yMin = range.min_val;
                                const yMax = range.max_val;
                                const yRange = yMax - yMin;
                                const yBuffer = yRange * 0.1;

                                // Create enhanced visualization for Block usage
                                plot = vg.plot(
                                    vg.lineY(vg.from(viewName), {
                                        x: "hour",
                                        y: "avg_value",
                                        stroke: BOIILERMAKER_GOLD,
                                        strokeWidth: 3,
                                    }),
                                    vg.areaY(vg.from(viewName), {
                                        x: "hour",
                                        y1: "min_value",
                                        y2: "max_value",
                                        fillOpacity: 0.2,
                                        fill: BOIILERMAKER_GOLD
                                    }),
                                    vg.dotY(vg.from(viewName), {
                                        x: "hour",
                                        y: "avg_value",
                                        fill: BOIILERMAKER_GOLD,
                                        stroke: "#000000",
                                        strokeWidth: 1,
                                        r: 5
                                    }),
                                    vg.panZoomX(crossFilter),
                                    vg.marginLeft(75),
                                    vg.marginBottom(50),
                                    vg.marginTop(30),
                                    vg.marginRight(30),
                                    vg.width(Math.min(windowWidth * width, 800)),
                                    vg.height(400),
                                    vg.xScale('time'),
                                    vg.yScale('linear'),
                                    vg.yDomain([yMin - yBuffer, yMax + yBuffer]),
                                    vg.xLabel("Time"),
                                    vg.yLabel(column_pretty_names.get(columnName) || columnName),
                                    vg.style({
                                        color: "#FFFFFF",
                                        backgroundColor: "transparent",
                                        fontSize: "14px",
                                        ".vgplot-x-axis line, .vgplot-y-axis line": {
                                            stroke: "#FFFFFF",
                                        },
                                        ".vgplot-x-axis text, .vgplot-y-axis text": {
                                            fill: "#FFFFFF",
                                        },
                                        ".vgplot-marks path": {
                                            strokeWidth: "3px"
                                        },
                                        ".vgplot-marks circle": {
                                            r: "5px"
                                        }
                                    })
                                );

                                // console.log(`DEBUG: Created enhanced plot for Block usage`);
                                // Mount the plot before continuing
                                if (plotsRef.current) {
                                    plotsRef.current.innerHTML = '';
                                    plotsRef.current.appendChild(plot);
                                    console.log(`DEBUG: Mounted Block usage plot to DOM`);
                                }
                                return;
                            } catch (blockErr) {
                                console.error(`DEBUG: Error creating enhanced Block usage plot:`, blockErr);
                                // Fall through to regular approach if this fails
                            }
                        }
                        // Default case for regular columns
                        else {
                            try {
                                // Create an aggregated view with hourly averages for regular columns
                                await conn.query(`
                  CREATE TEMPORARY VIEW ${viewName} AS
                  SELECT 
                    date_trunc('hour', ${xAxis}) as hour,
                    AVG(${columnName}) as avg_value,
                    COUNT(*) as count
                  FROM ${tableName}
                  WHERE ${columnName} IS NOT NULL AND ${xAxis} IS NOT NULL
                  GROUP BY date_trunc('hour', ${xAxis})
                  ORDER BY hour
                `);

                                console.log(`DEBUG: Created standard aggregated view for line plot`);

                                // After creating the view, log sample data for debugging
                                try {
                                    const sampleData = await conn.query(`
                    SELECT * FROM ${viewName} 
                    ORDER BY hour
                    LIMIT 20
                  `);

                                    const samples = sampleData.toArray();
                                    console.log(`DEBUG: Sample data from aggregated view (${viewName}):`);
                                    samples.forEach((row, i) => {
                                        console.log(`  Row ${i}: hour=${row.hour}, avg_value=${row.avg_value}, count=${row.count}`);
                                    });
                                } catch (debugErr) {
                                    console.error(`DEBUG: Error during debugging queries:`, debugErr);
                                }
                            } catch (viewErr) {
                                console.error(`DEBUG: Error creating view: ${viewErr}`);
                                // If we can't create the view, we'll try using the table directly
                                // This is less efficient but should still work
                                plot = vg.plot(
                                    vg.lineY(vg.from(tableName, {filterBy: crossFilter}), {
                                        x: xAxis,
                                        y: columnName,
                                        stroke: BOIILERMAKER_GOLD,
                                        strokeWidth: 2,
                                    }),
                                    vg.panZoomX(crossFilter),
                                    vg.marginLeft(75),
                                    vg.marginBottom(40),
                                    vg.marginTop(20),
                                    vg.marginRight(20),
                                    vg.width(Math.min(windowWidth * width, 800)),
                                    vg.height(300),
                                    vg.xScale('time'),
                                    vg.yScale('linear'),
                                    vg.xLabel("Time"),
                                    vg.yLabel(column_pretty_names.get(columnName) || columnName),
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
                                console.log(`DEBUG: Created fallback line plot without aggregation`);
                                return;
                            }
                        }

                        // Calculate buffer for Y axis (10% padding)
                        const yMin = range.min_val;
                        const yMax = range.max_val;
                        const yRange = yMax - yMin;

                        // If the range is very small, use a minimum range to ensure visibility
                        const effectiveRange = Math.max(yRange, Math.abs(yMax) * 0.1 || 1);
                        const yBuffer = effectiveRange * 0.1;

                        // Ensure there's always some vertical space to see the data
                        const yDomainMin = yMin - yBuffer;
                        const yDomainMax = yMax + yBuffer;

                        console.log(`DEBUG: ${columnName} Y domain: ${yDomainMin} to ${yDomainMax} (effective range: ${effectiveRange})`);

                        // Use the aggregated view for better performance and visibility (standard case)
                        plot = vg.plot(
                            vg.lineY(vg.from(viewName), {
                                x: "hour",
                                y: "avg_value",
                                stroke: BOIILERMAKER_GOLD,
                                strokeWidth: 2,
                            }),
                            vg.dotY(vg.from(viewName), {
                                x: "hour",
                                y: "avg_value",
                                stroke: BOIILERMAKER_GOLD,
                                fill: BOIILERMAKER_GOLD,
                            }),
                            vg.panZoomX(crossFilter),
                            vg.marginLeft(75),
                            vg.marginBottom(40),
                            vg.marginTop(20),
                            vg.marginRight(20),
                            vg.width(Math.min(windowWidth * width, 800)),
                            vg.height(300), // Use fixed height
                            vg.xScale('time'),
                            vg.yScale('linear'),
                            vg.yDomain([yDomainMin, yDomainMax]), // Explicitly set y domain
                            vg.xLabel("Time"),
                            vg.yLabel(column_pretty_names.get(columnName) || columnName),
                            vg.style({
                                color: "#FFFFFF",
                                backgroundColor: "transparent",
                                fontSize: "14px",
                                ".vgplot-x-axis line, .vgplot-y-axis line": {
                                    stroke: "#FFFFFF",
                                },
                                ".vgplot-x-axis text, .vgplot-y-axis text": {
                                    fill: "#FFFFFF",
                                },
                                // Make sure lines and points are visible
                                ".vgplot-marks": {
                                    opacity: 1,
                                    pointerEvents: "all"
                                }
                            })
                        );

                        console.log(`DEBUG: Successfully created line plot using view ${viewName}`);
                    } catch (err) {
                        console.error(`DEBUG: Error creating line plot: ${err}`);
                        setError(`Could not create line plot: ${err instanceof Error ? err.message : 'Unknown error'}`);
                        return;
                    }
                    break;

                case PlotType.NumericalHistogram:
                    try {
                        console.log(`DEBUG: Creating numerical histogram for ${columnName}`);

                        // Check data range for special scaling needs
                        const rangeCheck = await conn.query(`
              SELECT 
                MIN(${columnName}) as min_val,
                MAX(${columnName}) as max_val,
                COUNT(*) as count,
                COUNT(CASE WHEN ${columnName} IS NULL THEN 1 END) as null_count
              FROM ${tableName}
              WHERE ${columnName} IS NOT NULL
            `);

                        const range = rangeCheck.toArray()[0];
                        console.log(`DEBUG: Value range for ${columnName}: min=${range.min_val}, max=${range.max_val}, count=${range.count}, null_count=${range.null_count}`);

                        // If we have very small values, create transformed view
                        const needsScaling = needsSpecialScaling(columnName, range.min_val, range.max_val);

                        if (needsScaling) {
                            console.log(`DEBUG: Using scaling for small values in histogram`);

                            // Create unique view name
                            const uniqueId = Date.now().toString() + '_' + Math.floor(Math.random() * 10000);
                            const transformedView = `${tableName}_hist_${columnName.replace(/[^a-zA-Z0-9]/g, '_')}_${uniqueId}`;

                            try {
                                await conn.query(`
                  CREATE TEMPORARY VIEW ${transformedView} AS
                  SELECT 
                    *,
                    ${columnName} * 1000000 as ${columnName}_scaled
                  FROM ${tableName}
                  WHERE ${columnName} IS NOT NULL
                `);

                                // Create plot with scaled values
                                plot = vg.plot(
                                    vg.rectY(vg.from(transformedView, {filterBy: crossFilter}), {
                                        x: vg.bin(`${columnName}_scaled`),
                                        y: vg.count(),
                                        inset: 1,
                                        fill: BOIILERMAKER_GOLD,
                                    }),
                                    vg.marginLeft(60),
                                    vg.marginBottom(55),
                                    vg.intervalX({as: crossFilter}),
                                    vg.xDomain(vg.Fixed),
                                    vg.width(Math.min(windowWidth * width, 800)),
                                    vg.height(Math.min(windowHeight * height, 300)),
                                    vg.xLabel(`${column_pretty_names.get(columnName) || columnName} (×10⁻⁶)`),
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

                                console.log(`DEBUG: Created scaled histogram for small values`);
                                return;
                            } catch (scaleErr) {
                                console.error(`DEBUG: Error creating scaled histogram:`, scaleErr);
                                // Fall through to regular approach
                            }
                        }

                        // Regular histogram creation (no scaling needed)
                        plot = vg.plot(
                            vg.rectY(vg.from(tableName, {filterBy: crossFilter}), {
                                x: vg.bin(columnName),
                                y: vg.count(),
                                inset: 1,
                                fill: BOIILERMAKER_GOLD,
                            }),
                            vg.marginLeft(60),
                            vg.marginBottom(55),
                            vg.intervalX({as: crossFilter}),
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

                        console.log(`DEBUG: Created regular numerical histogram`);
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
                            vg.rectY(vg.from(tableName, {filterBy: crossFilter}), {
                                x: columnName,
                                y: vg.count(),
                                inset: 1,
                                fill: BOIILERMAKER_GOLD,
                            }),
                            vg.marginLeft(60),
                            vg.marginBottom(55),
                            vg.toggleX({as: crossFilter}),
                            vg.toggleX({as: highlight}),
                            vg.highlight({by: highlight}),
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
                console.log(`DEBUG: Successfully mounted ${columnName} plot to DOM`);
            } else {
                console.error(`Plot or container reference is missing for ${columnName}`);
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
        if (domReady) {
            console.log(`DEBUG: Running setupDb for ${columnName} now that DOM is ready`);
            setupDb();
        }
    }, [setupDb, domReady, columnName, retryCount]);

    if (error) {
        return (
            <div className="flex flex-col w-full text-white bg-zinc-900 p-4 rounded-lg min-h-40">
                <h1 className="text-center text-xl text-red-400">{title}</h1>
                <div className="flex items-center justify-center flex-1 p-4">
                    <p className="text-red-400">
                        {error.includes("No real data") ?
                            "No real data available for this metric in the selected time window" :
                            error}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full text-white">
            {title && <h1 className="text-center text-xl mb-4">{title}</h1>}
            <div
                className="overflow-visible w-full min-h-[400px] flex items-center justify-center"
                ref={plotsRef}
                style={{
                    // Add inline styles to ensure plot is properly displayed
                    minWidth: '100%',
                    position: 'relative',
                    zIndex: 1
                }}
            />
            {error && (
                <div className="mt-4 p-3 bg-red-900 rounded text-white">
                    <p className="font-bold">Error:</p>
                    <p>{error}</p>
                </div>
            )}
        </div>
    );
};

export default React.memo(VgPlot);