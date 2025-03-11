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
    const connRef = useRef<any>(null);

    const formatDate = (date: Date): string => {
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    useEffect(() => {
        const createPlot = async () => {
            if (!db || loading || !readyToPlot || !plotRef.current) {
                console.log('Waiting for requirements:', {
                    db: !!db,
                    loading,
                    readyToPlot,
                    plotRef: !!plotRef.current
                });
                return;
            }

            try {
                // Create and store connection
                console.log('DEBUG: Creating plot connection...');
                connRef.current = await db.connect();

                // Set up ICU and timezone
                await connRef.current.query("LOAD icu");
                await connRef.current.query("SET TimeZone='America/New_York'");

                // Check data range for binning
                console.log('DEBUG: Checking data range...');
                try {
                    const rangeQuery = await connRef.current.query(`
                        SELECT 
                            MIN(time) as min_time,
                            MAX(time) as max_time,
                            COUNT(*) as count
                        FROM histogram_view
                    `);

                    const rangeResult = rangeQuery.toArray();
                    console.log('DEBUG: Range query result:', rangeResult);

                    if (rangeResult.length === 0) {
                        throw new Error('No data returned from range query');
                    }

                    const range = rangeResult[0];
                    console.log('DEBUG: Data range details:', {
                        min_time: range.min_time,
                        max_time: range.max_time,
                        count: range.count,
                        min_time_type: typeof range.min_time,
                        max_time_type: typeof range.max_time
                    });

                    if (range.count === 0) {
                        throw new Error('Histogram view contains no data');
                    }

                    if (!range.min_time || !range.max_time) {
                        console.error('DEBUG: Missing min or max time values', {
                            min_time: range.min_time,
                            max_time: range.max_time
                        });

                        // Check if we can find any data at all
                        const anyDataQuery = await connRef.current.query(`
                            SELECT * FROM histogram_view LIMIT 10
                        `);
                        const anyData = anyDataQuery.toArray();
                        console.log('DEBUG: Sample data from histogram_view:', anyData);

                        // Try to manually compute min/max if there's any data
                        if (anyData.length > 0) {
                            console.log('DEBUG: Attempting to manually find min/max times');

                            // Create a fallback date range if we have any data
                            const now = new Date();
                            const oneDay = 24 * 60 * 60 * 1000; // milliseconds in a day

                            const fallbackMin = new Date(now.getTime() - oneDay);
                            const fallbackMax = now;

                            console.log('DEBUG: Using fallback date range:', {
                                min: fallbackMin,
                                max: fallbackMax
                            });

                            // Modify the range object with fallback values
                            range.min_time = fallbackMin;
                            range.max_time = fallbackMax;
                        } else {
                            throw new Error('Missing min or max time values');
                        }
                    }

                    // Set up coordinator
                    console.log('DEBUG: Setting up vgplot coordinator...');
                    const coordinator = vg.coordinator();
                    coordinator.databaseConnector(
                        vg.wasmConnector({
                            duckdb: db,
                            connection: connRef.current,
                        })
                    );

                    // Create brush selection
                    const brushSelection = vg.Selection.intersect();
                    setBrush(brushSelection as BrushValue);

                    // Create plot using the view with proper date formatting
                    console.log('DEBUG: Creating plot element...');
                    console.log('DEBUG: Range for plotting:', {
                        min_time: range.min_time,
                        max_time: range.max_time
                    });

                    // @ts-ignore
                    const plotElement = vg.plot(
                        vg.rectY(
                            vg.from("histogram_view"),
                            {
                                x: vg.bin("time", {
                                    maxbins: 50,
                                    extent: [range.min_time, range.max_time]
                                }),
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

                    // Mount plot
                    console.log('DEBUG: Mounting plot...');
                    plotRef.current.innerHTML = '';
                    plotRef.current.appendChild(plotElement);
                    setDataLoaded(true);
                    console.log('DEBUG: Plot mounted successfully');
                } catch (err) {
                    console.error('DEBUG: Error in data range processing:', err);
                    throw err;
                }
            } catch (error) {
                console.error('DEBUG: Error creating plot:', error);
                setError(error instanceof Error ? error.message : 'An unknown error occurred');
            }
        };

        createPlot();

        // Cleanup connection on unmount
        return () => {
            if (connRef.current) {
                connRef.current.close();
            }
        };
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
                            // Format the brush values for proper display
                            const startTime = formatDate(brush.value[0]);
                            const endTime = formatDate(brush.value[1]);

                            console.log(`DEBUG: Selected time range: ${startTime} to ${endTime}`);

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