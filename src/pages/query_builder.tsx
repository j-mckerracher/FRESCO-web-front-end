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

            // Set up ICU and timezone first
            console.log('Setting up ICU and timezone...');
            await conn.query("LOAD icu");
            await conn.query("SET TimeZone='America/New_York'");

            // List current tables before cleanup
            console.log('Tables before cleanup:');
            const beforeTables = await conn.query('SHOW TABLES');
            console.log(beforeTables.toArray());

            console.log('Dropping existing tables and views...');
            // Drop view first (if exists) to avoid dependency issues
            try {
                await conn.query("DROP VIEW IF EXISTS histogram_view");
            } catch (e) {
                console.log('No existing view to drop');
            }
            await conn.query("DROP TABLE IF EXISTS job_data_small");
            await conn.query("DROP TABLE IF EXISTS histogram");

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

                // Create histogram table
                console.log('Creating histogram table...');
                await conn.query(`
          CREATE TABLE histogram AS 
          WITH preprocessed AS (
            SELECT CAST(time AS TIMESTAMP) as time
            FROM job_data_small 
            WHERE time IS NOT NULL
          )
          SELECT time
          FROM preprocessed
          WHERE time IS NOT NULL
          ORDER BY time
        `);

                // Create the view
                console.log('Creating histogram view...');
                await conn.query(`
          CREATE VIEW histogram_view AS 
          SELECT * FROM histogram
        `);

                // Verify the view works by querying it
                console.log('Verifying view data...');
                const viewStats = await conn.query(`
          SELECT 
            COUNT(*) as count,
            MIN(time) as min_time,
            MAX(time) as max_time,
            COUNT(DISTINCT time) as unique_times
          FROM histogram_view
        `);
                const stats = viewStats.toArray()[0];
                console.log('View statistics:', stats);

                if (stats.count === 0) {
                    throw new Error("No data was loaded into histogram view");
                }

                // Sample check
                console.log('Sample from view:');
                const viewSample = await conn.query("SELECT * FROM histogram_view LIMIT 3");
                console.log(viewSample.toArray());

                setHistogramData(true);
            }
        } catch (err) {
            console.error("Error in getParquetFromAPI:", err);
            setError(err instanceof Error ? err.message : "Unknown error loading data");

            // Diagnostic logging
            try {
                const debugConn = await db.connect();
                console.log('\n=== Debug Information ===');

                console.log('Available tables:');
                const tables = await debugConn.query("SHOW TABLES");
                console.log(tables.toArray());

                // Try to query the view directly
                try {
                    console.log('\nTesting view access:');
                    const viewTest = await debugConn.query("SELECT COUNT(*) FROM histogram_view");
                    console.log('View row count:', viewTest.toArray()[0]);
                } catch (viewErr) {
                    console.error('Error accessing view:', viewErr);
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