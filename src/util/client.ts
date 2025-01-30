// client.ts
import { AsyncDuckDB } from "duckdb-wasm-kit";
import { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

interface QueryResult {
    transferId?: string;
    body: string;
    metadata?: {
        total_partitions: number;
        estimated_size: number;
        chunk_count: number;
    };
    chunks?: Array<{ url: string }>;
}

interface QueryPayload {
    query: string;
    clientId: string;
    rowLimit: number;
}

class TimeSeriesClient {
    private baseUrl: string;
    private maxWorkers: number;
    private db: AsyncDuckDB;
    private conn: AsyncDuckDBConnection | null = null;

    public constructor(maxWorkers: number, duckDBInstance: AsyncDuckDB) {
        this.baseUrl = "https://dusrle1grb.execute-api.us-east-1.amazonaws.com/prod";
        this.maxWorkers = maxWorkers;
        this.db = duckDBInstance;
    }

    private async ensureConnection(): Promise<AsyncDuckDBConnection> {
        if (!this.conn) {
            this.conn = await this.db.connect();
            await this.conn.query(`LOAD icu;`);
            await this.conn.query(`SET TimeZone='America/New_York';`);
        }
        return this.conn;
    }

    private async ensureTable(): Promise<void> {
        const conn = await this.ensureConnection();

        // First check if table exists
        const tableExists = await conn.query(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='s3_fresco';
        `);

        if (tableExists.toArray().length === 0) {
            // Create the table if it doesn't exist
            await conn.query(`
                CREATE TABLE IF NOT EXISTS s3_fresco(
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
                );
            `);
        }
    }

    async downloadFile(url: string): Promise<boolean> {
        const conn = await this.ensureConnection();
        const tempTableName = `temp_table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const bufferName = `parquet_buffer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            // console.log(`Downloading: ${url}`);
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);

            // Ensure table exists before proceeding
            await this.ensureTable();

            // Register the buffer
            await this.db.registerFileBuffer(bufferName, data);

            try {
                // Create and populate temporary table
                await conn.query(`
                    CREATE TEMPORARY TABLE ${tempTableName} AS 
                    SELECT * FROM parquet_scan('${bufferName}');
                `);

                // Insert data from temp table to main table
                await conn.query(`
                    INSERT INTO s3_fresco 
                    SELECT * FROM ${tempTableName};
                `);

                // const count = await conn.query(`
                //     SELECT COUNT(*) as count FROM s3_fresco;
                // `);
                // console.log(`Current row count: ${count.toArray()[0].count}`);

                return true;
            } finally {
                // Clean up temporary table
                await conn.query(`DROP TABLE IF EXISTS ${tempTableName};`);
            }
        } catch (error) {
            console.error(`Error processing file ${url}:`, error);
            // Clean up temp table in case of error
            try {
                await conn.query(`DROP TABLE IF EXISTS ${tempTableName};`);
            } catch (cleanupError) {
                console.error('Error during cleanup:', cleanupError);
            }
            return false;
        }
    }

    async downloadContent(urls: string[]): Promise<void> {
        console.log(`Processing ${urls.length} URLs`);
        const maxRetries = 3;
        const initialDelay = 1000;
        const batchSize = Math.min(this.maxWorkers, 20);

        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        const downloadWithRetry = async (url: string, attempt = 1): Promise<boolean> => {
            try {
                const success = await this.downloadFile(url);
                if (success) return true;

                if (attempt < maxRetries) {
                    const backoffTime = Math.min(initialDelay * Math.pow(2, attempt - 1), 10000);
                    console.warn(`Retry ${attempt} for ${url} after ${backoffTime}ms delay`);
                    await sleep(backoffTime);
                    return downloadWithRetry(url, attempt + 1);
                }
                return false;
            } catch (error) {
                if (attempt < maxRetries) {
                    const backoffTime = Math.min(initialDelay * Math.pow(2, attempt - 1), 10000);
                    await sleep(backoffTime);
                    return downloadWithRetry(url, attempt + 1);
                }
                return false;
            }
        };

        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);
            console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(urls.length / batchSize)}`);

            const downloadPromises = batch.map(url => downloadWithRetry(url));
            const results = await Promise.all(downloadPromises);

            const successCount = results.filter(Boolean).length;
            console.log(`Batch ${Math.floor(i / batchSize) + 1}: ${successCount}/${batch.length} successful`);

            if (i + batchSize < urls.length) {
                await sleep(1000);
            }
        }
    }

    async queryData(query: string, rowLimit: number): Promise<QueryResult> {
        const payload: QueryPayload = {
            query,
            clientId: "test-client",
            rowLimit
        };

        const response = await fetch(`${this.baseUrl}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json() as QueryResult;
        const results = JSON.parse(result.body);

        if (results.chunks) {
            await this.downloadContent(results.chunks.map((chunk: { url: string }) => chunk.url));
        }

        return result;
    }
}

async function startSingleQuery(
    sqlQuery: string,
    db: AsyncDuckDB,
    tableName: string,
    rowLimit: number,
    onProgress?: (progress: number) => void
): Promise<void> {
    const client = new TimeSeriesClient(20, db);

    try {
        const conn = await db.connect();

        // Set up the destination table
        await conn.query(`DROP TABLE IF EXISTS ${tableName};`);
        await conn.query(`
            CREATE TABLE ${tableName}(
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
            );
        `);

        // Query the API and load data
        const result = await client.queryData(sqlQuery, rowLimit);
        const results = JSON.parse(result.body);

        if (results.chunks) {
            const totalChunks = results.chunks.length;
            let processedChunks = 0;

            // Process chunks in batches
            for (let i = 0; i < totalChunks; i += 20) {
                const batchChunks = results.chunks.slice(i, Math.min(i + 20, totalChunks));

                // Download batch of chunks
                await client.downloadContent(batchChunks.map((chunk: { url: string }) => chunk.url));

                processedChunks += batchChunks.length;

                // Update progress
                if (onProgress) {
                    const progress = Math.round((processedChunks / totalChunks) * 100);
                    onProgress(progress);
                }
            }
        }

        // Transfer filtered data to destination table
        await conn.query(`
            INSERT INTO ${tableName} 
            SELECT * FROM s3_fresco 
            WHERE time BETWEEN '2023-02-01' AND '2023-03-01';
        `);

        // Verify the data transfer
        const count = await conn.query(`SELECT COUNT(*) as count FROM ${tableName};`);
        console.log(`Loaded ${count.toArray()[0].count} rows into ${tableName}`);

        await conn.close();
    } catch (error) {
        console.error('Error in startSingleQuery:', error);
        throw error;
    }
}

export { TimeSeriesClient, startSingleQuery };