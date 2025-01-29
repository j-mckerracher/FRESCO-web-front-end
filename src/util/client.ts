import {AsyncDuckDB} from "duckdb-wasm-kit";
import {AsyncDuckDBConnection} from "@duckdb/duckdb-wasm";

interface ResponseError extends Error {
    response?: {
        status: number;
        headers: Headers;
        text?: string;
    };
}

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
    private dataDir: string;
    private makeDataDir: boolean;
    private maxWorkers: number;
    private session: typeof fetch | null = null;
    private db: AsyncDuckDB;
    private conn: AsyncDuckDBConnection | null = null;

    public constructor(dataDir: string, maxWorkers: number, duckDBInstance: AsyncDuckDB) {
        this.baseUrl = "https://dusrle1grb.execute-api.us-east-1.amazonaws.com/prod";
        this.dataDir = dataDir;
        this.makeDataDir = true;
        this.maxWorkers = maxWorkers;
        this.db = duckDBInstance;
    }

    private getSession(): typeof fetch {
        if (!this.session) {
            this.session = fetch;
        }
        return this.session;
    }

    async downloadFile(url: string): Promise<Uint8Array | null> {
        const parsedUrl = new URL(url);
        const pathParts = parsedUrl.pathname.split('/');
        const tableName = parsedUrl.pathname.includes('timestamps')
            ? 'timestamps'
            : `data_${pathParts.slice(-4).join('_').split('.')[0]}`;

        const headers = new Headers({
            'Accept': '*/*'
        });

        try {
            console.log(`Attempting to download: ${url}`);
            const response = await fetch(url, {
                method: 'GET',
                headers,
                mode: 'cors',
                credentials: 'omit'
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Download error:', {
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers),
                    body: errorText
                });
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);

            // Handle DuckDB insertion
            if (!this.conn) {
                console.log('Creating new connection for data insertion');
                this.conn = await this.db.connect();

                // Create s3_fresco table if it doesn't exist
                console.log('Ensuring s3_fresco table exists...');
                await this.conn.query(`
                CREATE TABLE IF NOT EXISTS s3_fresco (
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
                )
            `);

                // Create temporary table for loading
                await this.conn.query(`DROP TABLE IF EXISTS temp_import`);
            }

            try {
                // First, load data into a temporary table
                const importOpts = {
                    name: 'temp_import',
                    create: true,
                };
                await this.conn.insertArrowFromIPCStream(data, importOpts);

                // Check the temp table structure
                console.log('Temp table schema:');
                const tempSchema = await this.conn.query('DESCRIBE temp_import');
                console.log(tempSchema.toArray());

                // Log sample of temp data
                const tempSample = await this.conn.query('SELECT * FROM temp_import LIMIT 1');
                console.log('Temp table sample:', tempSample.toArray());

                // Transfer data with explicit casting
                await this.conn.query(`
                INSERT INTO s3_fresco 
                SELECT 
                    CAST(time AS TIMESTAMP),
                    CAST(submit_time AS TIMESTAMP),
                    CAST(start_time AS TIMESTAMP),
                    CAST(end_time AS TIMESTAMP),
                    CAST(timelimit AS DOUBLE),
                    CAST(nhosts AS BIGINT),
                    CAST(ncores AS BIGINT),
                    account,
                    queue,
                    host,
                    jid,
                    unit,
                    jobname,
                    exitcode,
                    host_list,
                    username,
                    CAST(value_cpuuser AS DOUBLE),
                    CAST(value_gpu AS DOUBLE),
                    CAST(value_memused AS DOUBLE),
                    CAST(value_memused_minus_diskcache AS DOUBLE),
                    CAST(value_nfs AS DOUBLE),
                    CAST(value_block AS DOUBLE)
                FROM temp_import
            `);

                // Drop temp table
                await this.conn.query('DROP TABLE temp_import');

                // Verify counts
                const count = await this.conn.query('SELECT COUNT(*) as count FROM s3_fresco');
                console.log(`s3_fresco now has ${count.toArray()[0].count} rows`);

                return data;
            } catch (dbError) {
                console.error(`Error loading data into DuckDB:`, dbError);

                // Additional diagnostics
                try {
                    console.log('\nDiagnostic information:');
                    const tables = await this.conn.query('SELECT name FROM sqlite_master WHERE type="table"');
                    console.log('Available tables:', tables.toArray());

                    // Check both temp and target tables
                    for (const tbl of ['temp_import', 's3_fresco']) {
                        try {
                            const rowCount = await this.conn.query(`SELECT COUNT(*) as count FROM ${tbl}`);
                            console.log(`${tbl} row count:`, rowCount.toArray()[0].count);

                            const schema = await this.conn.query(`DESCRIBE ${tbl}`);
                            console.log(`${tbl} schema:`, schema.toArray());

                            const sample = await this.conn.query(`SELECT * FROM ${tbl} LIMIT 1`);
                            console.log(`${tbl} sample:`, sample.toArray());
                        } catch (e) {
                            console.log(`Error checking ${tbl}:`, e);
                        }
                    }
                } catch (diagError) {
                    console.error('Error during diagnostics:', diagError);
                }
                return null;
            }

        } catch (error) {
            console.error(`Error downloading ${url}:`, error);
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                console.error('Network error - possible causes:',
                    '\n1. Network connectivity issues',
                    '\n2. Invalid or expired AWS credentials',
                    '\n3. Incorrect request signing');
            }
            return null;
        }
    }

    async downloadContent(urls: string[]): Promise<Uint8Array[]> {
        console.log('=== Starting downloadContent ===');
        console.log(`Processing ${urls.length} URLs`);

        const downloadedFiles: Uint8Array[] = [];
        let batchSize = this.maxWorkers;
        const maxRetries = 3;
        const initialDelay = 1000;

        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        const downloadWithRetry = async (url: string, attempt = 1): Promise<Uint8Array | null> => {
            try {
                const result = await this.downloadFile(url);
                if (result) {
                    return result;
                }
                throw new Error('Download returned null');
            } catch (error) {
                if (attempt < maxRetries) {
                    const backoffTime = Math.min(initialDelay * Math.pow(2, attempt - 1), 10000);
                    console.warn(`Retry ${attempt} for ${url} after ${backoffTime}ms delay`);
                    await sleep(backoffTime);
                    return downloadWithRetry(url, attempt + 1);
                }
                console.error(`Failed to download ${url} after ${maxRetries} attempts`);
                return null;
            }
        };

        // Process URLs in batches
        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);
            console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(urls.length / batchSize)}`);

            try {
                const downloadPromises = batch.map(url => downloadWithRetry(url));
                const results = await Promise.allSettled(downloadPromises);

                let batchSuccessCount = 0;
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled' && result.value) {
                        downloadedFiles.push(result.value);
                        batchSuccessCount++;
                    } else {
                        const errorMessage = result.status === 'rejected' ? result.reason : 'Download failed';
                        console.warn(`Failed to download: ${batch[index]}`, errorMessage);
                    }
                });

                console.log(`Batch ${Math.floor(i / batchSize) + 1} results: ${batchSuccessCount}/${batch.length} successful`);

                // Verify data after each batch
                if (this.conn) {
                    const count = await this.conn.query('SELECT COUNT(*) as count FROM s3_fresco');
                    console.log(`s3_fresco total rows after batch: ${count.toArray()[0].count}`);
                }

                if (i + batchSize < urls.length) {
                    await sleep(500);
                }

            } catch (error) {
                console.error('Batch download error:', error);
            }

            const successRate = downloadedFiles.length / (i + batch.length);
            if (successRate < 0.5 && batchSize > 1) {
                batchSize = Math.max(1, Math.floor(batchSize / 2));
                console.warn(`Reducing batch size to ${batchSize} due to high failure rate`);
            }
        }

        console.log(`Successfully downloaded ${downloadedFiles.length} of ${urls.length} files`);

        // Final verification
        if (this.conn) {
            try {
                const finalCount = await this.conn.query('SELECT COUNT(*) as count FROM s3_fresco');
                console.log(`Final s3_fresco row count: ${finalCount.toArray()[0].count}`);

                const dataSample = await this.conn.query('SELECT * FROM s3_fresco LIMIT 5');
                console.log('Data sample from s3_fresco:', dataSample.toArray());
            } catch (e) {
                console.error('Error during final verification:', e);
            }
        }

        return downloadedFiles;
    }

    async queryData(query: string, rowLimit: number): Promise<QueryResult> {
        const payload: QueryPayload = {
            query,
            clientId: "test-client",
            rowLimit
        };

        try {
            const session = this.getSession();
            const response = await session(`${this.baseUrl}/`, {
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

            console.info("Query successful:");
            console.info(`Transfer ID: ${result.transferId}`);
            console.info(`Total partitions: ${results.metadata?.total_partitions}`);
            console.info(`Estimated size: ${results.metadata?.estimated_size} bytes`);
            console.info(`Number of chunks: ${results.metadata?.chunk_count}`);

            if (results.chunks) {
                const urls = results.chunks.map((chunk: { url: string }) => chunk.url);
                const downloadedFiles = await this.downloadContent(urls);
                console.info(`Downloaded ${downloadedFiles.length} files to DuckDB`);
            }

            return result;

        } catch (error) {
            if (error instanceof Error) {
                console.error(`Error making request: ${error.message}`);
                if (error.message.includes('Failed to fetch')) {
                    console.error(`Network error - please check:
                    1. Your internet connection
                    2. If the API endpoint (${this.baseUrl}) is correct and accessible
                    3. If there are any CORS restrictions
                    4. If you need to use a VPN or adjust network settings`);
                }
            } else {
                console.error('An unknown error occurred:', error);
            }
            throw error;
        }
    }
}

async function startSingleQuery(
    sqlQuery: string,
    db: AsyncDuckDB,
    tableName: string,
    rowLimit: number
): Promise<void> {
    console.log(`\n=== Starting Query Process ===`);
    console.log(`Query: ${sqlQuery}`);
    console.log(`Table: ${tableName}`);
    console.log(`Row Limit: ${rowLimit}`);

    const client = new TimeSeriesClient("", 20, db);
    let conn = null;
    try {
        conn = await db.connect();

        // First check if s3_fresco exists and has data
        try {
            const s3Tables = await conn.query(`SELECT name FROM sqlite_master WHERE type='table' AND name='s3_fresco'`);
            const s3TableExists = s3Tables.toArray().length > 0;
            console.log('s3_fresco table exists:', s3TableExists);

            if (s3TableExists) {
                const s3Count = await conn.query('SELECT COUNT(*) as count FROM s3_fresco');
                console.log('s3_fresco row count:', s3Count.toArray()[0].count);

                // Sample the data to verify structure
                console.log('s3_fresco sample data:');
                const s3Sample = await conn.query('SELECT * FROM s3_fresco LIMIT 2');
                const s3Data = s3Sample.toArray();
                console.log(s3Data);

                // If we have data, let's check its date range
                if (s3Data.length > 0) {
                    const dateRange = await conn.query(`
                        SELECT 
                            MIN(time) as min_time,
                            MAX(time) as max_time 
                        FROM s3_fresco
                    `);
                    console.log('s3_fresco date range:', dateRange.toArray()[0]);
                }
            }
        } catch (e) {
            console.log('Error checking s3_fresco:', e);
        }

        // Create target table with explicit schema
        console.log(`Creating ${tableName} table...`);
        await conn.query(`DROP TABLE IF EXISTS ${tableName}`);
        await conn.query(`
            CREATE TABLE ${tableName} (
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
            )
        `);

        console.log('Querying API for data chunks...');
        const result = await client.queryData(sqlQuery, rowLimit);

        if (!result.chunks || result.chunks.length === 0) {
            console.warn('No data chunks returned from API query');
            return;
        }

        console.log(`Received ${result.chunks.length} data chunks from API`);
        const urls = result.chunks.map(chunk => chunk.url);

        try {
            console.log('Starting data download and insertion...');
            await client.downloadContent(urls);

            // After download, verify s3_fresco again
            console.log('\nVerifying s3_fresco after download:');
            const postCount = await conn.query('SELECT COUNT(*) as count FROM s3_fresco');
            const s3RowCount = postCount.toArray()[0].count;
            console.log('s3_fresco row count after download:', s3RowCount);

            if (s3RowCount > 0) {
                // Transfer the data
                console.log(`\nTransferring data to ${tableName}...`);
                const insertQuery = `
                    INSERT INTO ${tableName} 
                    SELECT 
                        CAST(time AS TIMESTAMP) as time,
                        CAST(submit_time AS TIMESTAMP) as submit_time,
                        CAST(start_time AS TIMESTAMP) as start_time,
                        CAST(end_time AS TIMESTAMP) as end_time,
                        timelimit,
                        nhosts,
                        ncores,
                        account,
                        queue,
                        host,
                        jid,
                        unit,
                        jobname,
                        exitcode,
                        host_list,
                        username,
                        value_cpuuser,
                        value_gpu,
                        value_memused,
                        value_memused_minus_diskcache,
                        value_nfs,
                        value_block
                    FROM s3_fresco 
                    WHERE time BETWEEN '2023-02-01' AND '2023-03-01'
                `;
                console.log('Insert query:', insertQuery);
                await conn.query(insertQuery);

                // Verify the insert
                const finalCount = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                const finalRowCount = finalCount.toArray()[0].count;
                console.log(`${tableName} final row count:`, finalRowCount);

                if (finalRowCount === 0) {
                    // Check the date filtering
                    const dateCheck = await conn.query(`
                        SELECT MIN(time) as min_time, MAX(time) as max_time 
                        FROM s3_fresco
                    `);
                    console.log('Date range in s3_fresco:', dateCheck.toArray());
                }
            } else {
                console.error('No data found in s3_fresco after download');
            }

        } catch (err) {
            console.error('Error during data operations:', err);
            throw err;
        }

    } catch (error) {
        console.error('Error in startSingleQuery:', error);

        // Additional error diagnostics
        if (conn) {
            try {
                console.log('\n=== Debug Information ===');
                const tables = await conn.query('SELECT name FROM sqlite_master WHERE type="table"');
                console.log('Available tables:', tables.toArray());

                for (const table of tables.toArray()) {
                    const tableName = table[0];
                    console.log(`\nSchema for ${tableName}:`);
                    const schema = await conn.query(`DESCRIBE ${tableName}`);
                    console.log(schema.toArray());
                }
            } catch (debugErr) {
                console.error('Error during debug:', debugErr);
            }
        }
        throw error;
    } finally {
        if (conn) {
            console.log('Closing database connection...');
            conn.close();
        }
    }
}

export {startSingleQuery}