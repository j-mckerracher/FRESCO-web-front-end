import {AsyncDuckDB} from "duckdb-wasm-kit";
import {AsyncDuckDBConnection} from "@duckdb/duckdb-wasm";

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

    // Update the downloadFile method to better handle the data loading
    async downloadFile(url: string): Promise<boolean> {
        const conn = await this.ensureConnection();
        const tempTableName = `temp_table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const bufferName = `parquet_buffer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            // console.log(`DEBUG: Downloading data from signed URL...`);
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
            // console.log(`DEBUG: Downloaded ${data.byteLength} bytes`);

            // Register the buffer
            await this.db.registerFileBuffer(bufferName, data);

            try {
                // Create and populate temporary table
                await conn.query(`
                CREATE TEMPORARY TABLE ${tempTableName} AS 
                SELECT * FROM parquet_scan('${bufferName}');
            `);

                // Check rows in temp table
                const tempRows = await conn.query(`SELECT COUNT(*) as count FROM ${tempTableName};`);
                const tempCount = tempRows.toArray()[0].count;

                // Modify the insert to explicitly name all columns
                await conn.query(`
                  INSERT INTO job_data_small (
                    time, submit_time, start_time, end_time, timelimit, 
                    nhosts, ncores, account, queue, host, jid, unit, 
                    jobname, exitcode, host_list, username, value_cpuuser, 
                    value_gpu, value_memused, value_memused_minus_diskcache, 
                    value_nfs, value_block
                  )
                  SELECT
                    time, submit_time, start_time, end_time, timelimit, 
                    nhosts, ncores, account, queue, host, jid, unit, 
                    jobname, exitcode, host_list, username, value_cpuuser, 
                    value_gpu, value_memused, value_memused_minus_diskcache, 
                    value_nfs, value_block
                  FROM ${tempTableName};
                `);

                if (tempCount > 0) {
                    // Insert data from temp table to job_data_small table
                    await conn.query(`
                    INSERT INTO job_data_small 
                    SELECT * FROM ${tempTableName};
                `);

                    return true;
                } else {
                    console.warn(`DEBUG: Downloaded parquet file contains no rows`);
                    return false;
                }
            } finally {
                // Clean up temporary table only
                await conn.query(`DROP TABLE IF EXISTS ${tempTableName};`);
                // Note: DuckDB-wasm doesn't have a method to unregister file buffers
                // The buffer will be garbage collected when no longer referenced
            }
        } catch (error) {
            console.error(`Error processing file:`, error);
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
        // Log the exact query received by this method
        console.log(`DEBUG: TimeSeriesClient.queryData sending query: ${query}`);

        // Create a payload with the UNMODIFIED query
        const payload: QueryPayload = {
            query: query, // Keep the original query exactly as received
            clientId: "test-client",
            rowLimit
        };

        try {
            const response = await fetch(`${this.baseUrl}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`DEBUG: API error response (${response.status}): ${errorText}`);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            const result = await response.json() as QueryResult;
            console.log(`DEBUG: API response received with transferId: ${result.transferId || 'none'}`);

            return result;
        } catch (error) {
            console.error('DEBUG: Error in queryData:', error);
            throw error;
        }
    }
}

// For src/util/client.ts - Complete fixed startSingleQuery function
async function startSingleQuery(
    sqlQuery: string,
    db: AsyncDuckDB,
    tableName: string,
    rowLimit: number,
    onProgress?: (progress: number) => void
): Promise<void> {
    console.log(`DEBUG: Starting query execution with: ${sqlQuery}`);
    const client = new TimeSeriesClient(20, db);

    try {
        const conn = await db.connect();

        // Extract time bounds from the SQL query for logging only
        const timeBounds = extractTimeBounds(sqlQuery);
        console.log(`DEBUG: Extracted time bounds: ${timeBounds.start} to ${timeBounds.end}`);

        // Set up the destination table
        await conn.query(`DROP TABLE IF EXISTS ${tableName};`);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS ${tableName}(
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

        // Send the ORIGINAL query to the API - this is the key fix
        console.log(`DEBUG: Sending original query to API: ${sqlQuery}`);

        // This calls the Lambda via API Gateway with the SQL query
        const result = await client.queryData(sqlQuery, rowLimit);

        // Parse result
        let results;
        try {
            results = JSON.parse(result.body);
            console.log(`DEBUG: API response parsed successfully, chunks: ${results.chunks?.length || 0}`);
        } catch (parseError) {
            console.error('Error parsing API response:', parseError);
            console.log('Raw response body:', result.body);
            throw new Error('Failed to parse API response');
        }

        if (results.chunks && results.chunks.length > 0) {
            const totalChunks = results.chunks.length;
            console.log(`DEBUG: Processing ${totalChunks} chunks from API response`);
            let processedChunks = 0;

            // Process chunks in batches
            for (let i = 0; i < totalChunks; i += 20) {
                const batchChunks = results.chunks.slice(i, Math.min(i + 20, totalChunks));
                console.log(`DEBUG: Processing batch ${Math.floor(i / 20) + 1} with ${batchChunks.length} chunks`);

                // Log the first URL in each batch for debugging
                if (batchChunks.length > 0) {
                    // Log just the path part of the URL to avoid exposing full signed URL in logs
                    const sampleUrl = new URL(batchChunks[0].url);
                    console.log(`DEBUG: Sample URL path from batch: ${sampleUrl.pathname}`);
                }

                // Download data from the signed URLs
                await client.downloadContent(batchChunks.map((chunk: { url: string }) => chunk.url));

                processedChunks += batchChunks.length;

                // Update progress
                if (onProgress) {
                    const progress = Math.round((processedChunks / totalChunks) * 100);
                    onProgress(progress);
                }
            }
        } else {
            console.warn('DEBUG: No chunks returned from API');
            throw new Error(`No data found for the selected time range`);
        }

        // Verify the data was loaded into the destination table
        const count = await conn.query(`SELECT COUNT(*) as count FROM ${tableName};`);
        const finalCount = count.toArray()[0].count;
        console.log(`DEBUG: Loaded ${finalCount} rows into ${tableName}`);

        if (finalCount === 0) {
            throw new Error(`No data loaded into ${tableName} table after downloading chunks`);
        }

        await conn.close();
    } catch (error) {
        console.error('Error in startSingleQuery:', error);
        // Don't attempt to generate demo data as a fallback
        throw new Error(`Could not load real data: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}


function extractTimeBounds(query: string) {
    const timePattern = /time\s+BETWEEN\s+'([^']+)'\s+AND\s+'([^']+)'/i;
    const match = query.match(timePattern);

    if (match && match.length >= 3) {
        const start = match[1].trim();
        const end = match[2].trim();
        console.log(`DEBUG: Successfully extracted time range: ${start} to ${end}`);
        return {
            start,
            end
        };
    }

    console.error('DEBUG: Failed to extract time bounds from query:', query);
    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    return {
        start: oneMonthAgo.toISOString(),
        end: now.toISOString()
    };
}

export {TimeSeriesClient, startSingleQuery};