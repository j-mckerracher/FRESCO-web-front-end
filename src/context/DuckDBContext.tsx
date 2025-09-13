import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { connectionManager } from '@/util/connectionManager';

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
    executeQuery: (sql: string) => Promise<any>;
    refreshConnection: () => Promise<AsyncDuckDBConnection | null>;
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
    createConnection: async () => null,
    executeQuery: async () => null,
    refreshConnection: async () => null
});

export const useDuckDB = () => useContext(DuckDBContext);

interface DuckDBProviderProps {
    children: ReactNode;
}

// Create a single instance of DuckDB that persists across renders
let duckDBInstance: AsyncDuckDB | null = null;

export const DuckDBProvider: React.FC<DuckDBProviderProps> = ({ children }) => {

    // Create state for other variables we need to track
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [dataloading, setDataLoading] = useState(true);
    const [histogramData, setHistogramData] = useState(false);
    const [crossFilter, setCrossFilter] = useState<any>(null);
    const [currentConnection, setCurrentConnection] = useState<AsyncDuckDBConnection | null>(null);

    // Initialize the database once
    useEffect(() => {
        const initDB = async () => {
            console.log("DuckDBContext: Starting database initialization");
            try {
                // If we already have a DB instance, use it
                if (duckDBInstance) {
                    console.log("DuckDBContext: Using existing DuckDB instance");
                    connectionManager.initialize(duckDBInstance);
                    setLoading(false);
                    return;
                }

                // Initialize DuckDB with the official package
                console.log("DuckDBContext: Initializing DuckDB with official package");

                // Use unpkg CDN for better CORS support in production
                let bundle;
                try {
                    console.log("DuckDBContext: Using unpkg CDN for better production compatibility");

                    // Manual bundle configuration using unpkg URLs (better CORS than jsdelivr)
                    const version = '1.29.0'; // Match the installed version
                    bundle = {
                        mainModule: `https://unpkg.com/@duckdb/duckdb-wasm@${version}/dist/duckdb-browser-eh.wasm`,
                        mainWorker: `https://unpkg.com/@duckdb/duckdb-wasm@${version}/dist/duckdb-browser-eh.worker.js`,
                        pthreadWorker: `https://unpkg.com/@duckdb/duckdb-wasm@${version}/dist/duckdb-browser-coi.pthread.worker.js`
                    };

                    console.log("DuckDBContext: Using unpkg bundle configuration");
                } catch (unpkgError) {
                    console.warn("DuckDBContext: unpkg config failed, falling back to jsdelivr:", unpkgError);
                    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
                    bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
                    console.log("DuckDBContext: Using jsdelivr bundles (may cause CORS issues in production)");
                }

                const worker = new Worker(bundle.mainWorker!);
                const logger = new duckdb.ConsoleLogger();
                const db = new duckdb.AsyncDuckDB(logger, worker);
                await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

                duckDBInstance = db;
                console.log('DuckDBContext: DuckDB initialized successfully');

                // Initialize the connection manager with the database
                connectionManager.initialize(duckDBInstance);
                console.log('DuckDBContext: Connection manager initialized');

                setLoading(false);

            } catch (err) {
                console.error('DuckDBContext: Error initializing DuckDB:', err);
                setError(err instanceof Error ? err : new Error('Unknown error initializing DuckDB'));
                setLoading(false);
            }
        };

        initDB();
    }, []);

    // Cleanup function for when component unmounts
    useEffect(() => {
        return () => {
            const cleanup = async () => {
                try {
                    console.log('DuckDBContext: Starting cleanup');
                    await connectionManager.cleanup();

                    if (duckDBInstance) {
                        console.log('DuckDBContext: Terminating DuckDB instance');
                        await duckDBInstance.terminate();
                        duckDBInstance = null;
                    }
                } catch (err) {
                    console.warn('DuckDBContext: Error during cleanup:', err);
                }
            };

            cleanup();
        };
    }, []);

    // Add cleanup on page unload
    useEffect(() => {
        const handleBeforeUnload = () => {
            // Fast cleanup for page unload
            connectionManager.cleanup().catch(() => {
                // Silent catch - beforeunload handlers need to be fast
            });
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    // Function to get or create a connection via connection manager
    const createConnection = async (): Promise<AsyncDuckDBConnection | null> => {
        try {
            console.log('DuckDBContext: Getting connection from manager');
            const connection = await connectionManager.getConnection();

            if (connection) {
                setCurrentConnection(connection);
                console.log('DuckDBContext: Connection ready');
            } else {
                console.error('DuckDBContext: Failed to get connection');
            }

            return connection;
        } catch (err) {
            console.error('DuckDBContext: Error creating connection:', err);
            return null;
        }
    };

    // Function to execute query with retry logic
    const executeQuery = async (sql: string): Promise<any> => {
        try {
            console.log('DuckDBContext: Executing query via connection manager');
            return await connectionManager.executeQuery(sql);
        } catch (err) {
            console.error('DuckDBContext: Query execution failed:', err);
            throw err;
        }
    };

    // Function to refresh connection
    const refreshConnection = async (): Promise<AsyncDuckDBConnection | null> => {
        try {
            console.log('DuckDBContext: Refreshing connection');
            const connection = await connectionManager.refreshConnection();
            setCurrentConnection(connection);
            return connection;
        } catch (err) {
            console.error('DuckDBContext: Error refreshing connection:', err);
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
                connection: currentConnection,
                createConnection,
                executeQuery,
                refreshConnection
            }}
        >
            {children}
        </DuckDBContext.Provider>
    );
};