import Header from "@/components/Header";
import Histogram from "@/components/query_builder/histogram";
import { startSingleQuery } from "@/util/client";
import { useDuckDb } from "duckdb-wasm-kit";
import { useCallback, useEffect, useState } from "react";
import { BounceLoader } from "react-spinners";

const QueryBuilder = () => {
  const { db, loading } = useDuckDb();
  const [histogramData, setHistogramData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getParquetFromAPI = useCallback(async () => {
    console.log('=== Starting getParquetFromAPI ===');
    if (!db) {
      console.error("DuckDB not initialized");
      setError("DuckDB not initialized");
      return;
    }

    let conn = null;
    try {
      console.log('Creating initial database connection...');
      conn = await db.connect();

      // List current tables before cleanup
      console.log('Tables before cleanup:');
      const beforeTables = await conn.query('SHOW TABLES');
      console.log(beforeTables.toArray());

      console.log('Dropping existing tables...');
      await conn.query("DROP TABLE IF EXISTS job_data_small");
      await conn.query("DROP TABLE IF EXISTS histogram");

      // Verify tables were dropped
      console.log('Tables after cleanup:');
      const afterTables = await conn.query('SHOW TABLES');
      console.log(afterTables.toArray());

      if (!loading) {
        console.log('Starting data load process...');
        await startSingleQuery(
            "SELECT * FROM s3_fresco WHERE time BETWEEN '2023-02-01' AND '2023-03-01'",
            db,
            "job_data_small",
            1000000
        );

        // Check job_data_small
        console.log('Verifying job_data_small...');
        const jobDataCount = await conn.query("SELECT COUNT(*) as count FROM job_data_small");
        const count = jobDataCount.toArray()[0].count;
        console.log(`job_data_small contains ${count} rows`);

        if (count === 0) {
          throw new Error("job_data_small is empty after data load");
        }

        // Sample check
        console.log('Sample from job_data_small:');
        const sample = await conn.query("SELECT * FROM job_data_small LIMIT 3");
        console.log(sample.toArray());

        console.log('Creating histogram table...');
        const histConn = await db.connect();
        try {
          await histConn.query(`
                    CREATE TABLE histogram AS 
                    SELECT time 
                    FROM job_data_small 
                    WHERE time IS NOT NULL 
                    ORDER BY time
                `);

          // Verify histogram data
          console.log('Verifying histogram data...');
          const histResult = await histConn.query("SELECT COUNT(*) as count FROM histogram");
          const histCount = histResult.toArray()[0].count;
          console.log(`Histogram table contains ${histCount} rows`);

          if (histCount === 0) {
            throw new Error("No data was loaded into histogram table");
          }

          // Sample check
          console.log('Sample from histogram:');
          const histSample = await histConn.query("SELECT * FROM histogram LIMIT 3");
          console.log(histSample.toArray());

          await histConn.query("LOAD icu");
          await histConn.query("SET TimeZone='America/New_York'");

          setHistogramData(true);
        } catch (histErr) {
          console.error('Error creating histogram:', histErr);
          throw histErr;
        } finally {
          histConn.close();
        }
      }
    } catch (err) {
      console.error("Error in getParquetFromAPI:", err);
      setError(err instanceof Error ? err.message : "Unknown error loading data");

      // Diagnostic logging
      try {
        const debugConn = await db.connect();
        console.log('\n=== Debug Information ===');

        // Check available tables
        console.log('Available tables:');
        const tables = await debugConn.query("SHOW TABLES");
        console.log(tables.toArray());

        // Inspect each table
        for (const table of tables.toArray()) {
          const tableName = table[0];
          try {
            console.log(`\nInspecting table: ${tableName}`);

            // Get schema
            console.log('Schema:');
            const schema = await debugConn.query(`DESCRIBE ${tableName}`);
            console.log(schema.toArray());

            // Get row count
            const count = await debugConn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
            console.log(`Row count: ${count.toArray()[0].count}`);

            // Get sample data
            console.log('Sample data:');
            const sample = await debugConn.query(`SELECT * FROM ${tableName} LIMIT 2`);
            console.log(sample.toArray());
          } catch (tableErr) {
            console.error(`Error inspecting table ${tableName}:`, tableErr);
          }
        }
        debugConn.close();
      } catch (debugErr) {
        console.error('Error during debug logging:', debugErr);
      }
    } finally {
      if (conn) {
        conn.close();
      }
    }
  }, [db, loading]);

  useEffect(() => {
    if (db && !loading && !histogramData) {
      getParquetFromAPI();
    }
  }, [db, getParquetFromAPI, histogramData, loading]);

  return (
      <div className="bg-black min-h-screen flex flex-col">
        <Header />
        <div className="text-white p-2">
          {loading || !histogramData || !db ? (
              <div className="flex flex-col justify-center align-middle min-h-[40vh] w-full">
                <BounceLoader
                    loading={!loading}
                    color="#FFFFFF"
                    cssOverride={{
                      margin: "auto",
                    }}
                />
                <p className="m-auto text-xl">Loading data...</p>
                {error && (
                    <p className="m-auto text-red-500 mt-4">Error: {error}</p>
                )}
              </div>
          ) : (
              <Histogram readyToPlot={!loading && histogramData && !!db} />
          )}
        </div>
      </div>
  );
};

export default QueryBuilder;