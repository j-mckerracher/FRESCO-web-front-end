// src/pages/query_builder.tsx

import Header from "@/components/Header";
import Histogram from "@/components/query_builder/histogram";
import { startSingleQuery } from "@/util/client";
import { useDuckDb } from "duckdb-wasm-kit";
import { useCallback, useEffect, useState } from "react";
import dynamic from 'next/dynamic';

const LoadingAnimation = dynamic(
    () => import('@/components/LoadingAnimation'),
    {
        ssr: false,
        loading: () => (
            <div className="fixed inset-0 flex flex-col items-center justify-center bg-black z-50">
                <div className="w-12 h-12 rounded-full bg-purdue-boilermakerGold animate-ping" />
                <p className="mt-4 text-xl text-white">Initializing...</p>
            </div>
        )
    }
);

// Define loading stages with weights
const LOADING_STAGES = {
    INITIALIZING: { name: 'Initializing database connection', weight: 5 },
    SETUP: { name: 'Setting up environment', weight: 5 },
    CLEANUP: { name: 'Cleaning up existing data', weight: 5 },
    DATA_LOAD: { name: 'Loading data from source', weight: 70 },
    HISTOGRAM: { name: 'Creating histogram table', weight: 10 },
    VIEW: { name: 'Setting up data view', weight: 5 }
};

const QueryBuilder = () => {
    const { db, loading } = useDuckDb();
    const [histogramData, setHistogramData] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingStage, setLoadingStage] = useState(LOADING_STAGES.INITIALIZING.name);
    const [progress, setProgress] = useState(0);

    const updateProgress = (stage: keyof typeof LOADING_STAGES, subProgress = 100) => {
        const stages = Object.keys(LOADING_STAGES);
        const currentStageIndex = stages.indexOf(stage);
        const previousStagesWeight = stages
            .slice(0, currentStageIndex)
            .reduce((sum, s) => sum + LOADING_STAGES[s as keyof typeof LOADING_STAGES].weight, 0);

        const currentStageWeight = LOADING_STAGES[stage as keyof typeof LOADING_STAGES].weight;
        const currentProgress = (previousStagesWeight + (currentStageWeight * subProgress / 100));

        setLoadingStage(LOADING_STAGES[stage as keyof typeof LOADING_STAGES].name);
        setProgress(Math.round(currentProgress));
    };

    const getParquetFromAPI = useCallback(async () => {
        if (!db) {
            setError("DuckDB not initialized");
            return;
        }

        let conn = null;
        try {
            updateProgress('INITIALIZING');
            conn = await db.connect();

            updateProgress('SETUP');
            await conn.query("LOAD icu");
            await conn.query("SET TimeZone='America/New_York'");

            updateProgress('CLEANUP');
            try {
                await conn.query("DROP VIEW IF EXISTS histogram_view");
                await conn.query("DROP TABLE IF EXISTS job_data_small");
                await conn.query("DROP TABLE IF EXISTS histogram");
            } catch (e) {
                console.log('No existing tables/views to drop');
            }

            if (!loading) {
                const onDataProgress = (loadProgress: number) => {
                    updateProgress('DATA_LOAD', loadProgress);
                };

                await startSingleQuery(
                    "SELECT * FROM s3_fresco WHERE time BETWEEN '2023-02-01' AND '2023-02-14'",
                    db,
                    "job_data_small",
                    1000000,
                    onDataProgress
                );

                updateProgress('HISTOGRAM');
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

                updateProgress('VIEW');
                await conn.query(`
                    CREATE VIEW histogram_view AS 
                    SELECT * FROM histogram
                `);

                const viewStats = await conn.query(`
                    SELECT COUNT(*) as count FROM histogram_view
                `);
                const count = viewStats.toArray()[0].count;

                if (count === 0) {
                    throw new Error("No data was loaded into histogram view");
                }

                setHistogramData(true);
            }
        } catch (err) {
            console.error("Error in getParquetFromAPI:", err);
            setError(err instanceof Error ? err.message : "Unknown error loading data");
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
                    <LoadingAnimation
                        currentStage={loadingStage}
                        progress={progress}
                    />
                ) : (
                    <Histogram readyToPlot={!loading && histogramData && !!db} />
                )}
            </div>
        </div>
    );
};

export default QueryBuilder;