// src/pages/query_builder.tsx
import Header from "@/components/Header";
import Histogram from "@/components/query_builder/histogram";
import { startSingleQuery } from "@/util/client";
import { useDuckDb } from "duckdb-wasm-kit";
import { useCallback, useEffect, useState } from "react";
import dynamic from 'next/dynamic';
import DateRangeSelector from "@/components/query_builder/date_range_selector";

// Configure the maximum allowed time window in days - easily adjustable
const MAX_TIME_WINDOW_DAYS = 30;

// Define workflow steps
enum WorkflowStep {
    DATE_SELECTION,
    HISTOGRAM_VIEW
}

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

    // New state variables for workflow steps
    const [currentStep, setCurrentStep] = useState<WorkflowStep>(WorkflowStep.DATE_SELECTION);
    const [selectedDateRange, setSelectedDateRange] = useState<{start: Date, end: Date} | null>(null);

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
        if (!db || !selectedDateRange) {
            setError("DuckDB not initialized or no date range selected");
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

                // Format dates for SQL query
                const startStr = selectedDateRange.start.toISOString().split('T')[0];
                const endStr = selectedDateRange.end.toISOString().split('T')[0];

                console.log(`Loading data from ${startStr} to ${endStr}`);

                // Use the selected date range in the query
                await startSingleQuery(
                    `SELECT * FROM s3_fresco WHERE time BETWEEN '${startStr}' AND '${endStr}'`,
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
    }, [db, loading, selectedDateRange]);

    useEffect(() => {
        if (db && !loading && !histogramData && selectedDateRange) {
            getParquetFromAPI();
        }
    }, [db, getParquetFromAPI, histogramData, loading, selectedDateRange]);

    // Handler for when user selects a date range and continues
    const handleDateRangeContinue = (startDate: Date, endDate: Date) => {
        setSelectedDateRange({ start: startDate, end: endDate });
        setCurrentStep(WorkflowStep.HISTOGRAM_VIEW);
    };

    // Reset to date selection step
    const handleBackToDateSelection = () => {
        setCurrentStep(WorkflowStep.DATE_SELECTION);
        setHistogramData(false);
    };

    return (
        <div className="bg-black min-h-screen flex flex-col">
            <Header />
            <div className="text-white p-6 flex-1 flex items-center justify-center">
                {currentStep === WorkflowStep.DATE_SELECTION ? (
                    <DateRangeSelector
                        maxTimeWindowDays={MAX_TIME_WINDOW_DAYS}
                        onContinue={handleDateRangeContinue}
                    />
                ) : (
                    <>
                        {loading || !histogramData || !db ? (
                            <LoadingAnimation
                                currentStage={loadingStage}
                                progress={progress}
                            />
                        ) : (
                            <div className="w-full">
                                <div className="mb-4">
                                    <button
                                        onClick={handleBackToDateSelection}
                                        className="text-purdue-boilermakerGold underline hover:text-purdue-dust"
                                    >
                                        ← Change date range
                                    </button>
                                    <p className="text-white text-sm mt-1">
                                        Viewing data from{" "}
                                        <span className="font-semibold">
                                            {selectedDateRange?.start.toLocaleDateString()}
                                        </span>{" "}
                                        to{" "}
                                        <span className="font-semibold">
                                            {selectedDateRange?.end.toLocaleDateString()}
                                        </span>
                                    </p>
                                </div>
                                <Histogram readyToPlot={!loading && histogramData && !!db} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default QueryBuilder;