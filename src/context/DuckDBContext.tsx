// src/context/DuckDBContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { AsyncDuckDB } from 'duckdb-wasm-kit';
import { useDuckDb } from 'duckdb-wasm-kit';
import * as vg from '@uwdata/vgplot';
import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

interface DuckDBContextType {
    db: AsyncDuckDB | null;
    loading: boolean;
    error: Error | null;
    dataloading: boolean;
    setDataLoading: (loading: boolean) => void;
    histogramData: boolean;
    setHistogramData: (data: boolean) => void;
    crossFilter: any;
    setCrossFilter: (filter: any) => void;
    connection: AsyncDuckDBConnection | null;
    createConnection: () => Promise<AsyncDuckDBConnection | null>;
}

const DuckDBContext = createContext<DuckDBContextType>({
    db: null,
    loading: true,
    error: null,
    dataloading: true,
    setDataLoading: () => {},
    histogramData: false,
    setHistogramData: () => {},
    crossFilter: null,
    setCrossFilter: () => {},
    connection: null,
    createConnection: async () => null
});

export const useDuckDB = () => useContext(DuckDBContext);

interface DuckDBProviderProps {
    children: ReactNode;
}

// Create a single instance of DuckDB that persists across renders
let duckDBInstance: AsyncDuckDB | null = null;
let connectionInstance: AsyncDuckDBConnection | null = null;

export const DuckDBProvider: React.FC<DuckDBProviderProps> = ({ children }) => {
    // Use duckDBKit but keep our persistent instance if it exists
    const duckDBKit = useDuckDb();

    // Create state for other variables we need to track
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [dataloading, setDataLoading] = useState(true);
    const [histogramData, setHistogramData] = useState(false);
    const [crossFilter, setCrossFilter] = useState<any>(null);

    // Initialize the database once
    useEffect(() => {
        const initDB = async () => {
            try {
                // If we already have a DB instance, use it
                if (duckDBInstance) {
                    setLoading(false);
                    return;
                }

                // Wait for duckDBKit to initialize
                if (!duckDBKit.loading && duckDBKit.db) {
                    console.log('DuckDB initialized successfully');
                    duckDBInstance = duckDBKit.db;
                    setLoading(false);

                    // Initialize a reusable connection
                    try {
                        connectionInstance = await duckDBInstance.connect();
                        await connectionInstance.query("LOAD icu");
                        await connectionInstance.query("SET TimeZone='America/New_York'");
                    } catch (err) {
                        console.warn('Initial connection setup error:', err);
                    }
                }
            } catch (err) {
                console.error('Error initializing DuckDB:', err);
                setError(err instanceof Error ? err : new Error('Unknown error initializing DuckDB'));
                setLoading(false);
            }
        };

        initDB();
    }, [duckDBKit.db, duckDBKit.loading]);

    // Function to get or create a connection
    const createConnection = async (): Promise<AsyncDuckDBConnection | null> => {
        if (!duckDBInstance) return null;

        try {
            // Create a new connection if needed
            if (!connectionInstance) {
                console.log('DEBUG: Creating new DuckDB connection');
                connectionInstance = await duckDBInstance.connect();

                // Apply all necessary settings
                await connectionInstance.query("LOAD icu");
                await connectionInstance.query("SET TimeZone='America/New_York'");

                // Additional settings for stability
                await connectionInstance.query("PRAGMA threads=4");
                await connectionInstance.query("PRAGMA memory_limit='2GB'");

                console.log('DEBUG: DuckDB connection initialized with settings');
            }

            return connectionInstance;
        } catch (err) {
            console.error('Error creating connection:', err);
            return null;
        }
    };

    return (
        <DuckDBContext.Provider
            value={{
                db: duckDBInstance,
                loading,
                error,
                dataloading,
                setDataLoading,
                histogramData,
                setHistogramData,
                crossFilter,
                setCrossFilter,
                connection: connectionInstance,
                createConnection
            }}
        >
            {children}
        </DuckDBContext.Provider>
    );
};