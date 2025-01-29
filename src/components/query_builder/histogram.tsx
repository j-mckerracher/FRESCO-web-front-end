import { useEffect, useRef, useState } from 'react';
import { useDuckDb } from "duckdb-wasm-kit";
import * as vg from "@uwdata/vgplot";

interface HistogramProps {
    readyToPlot: boolean;
}

interface BrushValue {
    value?: [Date, Date];
}

const Histogram: React.FC<HistogramProps> = ({ readyToPlot }) => {
    const { db, loading } = useDuckDb();
    const plotRef = useRef<HTMLDivElement>(null);
    const [dataLoaded, setDataLoaded] = useState(false);
    const [brush, setBrush] = useState<BrushValue | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const createPlot = async () => {
            // Ensure we have all required elements
            if (!db || loading || !readyToPlot) {
                console.log('Waiting for requirements:', {
                    db: !!db,
                    loading,
                    readyToPlot
                });
                return;
            }

            // Ensure plotRef exists
            if (!plotRef.current) {
                console.error('Plot container ref not initialized');
                return;
            }

            try {
                console.log('Creating plot connection...');
                const conn = await db.connect();

                // Verify table exists
                const tables = await conn.query("SHOW TABLES");
                const tableExists = tables.toArray().some(row => row[0] === 'histogram');
                if (!tableExists) {
                    throw new Error("Histogram table not found");
                }

                // Check data stats
                console.log('Checking data statistics...');
                const result = await conn.query(`
                    SELECT 
                        COUNT(*) as count,
                        MIN(time) as min_time,
                        MAX(time) as max_time,
                        COUNT(DISTINCT time) as unique_times,
                        CAST(MIN(time) AS STRING) as min_time_str,
                        CAST(MAX(time) AS STRING) as max_time_str
                    FROM histogram
                `);
                const stats = result.toArray()[0];
                console.log('Data statistics:', stats);

                if (stats.count === 0) {
                    throw new Error("No data found in histogram table");
                }

                // Set up coordinator
                console.log('Setting up vgplot coordinator...');
                const coordinator = vg.coordinator();
                coordinator.databaseConnector(
                    vg.wasmConnector({
                        duckdb: db,
                        connection: conn,
                    })
                );

                // Create brush selection
                const brushSelection = vg.Selection.intersect();
                setBrush(brushSelection as BrushValue);

                // Create plot
                console.log('Creating plot element...');
                const plotElement = vg.plot(
                    vg.rectY(
                        vg.from("histogram"),
                        {
                            x: vg.bin("time", { maxbins: 50 }).nice(),
                            y: vg.count(),
                            inset: 0.5,
                            fill: "#CFB991",
                        }
                    ),
                    vg.intervalX({ as: brushSelection }),
                    vg.xScale('time'),
                    vg.xLabel('Time'),
                    vg.yLabel('Count'),
                    vg.width(Math.min(window.innerWidth * 0.8, 1200)),
                    vg.height(400),
                    vg.style({
                        backgroundColor: "transparent",
                        color: "#FFFFFF",
                        fontSize: "14px",
                        fontFamily: "system-ui",
                        ".vgplot-x-axis line, .vgplot-y-axis line": {
                            stroke: "#FFFFFF",
                        },
                        ".vgplot-x-axis text, .vgplot-y-axis text": {
                            fill: "#FFFFFF",
                        }
                    })
                ) as HTMLElement;

                // Clear and append plot
                console.log('Mounting plot...');
                plotRef.current.innerHTML = '';
                plotRef.current.appendChild(plotElement);
                setDataLoaded(true);
                console.log('Plot mounted successfully');

            } catch (error) {
                console.error('Error creating plot:', error);
                setError(error instanceof Error ? error.message : 'An unknown error occurred');
            }
        };

        // Initialize plot
        createPlot();
    }, [db, loading, readyToPlot]);

    if (error) {
        return (
            <div className="text-center p-4">
                <p className="text-white text-lg">Error: {error}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center w-full">
            <h1 className="text-xl font-medium mb-14 text-white">
                {dataLoaded ? 'Drag across the histogram to select a slice of the dataset' : 'Loading histogram data...'}
            </h1>
            <div className="min-h-[60vh] w-full" ref={plotRef} />
            {dataLoaded && (
                <button
                    onClick={() => {
                        if (brush?.value) {
                            const query = `SELECT * FROM job_data_small WHERE time BETWEEN '${
                                brush.value[0].toISOString()
                            }' AND '${brush.value[1].toISOString()}'`;
                            window.localStorage.setItem("SQLQuery", query);
                            window.location.href = "/data_analysis";
                        } else {
                            alert("No selection made");
                        }
                    }}
                    className="mt-8 px-6 py-2 bg-[#CFB991] text-black rounded-md hover:bg-[#BFA881] transition-colors"
                >
                    Query dataset
                </button>
            )}
        </div>
    );
};

export default Histogram;