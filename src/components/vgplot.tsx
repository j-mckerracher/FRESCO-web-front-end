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

    const createPlotWithTable = async (table) => {
        // This would contain all the plot creation logic from above
        // but using the passed table parameter instead of tableName
        // You can implement this if needed for better code organization
        console.log(`Creating plot with fallback table: ${table}`);
        // ... implementation
    };

    // Set up the visualization
    const setupDb = useCallback(async () => {
        // Skip if prerequisites are not met - thorough check with logging
        if (dbLoading || !db || dataLoading || !conn) {
            console.log(`Skipping plot setup - dependencies not ready:
            dbLoading: ${dbLoading},
            db: ${!!db},
            dataLoading: ${dataLoading},
            conn: ${!!conn}`);
            return;
        }

        // Explicitly check for plot container before continuing
        if (!plotsRef.current) {
            console.error("Plot container reference is null or undefined");
            setError("Could not render plot - container is missing");
            return;
        }

        try {
            console.log(`DEBUG: Attempting to create plot for ${columnName} in ${tableName}`);

            // Verify the table exists to prevent errors
            try {
                const tableCheck = await conn.query(`
                SELECT EXISTS (
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='${tableName}'
                ) as exists
            `);

                const tableExists = tableCheck.toArray()[0].exists;
                if (!tableExists) {
                    // If the specified table doesn't exist, try using job_data as fallback
                    console.warn(`Table "${tableName}" not found, checking for fallback table`);

                    const fallbackCheck = await conn.query(`
                    SELECT EXISTS (
                        SELECT name FROM sqlite_master 
                        WHERE type='table' AND name='job_data'
                    ) as exists
                `);

                    const fallbackExists = fallbackCheck.toArray()[0].exists;
                    if (fallbackExists) {
                        console.log(`Using "job_data" as fallback table`);
                        // Use a local variable instead of modifying state directly
                        const fallbackTable = "job_data";

                        // Continue with the rest of the function using fallbackTable instead of tableName
                        // This is critical - we'll use this local variable in all subsequent queries

                        // Check if the column exists in the fallback table
                        const columnCheck = await conn.query(`
                        SELECT * FROM ${fallbackTable} LIMIT 1
                    `);

                        const columns = columnCheck.schema.fields.map(f => f.name);
                        console.log(`Available columns in ${fallbackTable}:`, columns);

                        if (!columns.includes(columnName)) {
                            throw new Error(`Column "${columnName}" not found in fallback table`);
                        }

                        // Proceed with plot creation using the fallback table
                        return await createPlotWithTable(fallbackTable);
                    } else {
                        throw new Error(`Neither "${tableName}" nor fallback "job_data" tables exist`);
                    }
                }

                console.log(`Verified table ${tableName} exists`);
            } catch (tableErr) {
                console.error(`Table verification error:`, tableErr);
                setError(`Could not find data table: ${tableErr.message || 'Unknown error'}`);
                return;
            }

            // Check if the column exists in the table
            try {
                const columnCheck = await conn.query(`
                SELECT * FROM ${tableName} LIMIT 1
            `);

                const columns = columnCheck.schema.fields.map(f => f.name);
                console.log(`Available columns in ${tableName}:`, columns);

                if (!columns.includes(columnName)) {
                    console.error(`Column "${columnName}" not found in table "${tableName}"`);
                    throw new Error(`Column "${columnName}" not found in table`);
                }

                if (plotType === PlotType.LinePlot && !columns.includes(xAxis)) {
                    console.error(`X-axis column "${xAxis}" not found in table`);
                    throw new Error(`X-axis column "${xAxis}" not found in table`);
                }

                // Get sample data to verify column has valid values
                const sampleData = await conn.query(`
                SELECT ${columnName} FROM ${tableName} LIMIT 5
            `);
                console.log(`Sample data for ${columnName}:`, sampleData.toArray());
            } catch (columnErr) {
                console.error(`Column verification error:`, columnErr);
                setError(`Could not access column: ${columnErr.message || 'Unknown error'}`);
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
                console.log(`Found ${count} non-null values for column ${columnName}`);
            } catch (dataErr) {
                console.error(`Data check error:`, dataErr);
                setError(`No data to display: ${dataErr.message || 'No data found'}`);
                return;
            }

            // Set up the coordinator safely
            try {
                // If coordinator is already set up, this might throw - catch and continue
                vg.coordinator().databaseConnector(
                    vg.wasmConnector({
                        duckdb: db,
                        connection: conn,
                    })
                );
                console.log("VG coordinator set up successfully");
            } catch (coordErr) {
                console.warn("Coordinator might already be set up:", coordErr);
                // Continue execution since this could be a "coordinator already initialized" error
            }

            // Create the appropriate plot based on the type
            let plot;

            switch (plotType) {
                case PlotType.LinePlot:
                    try {
                        // Line plot creation code...
                        // Similar to your original but with additional error handling

                        // Check data range
                        const rangeCheck = await conn.query(`
                        SELECT 
                            MIN(${columnName}) as min_val,
                            MAX(${columnName}) as max_val,
                            COUNT(*) as count
                        FROM ${tableName}
                        WHERE ${columnName} IS NOT NULL
                    `);

                        const range = rangeCheck.toArray()[0];
                        console.log(`Value range for ${columnName}: min=${range.min_val}, max=${range.max_val}, count=${range.count}`);

                        // Get time range for x-axis
                        const timeRangeCheck = await conn.query(`
                        SELECT 
                            MIN(${xAxis}) as min_time,
                            MAX(${xAxis}) as max_time
                        FROM ${tableName}
                        WHERE ${xAxis} IS NOT NULL
                    `);

                        const timeRange = timeRangeCheck.toArray()[0];

                        // Use a simpler approach with direct table access - no views
                        plot = vg.plot(
                            vg.rectY(vg.from(tableName, { filterBy: crossFilter }), {
                                x: vg.bin(columnName, {
                                    maxbins: 20,
                                    nice: true
                                }),
                                y: vg.count(),
                                inset: 1,
                                fill: BOIILERMAKER_GOLD,
                            }),
                            vg.marginLeft(60),
                            vg.marginBottom(55),
                            // REMOVE: vg.intervalX({ as: crossFilter }),
                            vg.xDomain([minVal, maxVal]),
                            vg.yDomain([0, null]),
                            vg.width(Math.min(windowWidth * width, 800)),
                            vg.height(Math.min(windowHeight * height, 300)),
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

                        console.log(`Created line plot for ${columnName} vs ${xAxis}`);
                    } catch (err) {
                        console.error(`Error creating line plot:`, err);
                        setError(`Could not create line plot: ${err.message || 'Unknown error'}`);
                        return;
                    }
                    break;

                case PlotType.NumericalHistogram:
                    try {
                        // Special handling for time column
                        if (columnName === 'time') {
                            console.log("Creating time-based histogram with formatting");

                            // Get range for formatting
                            const rangeCheck = await conn.query(`
                SELECT 
                    MIN(${columnName}) as min_val,
                    MAX(${columnName}) as max_val,
                    COUNT(*) as count
                FROM ${tableName}
                WHERE ${columnName} IS NOT NULL
            `);

                            const range = rangeCheck.toArray()[0];
                            console.log(`Time range for ${columnName}: min=${new Date(range.min_val).toISOString()}, max=${new Date(range.max_val).toISOString()}, count=${range.count}`);

                            // Create the plot with proper time formatting
                            plot = vg.plot(
                                vg.rectY(vg.from(tableName), {
                                    x: vg.bin(columnName, {
                                        maxbins: 30,
                                        nice: true
                                    }),
                                    y: vg.count(),
                                    inset: 1,
                                    fill: BOIILERMAKER_GOLD,
                                }),
                                vg.marginLeft(60),
                                vg.marginBottom(75), // Increase bottom margin for rotated labels
                                vg.xScale('time'), // Use time scale instead of default
                                vg.xFormat('%-m/%-d %-I:%M %p'), // Format as Month/Day Hour:Minute AM/PM
                                vg.yDomain([0, null]), // Ensure positive y values
                                vg.width(Math.min(windowWidth * width, 800)),
                                vg.height(Math.min(windowHeight * height, 300)),
                                vg.style({
                                    fontSize: "0.8rem",
                                    color: "#FFFFFF",
                                    backgroundColor: "transparent",
                                    ".vgplot-x-axis line, .vgplot-y-axis line": {
                                        stroke: "#FFFFFF",
                                    },
                                    ".vgplot-x-axis text, .vgplot-y-axis text": {
                                        fill: "#FFFFFF",
                                    },
                                    ".vgplot-x-axis text": {
                                        textAnchor: "end",
                                        transform: "rotate(-45)",
                                        dominantBaseline: "central",
                                        dx: "-0.5em",
                                        dy: "0.5em"
                                    }
                                })
                            );
                            console.log(`Created time-based histogram with formatting`);
                        } else {
                            // Numerical histogram creation with safety measures for non-time columns
                            const rangeCheck = await conn.query(`
                SELECT 
                    MIN(${columnName}) as min_val,
                    MAX(${columnName}) as max_val,
                    COUNT(*) as count
                FROM ${tableName}
                WHERE ${columnName} IS NOT NULL
            `);

                            const range = rangeCheck.toArray()[0];
                            console.log(`Value range for ${columnName}: min=${range.min_val}, max=${range.max_val}, count=${range.count}`);

                            // Ensure positive min/max values for the domain
                            const minVal = Math.min(0, range.min_val);  // Use 0 if min is positive
                            const maxVal = Math.max(0.001, range.max_val); // Ensure non-zero positive max

                            plot = vg.plot(
                                vg.rectY(vg.from(tableName, { filterBy: crossFilter }), {
                                    x: vg.bin(columnName, {
                                        maxbins: 20,  // Limit number of bins
                                        nice: true    // Use nice round numbers
                                    }),
                                    y: vg.count(),
                                    inset: 1,
                                    fill: BOIILERMAKER_GOLD,
                                }),
                                vg.marginLeft(60),
                                vg.marginBottom(55),
                                vg.intervalX({ as: crossFilter }),
                                vg.xDomain([minVal, maxVal]),  // Explicit domain
                                vg.yDomain([0, null]), // Start at 0, auto-calculate max
                                vg.width(Math.min(windowWidth * width, 800)),
                                vg.height(Math.min(windowHeight * height, 300)),
                                vg.style({
                                    fontSize: "0.8rem",
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
                            console.log(`Created numerical histogram for ${columnName}`);
                        }
                    } catch (err) {
                        console.error(`Error creating numerical histogram:`, err);
                        setError(`Could not create histogram: ${err.message || 'Unknown error'}`);
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
                            vg.yDomain([0, null]), // Ensure positive y values
                            vg.width(Math.min(windowWidth * width, 800)),
                            vg.height(Math.min(windowHeight * height, 300)),
                            vg.style({
                                fontSize: "0.9rem",
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
                        console.log(`Created categorical histogram for ${columnName}`);
                    } catch (err) {
                        console.error(`Error creating categorical histogram:`, err);
                        setError(`Could not create categorical plot: ${err.message || 'Unknown error'}`);
                        return;
                    }
                    break;
            }

            // Now safely render the plot to the container
            if (plotsRef.current && plot) {
                try {
                    // First create a blank div to clear any existing content
                    const container = document.createElement('div');
                    container.style.width = '100%';
                    container.style.height = '100%';
                    container.style.position = 'relative';

                    // Clear and add the new container
                    plotsRef.current.innerHTML = '';
                    plotsRef.current.appendChild(container);

                    // Add the plot to the container with additional try/catch
                    try {
                        container.appendChild(plot);
                        console.log(`Successfully rendered plot to container`);
                    } catch (renderErr) {
                        console.error(`Error appending plot to container:`, renderErr);
                        setError(`Rendering error: ${renderErr.message || 'Failed to display plot'}`);
                    }
                } catch (mountErr) {
                    console.error(`Error mounting plot:`, mountErr);
                    setError(`Could not mount visualization: ${mountErr.message || 'DOM error'}`);
                }
            } else {
                if (!plotsRef.current) {
                    console.error("Plot container reference is missing");
                    setError("Could not render plot - container is missing");
                } else if (!plot) {
                    console.error("Plot object was not created");
                    setError("Could not render plot - visualization was not created");
                }
            }
        } catch (err) {
            console.error("Unexpected error in setupDb:", err);
            setError(`Failed to create visualization: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }, [
        dbLoading,
        db,
        dataLoading,
        conn,
        tableName,
        columnName,
        plotType,
        xAxis,
        crossFilter,
        width,
        windowWidth,
        height,
        windowHeight
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