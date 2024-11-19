"use client";
import Header from "@/components/Header";
import Histogram from "@/components/query_builder/histogram";
import { startSingleQuery } from "@/util/client";
import { useDuckDb } from "duckdb-wasm-kit";
import { useCallback, useEffect, useState } from "react";
import { BounceLoader } from "react-spinners";

const QueryBuilder = () => {
  const { db, loading } = useDuckDb();
  const [histogramData, setHistogramData] = useState(false);

  const getParquetFromAPI = useCallback(async () => {
    const conn = await db?.connect();
    if (conn == undefined) {
      throw new Error("duckdb connection error");
    }
    // await conn.query(
    //   "CREATE TABLE IF NOT EXISTS histogram(bucket_num int, bucket_start TIMESTAMPTZ, bucket_end TIMESTAMPTZ, row_count int)"
    // );

    await conn.query("CREATE TABLE IF NOT EXISTS histogram(time TIMESTAMPTZ)");

    if (db != undefined && !loading) {
      await startSingleQuery(
        "SELECT time FROM job_data_small WHERE time BETWEEN '2023-02-01' AND '2023-03-01'",
        db,
        "histogram",
        1000000
      );
    } else {
      throw new Error("duckdb instance is undefined");
    }

    await conn.query("LOAD icu");
    await conn.query("SET TimeZone='America/New_York'");
    await conn.query("ALTER TABLE histogram ALTER time TYPE TIMESTAMP");
    await setHistogramData(true);
    conn.close();
  }, [db, loading]);

  useEffect(() => {
    if (db != undefined && !loading) {
      if (!histogramData) {
        getParquetFromAPI();
      }
    }
  }, [db, getParquetFromAPI, histogramData, loading]);

  return (
    <div className="bg-black min-h-screen flex flex-col">
      <Header />
      <div className="text-white p-2 ">
        {loading || !histogramData || db == undefined ? (
          <div className="flex flex-col justify-center align-middle min-h-[40vh] w-full">
            <BounceLoader
              loading={!loading}
              color="#FFFFFF"
              cssOverride={{
                margin: "auto",
              }}
            />
            <p className="m-auto text-xl">Loading data...</p>
          </div>
        ) : (
          <Histogram
            readyToPlot={!loading && histogramData && db != undefined}
          />
        )}
      </div>
    </div>
  );
};

export default QueryBuilder;
