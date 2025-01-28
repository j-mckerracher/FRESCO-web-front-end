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

        // Use minimal headers - all auth is in the URL
        const headers = new Headers({
            'Accept': '*/*'
        });

        try {
            console.info(`Attempting to download: ${url}`);
            const response = await fetch(url, {
                method: 'GET',
                headers,
                mode: 'cors',
                credentials: 'omit'
            });

            if (!response.ok) {
                const errorText = await response.text();
                const errorDetails = {
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers),
                    body: errorText
                };
                console.error('Download error:', errorDetails);

                // Parse XML error response if available
                if (errorText.includes('<?xml')) {
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(errorText, 'text/xml');
                    const code = xmlDoc.querySelector('Code')?.textContent;
                    const message = xmlDoc.querySelector('Message')?.textContent;
                    console.error('AWS Error:', { code, message });
                }

                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);

            // Handle DuckDB insertion
            if (!this.conn) {
                this.conn = await this.db.connect();
            }

            // Parse URL for table name
            const pathParts = parsedUrl.pathname.split('/');
            const tableName = parsedUrl.pathname.includes('timestamps')
                ? 'timestamps'
                : `data_${pathParts.slice(-4).join('_').split('.')[0]}`;

            try {
                await this.conn.insertArrowFromIPCStream(data, {
                    name: tableName,
                    create: false
                });
                console.info(`Successfully loaded ${tableName} into DuckDB`);
                return data;
            } catch (dbError) {
                console.error(`Error loading data into DuckDB:`, dbError);
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
        const downloadedFiles: Uint8Array[] = [];
        let batchSize = this.maxWorkers;
        const maxRetries = 3;
        const initialDelay = 1000; // 1 second

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

        // Process URLs in smaller batches to avoid overwhelming the server
        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);
            console.info(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(urls.length / batchSize)}`);

            try {
                // Process batch with retries
                const downloadPromises = batch.map(url => downloadWithRetry(url));
                const results = await Promise.allSettled(downloadPromises);

                // Handle results
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled' && result.value) {
                        downloadedFiles.push(result.value);
                    } else {
                        const errorMessage = result.status === 'rejected' ? result.reason : 'Download failed';
                        console.warn(`Failed to download: ${batch[index]}`, errorMessage);
                    }
                });

                // Add delay between batches to prevent rate limiting
                if (i + batchSize < urls.length) {
                    await sleep(500); // 500ms delay between batches
                }

            } catch (error) {
                console.error('Batch download error:', error);
            }

            // If we've had too many failures, consider increasing delay or reducing batch size
            const successRate = downloadedFiles.length / (i + batch.length);
            if (successRate < 0.5 && batchSize > 1) {
                batchSize = Math.max(1, Math.floor(batchSize / 2));
                console.warn(`Reducing batch size to ${batchSize} due to high failure rate`);
            }
        }

        console.info(`Successfully downloaded ${downloadedFiles.length} of ${urls.length} files`);
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

// This function matches the usage in the React component
async function startSingleQuery(
    sqlQuery: string,
    db: AsyncDuckDB,
    tableName: string,
    rowLimit: number
): Promise<void> {
    const client = new TimeSeriesClient("", 5, db);
    try {
        const result = await client.queryData(sqlQuery, rowLimit);
        if (!result.chunks || result.chunks.length === 0) {
            console.warn('No data chunks returned from query');
            return;
        }

        // Download all chunks
        const urls = result.chunks.map(chunk => chunk.url);
        await client.downloadContent(urls);

    } catch (error) {
        console.error('Error executing query:', error);
        throw error;
    }
}

export {startSingleQuery}