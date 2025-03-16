// src/views/DataAnalysisPage.tsx
"use client";
import * as vg from "@uwdata/vgplot";
import VgPlot from "@/components/vgplot";
import { useCallback, useEffect, useRef, useState } from "react";
import { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { PlotType } from "@/components/component_types";
import MultiSelect from "@/components/multi-select";
import Vgmenu from "@/components/vgmenu";
import dynamic from 'next/dynamic';
import { exportDataAsCSV } from "@/util/export";
import { useDuckDB } from "@/context/DuckDBContext";
import { useNavigate } from "react-router-dom";

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
  { value: "value_memused", label: "Memory Used", numerical: true, linePlot: true }
];

const value_to_numerical = new Map(
    COLUMN_NAMES.map((col) => [col.value, col.numerical])
);

const column_to_formatted = new Map([
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
  const conn = useRef<AsyncDuckDBConnection | undefined>(undefined);
  const navigate = useNavigate();

  // Handle CSV download
  const handleDownload = async () => {
    if (!conn.current) {
      alert("Database connection not available");
      return;
    }

    try {
      setDownloading(true);

      // Generate filename with date
      const now = new Date();
      const dateString = now.toISOString().split('T')[0];
      const fileName = `fresco-data-${dateString}`;

      // Note: We're not applying any filters - this downloads all data
      await exportDataAsCSV(conn.current, "job_data", fileName);
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
          value_memused DOUBLE
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

        values.push(`('${pointTime.toISOString()}', 
          ${1 + Math.floor(Math.random() * 4)}, 
          ${4 + Math.floor(Math.random() * 28)}, 
          'research_${["cs", "physics", "bio"][Math.floor(Math.random() * 3)]}', 
          '${["normal", "high", "low"][Math.floor(Math.random() * 3)]}', 
          'node${100 + Math.floor(Math.random() * 100)}', 
          ${cpuValue}, 
          ${memValue})`);
      }

      // Insert in smaller batches to avoid query size limits
      const batchSize = 100;
      for (let i = 0; i < values.length; i += batchSize) {
        const batch = values.slice(i, i + batchSize);
        const batchQuery = `
          INSERT INTO job_data (time, nhosts, ncores, account, queue, host, value_cpuuser, value_memused)
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
                        options={COLUMN_NAMES}
                        selected={histogramColumns}
                        onChange={setHistogramColumns}
                        className=""
                    />
                  </div>
                  <div>
                    <h1 className="text-white text-lg">Choose columns to show as line plots:</h1>
                    <MultiSelect
                        options={COLUMN_NAMES.filter((item) => item.linePlot)}
                        selected={linePlotColumns}
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
                      tableName={"job_data"}
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
                          tableName={"job_data"}
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
                      <VgPlot
                          key={col.value}
                          db={db}
                          conn={conn.current}
                          crossFilter={crossFilter}
                          dbLoading={loading}
                          dataLoading={dataloading}
                          tableName={"job_data"}
                          xAxis="time"
                          columnName={col.value}
                          width={0.75}
                          height={0.4}
                          plotType={PlotType.LinePlot}
                      />
                  ))}
                </div>
              </div>
            </>
        )}
      </div>
  );
};

export default DataAnalysisPage;
export { column_to_formatted as column_pretty_names };