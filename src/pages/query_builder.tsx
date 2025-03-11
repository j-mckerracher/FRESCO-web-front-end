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

                // Format dates for SQL query - ensure proper date format with timezone
                const startStr = selectedDateRange.start.toISOString();
                const endStr = selectedDateRange.end.toISOString();

                console.log(`DEBUG: Loading data from ${startStr} to ${endStr}`);
                console.log(`DEBUG: Selected range type - start: ${typeof selectedDateRange.start}, end: ${typeof selectedDateRange.end}`);

                // Use the selected date range in the query with explicit time components
                await startSingleQuery(
                    `SELECT * FROM s3_fresco WHERE time BETWEEN '${startStr}' AND '${endStr}'`,
                    db,
                    "job_data_small",
                    1000000,
                    onDataProgress
                );

                updateProgress('HISTOGRAM');

                // Check raw data
                const dataCheck = await conn.query(`SELECT COUNT(*) as count FROM job_data_small`);
                console.log(`DEBUG: Raw job_data_small row count: ${dataCheck.toArray()[0].count}`);

                // Sample data
                if (dataCheck.toArray()[0].count > 0) {
                    const sampleData = await conn.query(`SELECT time FROM job_data_small LIMIT 5`);
                    console.log(`DEBUG: Sample time values:`, sampleData.toArray().map(row => row.time));
                }

                try {
                    console.log(`DEBUG: Creating histogram table with range ${startStr} to ${endStr}`);

                    // First check if we have data
                    const dataCountQuery = await conn.query(`SELECT COUNT(*) as count FROM job_data_small WHERE time IS NOT NULL`);
                    const dataCount = dataCountQuery.toArray()[0].count;

                    if (dataCount === 0) {
                        throw new Error("No data with valid time values found");
                    }

                    // Create histogram with explicit timestamp conversion
                    await conn.query(`
                        CREATE TABLE histogram AS 
                        SELECT 
                            CAST(time AS TIMESTAMP) as time
                        FROM job_data_small 
                        WHERE time IS NOT NULL
                        ORDER BY time
                    `);

                    // Verify the table was created with data
                    const histogramCount = await conn.query(`SELECT COUNT(*) as count FROM histogram`);
                    console.log(`DEBUG: Histogram table created with ${histogramCount.toArray()[0].count} rows`);

                    // Sample the data to ensure timestamps are correct
                    const sampleHistogram = await conn.query(`SELECT time FROM histogram LIMIT 5`);
                    console.log(`DEBUG: Sample histogram time values:`, sampleHistogram.toArray().map(row => row.time));

                } catch (err) {
                    console.error(`DEBUG: Error creating histogram table:`, err);
                    throw err;
                }

                updateProgress('VIEW');
                await conn.query(`
                    CREATE VIEW histogram_view AS 
                    SELECT * FROM histogram
                `);

                // Debug the histogram view
                const histogramCheck = await conn.query(`SELECT COUNT(*) as count FROM histogram`);
                const viewCheck = await conn.query(`SELECT COUNT(*) as count FROM histogram_view`);
                const histCount = histogramCheck.toArray()[0].count;
                const viewCount = viewCheck.toArray()[0].count;
                console.log(`DEBUG: Histogram table row count: ${histCount}`);
                console.log(`DEBUG: Histogram view row count: ${viewCount}`);

                if (histCount === 0) {
                    console.error(`DEBUG: No data in histogram table!`);
                }

                // Check time range in histogram
                if (histCount > 0) {
                    const rangeCheck = await conn.query(`
                        SELECT MIN(time) as min_time, MAX(time) as max_time FROM histogram
                    `);
                    const range = rangeCheck.toArray()[0];
                    console.log(`DEBUG: Histogram time range: ${range.min_time} to ${range.max_time}`);
                }

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
        console.log(`DEBUG: Date range selected - start: ${startDate.toISOString()}, end: ${endDate.toISOString()}`);
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
                                            {selectedDateRange?.start.toLocaleDateString(undefined, {
                                                year: 'numeric',
                                                month: '2-digit',
                                                day: '2-digit'
                                            })}
                                        </span>{" "}
                                        to{" "}
                                        <span className="font-semibold">
                                            {selectedDateRange?.end.toLocaleDateString(undefined, {
                                                year: 'numeric',
                                                month: '2-digit',
                                                day: '2-digit'
                                            })}
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