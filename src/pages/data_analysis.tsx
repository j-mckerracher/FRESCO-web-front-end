import { useCallback, useEffect, useRef, useState } from "react";
import * as vg from "@uwdata/vgplot";
import VgPlot from "@/components/vgplot";
import { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { PlotType } from "@/components/component_types";
import MultiSelect from "@/components/multi-select";
import Vgmenu from "@/components/vgmenu";
import dynamic from 'next/dynamic';
import { exportDataAsCSV } from "@/util/export";
import { useDuckDB } from "@/context/DuckDBContext";
import { useNavigation } from "@/util/navigation";
import { column_pretty_names } from "@/components/vgplot";

// Import LoadingAnimation with no SSR
const LoadingAnimation = dynamic(() => import('@/components/LoadingAnimation'), {
    ssr: false,
    loading: () => (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black z-50">
            <div className="w-12 h-12 rounded-full bg-purdue-boilermakerGold animate-ping" />
            <p className="mt-4 text-xl text-white">Loading data...</p>
        </div>
    )
});

const COLUMN_NAMES = [
    { value: "time", label: "Time", numerical: true, linePlot: false },
    { value: "nhosts", label: "Number of Hosts", numerical: true, linePlot: false },
    { value: "ncores", label: "Number of Cores", numerical: true, linePlot: false },
    { value: "account", label: "Account", numerical: false, linePlot: false },
    { value: "queue", label: "Queue", numerical: false, linePlot: false },
    { value: "host", label: "Host", numerical: false, linePlot: false },
    { value: "value_cpuuser", label: "CPU Usage", numerical: true, linePlot: true },
    { value: "value_gpu", label: "GPU Usage", numerical: true, linePlot: true },
    { value: "value_memused", label: "Memory Used", numerical: true, linePlot: true },
    { value: "value_memused_minus_diskcache", label: "Memory Used Minus Disk Cache", numerical: true, linePlot: true },
    { value: "value_nfs", label: "NFS Usage", numerical: true, linePlot: true },
    { value: "value_block", label: "Block Usage", numerical: true, linePlot: true }
];

const value_to_numerical = new Map(
    COLUMN_NAMES.map((col) => [col.value, col.numerical])
);

const DataAnalysisPage = () => {
    console.log('DataAnalysis component rendered');

    // Use the context instead of the hook directly
    const {
        db,
        loading,
        error,
        dataloading,
        setDataLoading,
        histogramData,
        setHistogramData,
        crossFilter,
        setCrossFilter
    } = useDuckDB();

    const [loadError, setLoadError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [histogramColumns, setHistogramColumns] = useState<
        { value: string; label: string }[]
    >([{ value: "time", label: "Time" }]);
    const [linePlotColumns, setLinePlotColumns] = useState<
        { value: string; label: string }[]
    >([]);
    const [availableColumns, setAvailableColumns] = useState<string[]>([]);
    const [dataTableName, setDataTableName] = useState<string>("job_data");
    const conn = useRef<AsyncDuckDBConnection | undefined>(undefined);
    const { navigate } = useNavigation();

    // Function to check which columns are actually available in the database
    const checkAvailableColumns = async () => {
        if (!conn.current) return;

        try {
            console.log("Checking available columns in job_data table...");

            // Query the table schema
            const schemaCheck = await conn.current.query(`
        SELECT * FROM job_data LIMIT 0
      `);

            // Extract column names from schema
            const columns = schemaCheck.schema.fields.map(f => f.name);
            console.log("Available columns:", columns);

            // Update state with available columns
            setAvailableColumns(columns);

            // Log which expected columns are missing
            const expectedColumns = [
                "value_cpuuser", "value_gpu", "value_memused",
                "value_memused_minus_diskcache", "value_nfs", "value_block"
            ];

            const missingColumns = expectedColumns.filter(col => !columns.includes(col));
            if (missingColumns.length > 0) {
                console.warn("Missing expected columns:", missingColumns);
            }
        } catch (err) {
            console.error("Error checking available columns:", err);
        }
    };

    // Function to add missing columns as a view with default values
    const addMissingColumns = async () => {
        if (!conn.current) return;

        try {
            console.log("Adding missing columns as view...");

            // Check which columns we need to add
            const expectedColumns = [
                "value_cpuuser", "value_gpu", "value_memused",
                "value_memused_minus_diskcache", "value_nfs", "value_block"
            ];

            const missingColumns = expectedColumns.filter(col => !availableColumns.includes(col));

            if (missingColumns.length === 0) {
                console.log("No missing columns need to be added");
                setDataTableName("job_data");
                return;
            }

            console.log("Creating view with missing columns:", missingColumns);

            // Create SQL for missing columns with zeros
            const missingColumnsSql = missingColumns.map(col => `0 as ${col}`).join(', ');

            // Create view with all existing columns plus missing ones
            await conn.current.query(`
        DROP VIEW IF EXISTS job_data_with_missing;
        CREATE VIEW job_data_with_missing AS
        SELECT
          *,
          ${missingColumnsSql}
        FROM job_data;
      `);

            console.log("Created view with missing columns");

            // Check the view to make sure all columns are present
            const viewCheck = await conn.current.query(`
        SELECT * FROM job_data_with_missing LIMIT 1
      `);

            const viewColumns = viewCheck.schema.fields.map(f => f.name);
            console.log("Columns in enhanced view:", viewColumns);

            // Update availableColumns
            setAvailableColumns(viewColumns);

            // Update dataTableName to use the view
            setDataTableName("job_data_with_missing");

        } catch (err) {
            console.error("Error adding missing columns:", err);
        }
    };

    const handleDownload = async () => {
        if (!conn.current) {
            alert("Database connection not available");
            return;
        }

        try {
            setDownloading(true);

            // Get the SQL query from localStorage
            const sqlQuery = localStorage.getItem("SQLQuery");
            let fileName = "fresco-data";
            let filters = "";

            // If we have a stored query, extract the date range for the filename and filter
            if (sqlQuery) {
                console.log("Using stored query for CSV export:", sqlQuery);

                // Extract date range from the SQL query using regex
                const dateRangeMatch = sqlQuery.match(/time BETWEEN '([^']+)' AND '([^']+)'/i);

                if (dateRangeMatch && dateRangeMatch.length >= 3) {
                    const startDate = new Date(dateRangeMatch[1]);
                    const endDate = new Date(dateRangeMatch[2]);

                    // Format dates for filename: YYYY-MM-DD
                    const startStr = startDate.toISOString().split('T')[0];
                    const endStr = endDate.toISOString().split('T')[0];

                    // Use date range in filename
                    fileName = `fresco-data-${startStr}_to_${endStr}`;

                    // Create filter for the CSV export
                    filters = `time BETWEEN '${dateRangeMatch[1]}' AND '${dateRangeMatch[2]}'`;

                    console.log(`Using date range filter: ${filters}`);
                    console.log(`Using filename: ${fileName}.csv`);
                } else {
                    console.warn("Could not extract date range from query, using default filename");
                }
            } else {
                console.warn("No stored query found, exporting all data with current date");
                // Fallback to current date if no query is stored
                const now = new Date();
                const dateString = now.toISOString().split('T')[0];
                fileName = `fresco-data-${dateString}`;
            }

            // Pass the filters to the export function
            await exportDataAsCSV(conn.current, dataTableName, fileName, filters);

            console.log("CSV export completed successfully");
        } catch (error) {
            console.error("Download error:", error);
            alert("Failed to download data: " + (error instanceof Error ? error.message : "Unknown error"));
        } finally {
            setDownloading(false);
        }
    };

    // Function to create sample data
    const createDemoData = async (connection: AsyncDuckDBConnection) => {
        try {
            console.log("Creating demo data...");

            // First drop existing tables if they exist
            await connection.query("DROP TABLE IF EXISTS job_data");

            // Create the job_data table
            await connection.query(`
        CREATE TABLE job_data (
          time TIMESTAMP,
          nhosts BIGINT,
          ncores BIGINT,
          account VARCHAR,
          queue VARCHAR,
          host VARCHAR,
          value_cpuuser DOUBLE,
          value_gpu DOUBLE,
          value_memused DOUBLE,
          value_memused_minus_diskcache DOUBLE,
          value_nfs DOUBLE,
          value_block DOUBLE
        )
      `);

            // Generate demo data
            const now = new Date();
            const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

            // Create data points
            const timeRange = now.getTime() - startDate.getTime();
            const pointCount = 500;

            // Create values for a single batch insert
            const values = [];
            for (let i = 0; i < pointCount; i++) {
                const pointTime = new Date(startDate.getTime() + (timeRange * (i / pointCount)));
                const cpuValue = 50 + 40 * Math.sin(i / (pointCount / 10));
                const memValue = 30 + 20 * Math.cos(i / (pointCount / 15));
                const blockValue = 25 + 15 * Math.sin(i / (pointCount / 8)); // Add block value

                values.push(`('${pointTime.toISOString()}', 
          ${1 + Math.floor(Math.random() * 4)}, 
          ${4 + Math.floor(Math.random() * 28)}, 
          'research_${["cs", "physics", "bio"][Math.floor(Math.random() * 3)]}', 
          '${["normal", "high", "low"][Math.floor(Math.random() * 3)]}', 
          'node${100 + Math.floor(Math.random() * 100)}', 
          ${cpuValue}, 
          ${Math.random() > 0.9 ? 'NULL' : Math.random() * 10}, 
          ${memValue},
          ${memValue * 0.8},
          ${Math.random() * 5},
          ${blockValue})`);
            }

            // Insert in smaller batches to avoid query size limits
            const batchSize = 100;
            for (let i = 0; i < values.length; i += batchSize) {
                const batch = values.slice(i, i + batchSize);
                const batchQuery = `
          INSERT INTO job_data (time, nhosts, ncores, account, queue, host, value_cpuuser, value_gpu, value_memused, value_memused_minus_diskcache, value_nfs, value_block)
          VALUES ${batch.join(",")};
        `;
                await connection.query(batchQuery);
            }

            console.log(`Created demo data with ${pointCount} points`);

            // Verify data was loaded
            const countCheck = await connection.query("SELECT COUNT(*) as count FROM job_data");
            const rowCount = countCheck.toArray()[0].count;
            console.log(`Loaded ${rowCount} rows into job_data table`);

            if (rowCount === 0) {
                throw new Error("Failed to create demo data");
            }

            return true;
        } catch (err) {
            console.error("Error creating demo data:", err);
            throw err;
        }
    };

    // Function to load data, with option to force demo data
    const loadData = useCallback(async (useDemoData = false) => {
        console.log('loadData called:', {
            loading,
            db: !!db,
            dataloading,
            conn: !!conn.current,
            useDemoData,
            histogramData
        });

        if (!loading && db && dataloading) {
            try {
                console.log('Starting data load');
                setDataLoading(true);
                setLoadError(null);

                // Close any existing connection
                if (conn.current) {
                    await conn.current.close();
                }

                // Create a new connection
                conn.current = await db.connect();

                // Set up environment
                await conn.current.query("LOAD icu");
                await conn.current.query("SET TimeZone='America/New_York'");

                // If using demo data or no query exists, create demo data directly
                let shouldCreateDemoData = useDemoData;
                let dataLoaded = false;

                if (!shouldCreateDemoData) {
                    console.log("Checking for job_data_small table...");

                    // First, check if job_data_small exists by actually running a query
                    // This is more reliable than checking for existence
                    try {
                        // First check if job_data already exists
                        const existingCheck = await conn.current.query(`
              SELECT name FROM sqlite_master 
              WHERE type='table' AND name='job_data'
            `);

                        if (existingCheck.toArray().length === 0) {
                            // Now check for job_data_small
                            const result = await conn.current.query(`
                SELECT COUNT(*) as count FROM job_data_small
              `);

                            const count = result.toArray()[0].count;
                            console.log(`Found job_data_small table with ${count} rows`);

                            if (count > 0) {
                                // Copy the data directly into job_data
                                console.log("Creating job_data from job_data_small...");
                                await conn.current.query(`
                  CREATE TABLE job_data AS
                  SELECT * FROM job_data_small
                `);

                                // Verify copy was successful
                                const verifyResult = await conn.current.query(`
                  SELECT COUNT(*) as count FROM job_data
                `);

                                const newCount = verifyResult.toArray()[0].count;
                                console.log(`Successfully created job_data with ${newCount} rows`);

                                if (newCount > 0) {
                                    dataLoaded = true;
                                } else {
                                    throw new Error("job_data was created but has 0 rows");
                                }
                            } else {
                                console.log("job_data_small exists but is empty");
                            }
                        } else {
                            // job_data already exists, check if it has data
                            const countCheck = await conn.current.query("SELECT COUNT(*) as count FROM job_data");
                            const rowCount = countCheck.toArray()[0].count;

                            if (rowCount > 0) {
                                console.log(`job_data already exists with ${rowCount} rows`);
                                dataLoaded = true;
                            }
                        }
                    } catch (err) {
                        console.log("Table check error:", err);
                        // If job_data_small doesn't exist, we'll handle that later
                    }
                }

                // If we haven't loaded data yet, create demo data
                if (!dataLoaded) {
                    console.log("No data loaded yet, creating demo data");
                    await createDemoData(conn.current);
                }

                // Verify data was loaded
                const countCheck = await conn.current.query("SELECT COUNT(*) as count FROM job_data");
                const rowCount = countCheck.toArray()[0].count;

                if (rowCount === 0) {
                    throw new Error("No data available for analysis");
                }

                console.log(`Final row count: ${rowCount} rows in job_data table`);

                // Initialize crossfilter before setting up the coordinator
                const newCrossFilter = vg.Selection.crossfilter();
                setCrossFilter(newCrossFilter);

                // Set up the coordinator
                console.log("Setting up vgplot coordinator");
                vg.coordinator().databaseConnector(
                    vg.wasmConnector({
                        duckdb: db,
                        connection: conn.current,
                    })
                );

                // Check available columns and add missing ones if needed
                checkAvailableColumns();
                addMissingColumns();

                console.log('Data load complete');
                setDataLoading(false);
            } catch (err) {
                console.error('Error in loadData:', err);
                setLoadError(err instanceof Error ? err.message : 'Unknown error loading data');
                setDataLoading(false);
            }
        }
        if (error) {
            console.error('DuckDB Error:', error);
            setLoadError('Database error: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
    }, [dataloading, db, error, loading, histogramData, setCrossFilter, setDataLoading]);

    useEffect(() => {
        loadData(false);
    }, [loadData]);

    // Log whenever loading state changes
    const shouldShowLoading = !db || !conn.current || dataloading;

    console.log('Loading state:', {
        shouldShowLoading,
        db: !!db,
        conn: !!conn.current,
        dataloading,
        loading
    });

    const handleRetry = () => {
        setDataLoading(true);
        setLoadError(null);
        // Force using demo data
        loadData(true);
    };

    return (
        <div className="bg-black min-h-screen flex flex-col">
            {shouldShowLoading ? (
                <>
                    {console.log('Rendering loading state')}
                    <LoadingAnimation />
                </>
            ) : loadError ? (
                <div className="flex flex-col items-center justify-center p-8 text-white">
                    <div className="bg-zinc-900 p-6 rounded-lg max-w-2xl text-center">
                        <h2 className="text-2xl text-red-500 mb-4">Error Loading Data</h2>
                        <p className="mb-6">{loadError}</p>
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={handleRetry}
                                className="px-4 py-2 bg-purdue-boilermakerGold text-black rounded-md">
                                Try Again with Demo Data
                            </button>
                            <button
                                onClick={() => navigate('/query_builder')}
                                className="px-4 py-2 bg-gray-700 text-white rounded-md">
                                Return to Query Builder
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {console.log('Rendering main content')}
                    {/* Add download button at the top */}
                    <div className="flex justify-end p-4">
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className={`px-4 py-2 rounded-md transition-colors ${
                                downloading
                                    ? 'bg-gray-500 cursor-not-allowed'
                                    : 'bg-purdue-boilermakerGold text-black hover:bg-purdue-rush'
                            }`}
                        >
                            {downloading ? 'Downloading...' : 'Download Data as CSV'}
                        </button>
                    </div>

                    <div className="flex flex-row-reverse min-w-scren">
                        <div className="w-1/4 px-4 flex flex-col gap-4">
                            <div>
                                <h1 className="text-white text-lg">Choose columns to show as histograms:</h1>
                                <MultiSelect
                                    options={COLUMN_NAMES.filter(item =>
                                        availableColumns.includes(item.value)
                                    )}
                                    selected={histogramColumns.filter(col =>
                                        availableColumns.includes(col.value)
                                    )}
                                    onChange={setHistogramColumns}
                                    className=""
                                />
                            </div>
                            <div>
                                <h1 className="text-white text-lg">Choose columns to show as line plots:</h1>
                                <MultiSelect
                                    options={COLUMN_NAMES.filter((item) =>
                                        item.linePlot && availableColumns.includes(item.value)
                                    )}
                                    selected={linePlotColumns.filter(col =>
                                        availableColumns.includes(col.value)
                                    )}
                                    onChange={setLinePlotColumns}
                                    className=""
                                />
                            </div>
                            <Vgmenu
                                db={db}
                                conn={conn.current}
                                crossFilter={crossFilter}
                                dbLoading={loading}
                                dataLoading={dataloading}
                                tableName={dataTableName}
                                columnName={"host"}
                                width={1200}
                                label={"Choose a specific host: "}
                            />
                        </div>
                        <div className="flex gap-y-6 flex-row flex-wrap min-w-[25%] max-w-[75%] justify-between px-5">
                            {histogramColumns.map((col) => (
                                <VgPlot
                                    key={col.value}
                                    db={db}
                                    conn={conn.current}
                                    crossFilter={crossFilter}
                                    dbLoading={loading}
                                    dataLoading={dataloading}
                                    tableName={dataTableName}
                                    columnName={col.value}
                                    width={0.75}
                                    height={0.4}
                                    plotType={
                                        value_to_numerical.get(col.value)
                                            ? PlotType.NumericalHistogram
                                            : PlotType.CategoricalHistogram
                                    }
                                />
                            ))}
                            {linePlotColumns.map((col) => (
                                <div key={col.value} className="w-full mb-12 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
                                    <h2 className="text-xl text-center mb-4 text-purdue-boilermakerGold">
                                        {column_pretty_names.get(col.value) || col.value} over Time
                                    </h2>
                                    <VgPlot
                                        db={db}
                                        conn={conn.current}
                                        crossFilter={crossFilter}
                                        dbLoading={loading}
                                        dataLoading={dataloading}
                                        tableName={dataTableName}
                                        xAxis="time"
                                        columnName={col.value}
                                        width={0.75}
                                        height={0.6}
                                        plotType={PlotType.LinePlot}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default DataAnalysisPage;
export { column_pretty_names };