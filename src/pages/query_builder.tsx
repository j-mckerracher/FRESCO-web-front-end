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
    if (!db) {
      setError("DuckDB not initialized");
      return;
    }

    try {
      const conn = await db.connect();

      // Create job_data_small table with explicit schema
      await conn.query("DROP TABLE IF EXISTS job_data_small");
      await conn.query(`
        CREATE TABLE job_data_small (
          time TIMESTAMP,
          submit_time TIMESTAMP,
          start_time TIMESTAMP,
          end_time TIMESTAMP,
          timelimit DOUBLE,
          nhosts BIGINT,
          ncores BIGINT,
          account VARCHAR,
          queue VARCHAR,
          host VARCHAR,
          jid VARCHAR,
          unit VARCHAR,
          jobname VARCHAR,
          exitcode VARCHAR,
          host_list VARCHAR,
          username VARCHAR,
          value_cpuuser DOUBLE,
          value_gpu DOUBLE,
          value_memused DOUBLE,
          value_memused_minus_diskcache DOUBLE,
          value_nfs DOUBLE,
          value_block DOUBLE
        )`);

      if (!loading) {
        // Load data from S3 directly into the table
        await startSingleQuery(
            "SELECT time FROM s3_fresco WHERE time BETWEEN '2023-02-01' AND '2023-03-01'",
            db,
            "job_data_small",
            1000000
        );

        // Now create and populate histogram table
        await conn.query("DROP TABLE IF EXISTS histogram");
        await conn.query("CREATE TABLE histogram AS SELECT time FROM job_data_small ORDER BY time");

        // Verify data was loaded
        const result = await conn.query("SELECT COUNT(*) as count FROM histogram");
        const count = result.toArray()[0].count;
        console.log(`Loaded ${count} rows into histogram table`);

        if (count === 0) {
          throw new Error("No data was loaded into the histogram table");
        }

        await conn.query("LOAD icu");
        await conn.query("SET TimeZone='America/New_York'");

        setHistogramData(true);
      }

      conn.close();
    } catch (err) {
      console.error("Error loading histogram data:", err);
      setError(err instanceof Error ? err.message : "Unknown error loading data");
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