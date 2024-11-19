"use client";
import {
  CognitoIdentityClient,
  GetIdCommand,
  GetCredentialsForIdentityCommand,
} from "@aws-sdk/client-cognito-identity";
import { IoTClient, AttachPolicyCommand } from "@aws-sdk/client-iot";
import { mqtt, iot } from "aws-crt";
import { v4 as uuidv4 } from "uuid";
// import { config as _config } from "dotenv";
import axios from "axios";
import gql from "graphql-tag";
import { print } from "graphql";
import { inflate } from "zlib";
import { AsyncDuckDB } from "duckdb-wasm-kit";
// import { performance } from "perf_hooks";
// import { createWriteStream, mkdir, writeFile } from "fs";
// import { join } from "path";

// // Create a write stream to the output log file
// const logFilePath = join(__dirname, "output.log");
// const logFile = createWriteStream(logFilePath, { flags: "a" });

// Override console methods to write to the file
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// interface JobDetails {
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   [key: string]: any;
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   [key: symbol]: any;
//   time: number;
//   submit_time: number;
//   start_time: number;
//   end_time: number;
//   timelimit: number;
//   nhosts: bigint;
//   ncores: bigint;
//   account: string;
//   queue: string;
//   host: string;
//   jid: string;
//   unit: string;
//   jobname: string;
//   exitcode: string;
//   host_list: string;
//   username: string;
//   value_cpuuser: number;
//   value_gpu: number;
//   value_memused: number;
//   value_memused_minus_diskcache: number;
//   value_nfs: number;
//   value_block: number;
// }

interface DecompressionTask {
  data: Buffer;
  resolve: (value: Buffer) => void;
  reject: (reason?: Error) => void;
}

// class DataSaver {
//   static async saveToFile(rows, filename, options = {}) {
//     try {
//       const saveDir = options.directory || join(process.cwd(), "data");
//       await mkdir(saveDir, { recursive: true });
//       const fullPath = join(saveDir, filename);

//       // Convert rows to readable format with BigInt handling
//       const formattedData = rows.map((row) => {
//         const formattedRow = {};
//         Object.entries(row).forEach(([key, value]) => {
//           if (value instanceof Date) {
//             formattedRow[key] = value.toISOString();
//           } else if (value === null) {
//             formattedRow[key] = "null";
//           } else if (typeof value === "bigint") {
//             // Convert BigInt to string
//             formattedRow[key] = value.toString();
//           } else {
//             formattedRow[key] = value;
//           }
//         });
//         return formattedRow;
//       });

//       // Use custom replacer for JSON stringify
//       const replacer = (key, value) => {
//         if (typeof value === "bigint") {
//           return value.toString();
//         }
//         return value;
//       };

//       // Save as formatted JSON using custom replacer
//       await writeFile(
//         fullPath,
//         JSON.stringify(formattedData, replacer, 2),
//         "utf8"
//       );
//       console.log(`Data saved to ${fullPath}`);

//       // Save summary with BigInt handling
//       const summaryPath = join(saveDir, "data_summary.json");
//       const summary = {
//         timestamp: new Date().toISOString(),
//         rowCount: rows.length,
//         columns: Object.keys(rows[0] || {}),
//         columnTypes: Object.entries(rows[0] || {}).reduce(
//           (acc, [key, value]) => {
//             acc[key] = typeof value === "bigint" ? "bigint" : typeof value;
//             return acc;
//           },
//           {}
//         ),
//         sampleData: rows.slice(0, 5).map((row) => {
//           const formatted = {};
//           Object.entries(row).forEach(([key, value]) => {
//             if (typeof value === "bigint") {
//               formatted[key] = value.toString();
//             } else if (value instanceof Date) {
//               formatted[key] = value.toISOString();
//             } else {
//               formatted[key] = value;
//             }
//           });
//           return formatted;
//         }),
//         fullDataFile: fullPath,
//       };

//       await writeFile(
//         summaryPath,
//         JSON.stringify(summary, replacer, 2),
//         "utf8"
//       );
//       console.log(`Summary saved to ${summaryPath}`);

//       // Also log first few rows to console
//       console.log("\nSample of received data (first 5 rows):");
//       formattedData.slice(0, 5).forEach((row, index) => {
//         console.log(`\nRow ${index + 1}:`);
//         Object.entries(row).forEach(([key, value]) => {
//           console.log(`  ${key}: ${value}`);
//         });
//       });
//     } catch (error) {
//       console.error("Error saving data:", error);
//       console.error("Error details:", error.stack);
//     }
//   }
// }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getTimeStamp() {
  return new Date().toISOString();
}

console.log = function (...args) {
  originalConsoleLog.apply(console, args);
  //   logFile.write(`[${getTimeStamp()}] [LOG] ${message}\n`);
};

console.error = function (...args) {
  originalConsoleError.apply(console, args);
  //   logFile.write(`[${getTimeStamp()}] [ERROR] ${message}\n`);
};

console.warn = function (...args) {
  originalConsoleWarn.apply(console, args);
  //   logFile.write(`[${getTimeStamp()}] [WARN] ${message}\n`);
};

// Load environment variables
// _config();

const CONFIG = {
  BATCH_PROCESSING_SIZE: 50000,
  MAX_CONCURRENT_BATCHES: 4,
  MESSAGE_BUFFER_SIZE: 200,
  DECOMPRESSION_QUEUE_SIZE: 8,
  PROCESSING_TIMEOUT: 600000,
  HEARTBEAT_INTERVAL: 5000,
  ROW_LIMIT: 10000,
  BATCH_SIZE: 5000,
  PREVIEW_ROWS: 5,
};

// Required environment variables with validation
const REQUIRED_ENV_VARS = {
  COGNITO_IDENTITY_POOL_ID: "us-east-1:15d5193a-8a22-4ba8-bd43-b6b853279416",
  APP_SYNC_API_URL:
    "https://4mgcrlrwknhjdml2wgmk62vpla.appsync-api.us-east-1.amazonaws.com/graphql",
  APP_SYNC_API_KEY: "da2-cceknhhyqffdjmpi6uauuc2i2u",
  IOT_ENDPOINT: "ag5lbdhv8yy3n-ats.iot.us-east-1.amazonaws.com",
  IOT_TOPIC: "data-stream",
};

// Optional environment variables with defaults
const OPTIONAL_ENV_VARS = {
  AWS_REGION: "us-east-1",
  SQL_QUERY: "SELECT * FROM job_data",
  SAVE_DATA: "true",
};

// Validate required environment variables
const missingVars = Object.entries(REQUIRED_ENV_VARS)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error(
    "Error: Missing required environment variables:",
    missingVars.join(", ")
  );
  process.exit(1);
}

// Combine all environment variables
const ENV = {
  ...REQUIRED_ENV_VARS,
  ...OPTIONAL_ENV_VARS,
};

const GET_DATA_QUERY = gql`
  query GetData(
    $query: String!
    $rowLimit: Int
    $batchSize: Int
    $transferId: String!
  ) {
    getData(
      query: $query
      rowLimit: $rowLimit
      batchSize: $batchSize
      transferId: $transferId
    ) {
      transferId
      metadata {
        rowCount
        chunkCount
        schema
        processingStatus
        error
      }
    }
  }
`;

// Configuration logging with safe object spread
console.log("\n--- Streaming Lambda Tester Configuration ---");
console.log("Environment:");
Object.entries(ENV).forEach(([key, value]) => {
  // Mask sensitive values
  const sensitiveKeys = ["APP_SYNC_API_KEY", "COGNITO_IDENTITY_POOL_ID"];
  const displayValue = sensitiveKeys.includes(key) ? "***" : value;
  console.log(`  ${key}: ${displayValue}`);
});

console.log("\nPerformance Settings:");
Object.entries(CONFIG).forEach(([key, value]) => {
  console.log(`  ${key}: ${value}`);
});
console.log(""); // Empty line for readability

class ParallelDataProcessor {

  decompressionQueue: DecompressionTask[];
  processingQueue: never[];
  isProcessing: boolean;
  workerCount: number;
  constructor() {
    this.decompressionQueue = [];
    this.processingQueue = [];
    this.isProcessing = false;
    this.workerCount = 0;
  }

  async startWorker() {
    if (this.workerCount >= CONFIG.DECOMPRESSION_QUEUE_SIZE) return;

    this.workerCount++;
    while (this.decompressionQueue.length > 0) {
      const task = this.decompressionQueue.shift();
      if (!task) break;

      try {
        const result = await this.processData(task.data);
        task.resolve(result as Buffer);
      } catch (err) {
        console.error("[ERROR] Worker decompression error:", err);
        task.reject(err as Error);
      }
    }
    this.workerCount--;
  }

  async processData(data: Buffer) {
    return new Promise((resolve, reject) => {
      console.log(`[DEBUG] Starting decompression of ${data.length} bytes`);

      inflate(data, (err, result) => {
        if (err) {
          console.error("[ERROR] Decompression failed:", err);
          console.error(
            "[ERROR] First 100 bytes of failed data:",
            data.subarray(0, 100)
          );
          reject(err);
        } else {
          console.log(
            `[DEBUG] Successfully decompressed to ${result.length} bytes`
          );
          resolve(result);
        }
      });
    });
  }

  queueDecompression(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.decompressionQueue.push({ data, resolve, reject });
      this.startWorker();
    });
  }
}

interface MessageMetadata {
  sequence: number;
  chunk_index: number;
  total_chunks: number;
  final?: boolean;
}

interface Message {
  metadata: MessageMetadata;
  data: string;
}

interface SequenceInfo {
  totalChunks: number;
  receivedChunks: Set<number>;
  isFinal?: boolean;
  firstChunkTime: number;
}

interface BatchData {
  rows: Buffer;
  metadata: {
    sequence: number;
    timestamp: number;
    totalRows: number;
  };
}

interface CompletionStats {
  transferId: string;
  totalRows: number;
  previewData: unknown[];
}

class StreamingReconstructor {
  transferId: string;
  onDataBatch: (batchData: BatchData) => void;
  onComplete: (error: Error | null, stats?: CompletionStats) => void;
  processedSequences: Set<number>;
  dataProcessor: ParallelDataProcessor;
  totalRows: number;
  pendingMessages: number;
  lastActivityTime: number;
  chunkCollector: Map<number, Map<number, Buffer>>;
  previewData: unknown[];
  sequenceInfo: Map<number, SequenceInfo>;
  maxSequenceReceived: number;
  sequenceGaps: Set<number>;
  heartbeatInterval: NodeJS.Timeout;
  isProcessing: boolean = false;

  constructor(
    transferId: string,
    onDataBatch: (batchData: BatchData) => void,
    onComplete: (error: Error | null, stats?: CompletionStats) => void
  ) {
    this.transferId = transferId;
    this.onDataBatch = onDataBatch;
    this.onComplete = onComplete;
    this.processedSequences = new Set();
    this.dataProcessor = new ParallelDataProcessor();
    this.totalRows = 0;
    this.pendingMessages = 0;
    this.lastActivityTime = Date.now();
    this.chunkCollector = new Map();
    this.previewData = [];
    this.sequenceInfo = new Map();
    this.maxSequenceReceived = 0;
    this.sequenceGaps = new Set();
    this.heartbeatInterval = setInterval(() => {
      this.printStatus();
      const now = Date.now();
      if (now - this.lastActivityTime > CONFIG.PROCESSING_TIMEOUT) {
        this.complete(new Error("Processing timeout"));
      }
    }, CONFIG.HEARTBEAT_INTERVAL);
  }

  printStatus() {
    console.log("\n[DEBUG] === Current Processing Status ===");
    console.log(`Total sequences received: ${this.sequenceInfo.size}`);
    console.log(`Max sequence number: ${this.maxSequenceReceived}`);
    console.log(`Processed sequences: ${this.processedSequences.size}`);
    console.log(
      `Pending sequences: ${
        this.sequenceInfo.size - this.processedSequences.size
      }`
    );

    for (const [seq, info] of this.sequenceInfo.entries()) {
      const chunks = this.chunkCollector.get(seq);
      const receivedChunks = chunks
        ? Array.from(chunks.keys()).sort((a, b) => a - b)
        : [];
      const missingChunks = [];
      for (let i = 0; i < info.totalChunks; i++) {
        if (!receivedChunks.includes(i)) {
          missingChunks.push(i);
        }
      }

      console.log(`\nSequence ${seq}:`);
      console.log(`  Total chunks expected: ${info.totalChunks}`);
      console.log(`  Received chunks: [${receivedChunks.join(", ")}]`);
      console.log(`  Missing chunks: [${missingChunks.join(", ")}]`);
      console.log(
        `  Status: ${
          this.processedSequences.has(seq) ? "Processed" : "Pending"
        }`
      );
    }

    if (this.sequenceGaps.size > 0) {
      console.log(
        `\nSequence gaps detected: [${Array.from(this.sequenceGaps).join(
          ", "
        )}]`
      );
    }

    console.log("\n[DEBUG] === End Status ===\n");
  }

  async processMessage(message: Message) {
    this.lastActivityTime = Date.now();
    this.pendingMessages++;

    try {
      const { metadata, data } = message;
      const { sequence, chunk_index, total_chunks } = metadata;

      this.maxSequenceReceived = Math.max(this.maxSequenceReceived, sequence);

      if (!this.sequenceInfo.has(sequence)) {
        this.sequenceInfo.set(sequence, {
          totalChunks: total_chunks,
          receivedChunks: new Set(),
          isFinal: metadata.final,
          firstChunkTime: Date.now(),
        });
      }

      const info = this.sequenceInfo.get(sequence)!;
      info.receivedChunks.add(chunk_index);

      if (!this.chunkCollector.has(sequence)) {
        this.chunkCollector.set(sequence, new Map());
      }

      const chunkMap = this.chunkCollector.get(sequence)!;
      const decodedData = Buffer.from(data, "base64");

      chunkMap.set(chunk_index, decodedData);
      console.log(
        `[DEBUG] Added chunk ${chunk_index} to sequence ${sequence}. ` +
          `Have ${chunkMap.size}/${total_chunks} chunks`
      );

      if (chunkMap.size === total_chunks) {
        console.log(
          `[DEBUG] Potential complete sequence ${sequence}. Verifying...`
        );

        const hasAllChunks = Array.from({ length: total_chunks }, (_, i) =>
          chunkMap.has(i)
        ).every(Boolean);

        if (hasAllChunks) {
          console.log(`[DEBUG] Processing complete sequence ${sequence}`);

          const orderedChunks = Array.from({ length: total_chunks }, (_, i) =>
            chunkMap.get(i)
          );
          const combinedData = Buffer.concat(orderedChunks.filter((chunk): chunk is Buffer => chunk !== undefined));

          try {
            console.log(
              `[DEBUG] Starting decompression for sequence ${sequence}`
            );
            const decompressedData =
              await this.dataProcessor.queueDecompression(combinedData);
            console.log(
              `[DEBUG] Decompressed data size: ${decompressedData.length} bytes`
            );

            // const reader = await RecordBatchStreamReader.from<JobDetails>(decompressedData);
            // let rows: StructRowProxy<JobDetails>[] = [];
            // let batchCount = 0;

            // while (true) {
            //   const batch = await reader.next();
            //   if (batch.done) break;

            //   batchCount++;
            //   const batchRows = batch.value.toArray();
            //   console.log(
            //     `[DEBUG] Read batch ${batchCount} with ${batchRows.length} rows from sequence ${sequence}`
            //   );

            //   rows = rows.concat(batchRows);

            //   if (rows.length >= CONFIG.BATCH_PROCESSING_SIZE) {
            //     await this.processBatch(rows, sequence);
            //     rows = [];
            //   }
            // }

            if (decompressedData.byteLength > 0) {
              await this.processBatch(decompressedData, sequence);
            }

            this.processedSequences.add(sequence);
            this.chunkCollector.delete(sequence);

            console.log(`[DEBUG] Successfully processed sequence ${sequence}`);

            if (info.isFinal) {
              console.log("[DEBUG] Processing final sequence");
              this.complete();
            }
          } catch (error) {
            console.error(
              `[ERROR] Failed to process sequence ${sequence}:`,
              error
            );
            throw error;
          }
        } else {
          console.log(
            `[WARNING] Have ${chunkMap.size} chunks but missing some for sequence ${sequence}`
          );
          const missing = Array.from(
            { length: total_chunks },
            (_, i) => i
          ).filter((i) => !chunkMap.has(i));
          console.log(`[WARNING] Missing chunks: ${missing.join(", ")}`);
        }
      }

      if (this.maxSequenceReceived > sequence + 1) {
        for (let i = sequence + 1; i < this.maxSequenceReceived; i++) {
          if (!this.sequenceInfo.has(i) && !this.processedSequences.has(i)) {
            this.sequenceGaps.add(i);
          }
        }
      }
    } catch (error) {
      console.error("[ERROR] Error in processMessage:", error);
      if (error instanceof Error) {
        console.error(error.stack);
      } else {
        console.error(error);
      }
    } finally {
      this.pendingMessages--;
      if (this.pendingMessages === 0) {
        this.checkCompletion();
      }
    }
  }

  async processBatch(rows: Buffer, sequence: number) {
    this.totalRows += rows.byteLength;
    console.log(
      `[DEBUG] Processing batch of ${rows.byteLength} rows for sequence ${sequence}. Total rows: ${this.totalRows}`
    );

    // if (this.previewData.length < CONFIG.PREVIEW_ROWS) {
    //   this.previewData = this.previewData.concat(
    //     rows.slice(0, CONFIG.PREVIEW_ROWS - this.previewData.length)
    //   );
    //   console.log("[DEBUG] Updated preview data:", this.previewData);
    // }

    // if (this.totalRows === rows.length) {
    //   const filename = `data_sample_${new Date()
    //     .toISOString()
    //     .replace(/[:.]/g, "-")}.json`;
    //   console.log(`[DEBUG] Saving first batch to ${filename}`);
    // }

    this.onDataBatch({
      rows,
      metadata: {
        sequence,
        timestamp: Date.now(),
        totalRows: this.totalRows,
      },
    });
  }

  checkCompletion() {
    if (this.previewData.length > 0) {
      console.log("\nPreview of received data:");
      console.table(this.previewData);
    }

    if (this.pendingMessages === 0 && !this.isProcessing) {
      this.complete();
    }
  }

  complete(error: Error | null = null) {
    clearInterval(this.heartbeatInterval);

    if (!error) {
      const stats: CompletionStats = {
        transferId: this.transferId,
        totalRows: this.totalRows,
        previewData: this.previewData,
      };
      console.log("[DEBUG] Transfer completed successfully:", stats);
      this.onComplete(null, stats);
    } else {
      console.error("[ERROR] Transfer failed:", error);
      this.onComplete(error);
    }
  }
}

class IoTClientWrapper {
  streamingReconstructors: Map<string, StreamingReconstructor>;
  connection: mqtt.MqttClientConnection | null;
  client: mqtt.MqttClient;
  region: string;
  constructor() {
    this.streamingReconstructors = new Map();
    this.connection = null;
    this.client = new mqtt.MqttClient();
    this.region = ENV.AWS_REGION; // Store region from ENV
  }

  async connect() {
    try {
      const cognitoClient = new CognitoIdentityClient({
        region: this.region,
      });

      const getIdCommand = new GetIdCommand({
        IdentityPoolId: ENV.COGNITO_IDENTITY_POOL_ID,
      });
      const { IdentityId } = await cognitoClient.send(getIdCommand);
      console.log("Cognito Identity ID:", IdentityId);

      const getCredentialsCommand = new GetCredentialsForIdentityCommand({
        IdentityId,
      });
      const credentialsResponse = await cognitoClient.send(
        getCredentialsCommand
      );
      const rawCredentials = credentialsResponse.Credentials;

      if (!rawCredentials) {
        throw new Error("Failed to retrieve credentials");
      }

      const credentials = {
        accessKeyId: rawCredentials.AccessKeyId,
        secretAccessKey: rawCredentials.SecretKey,
        sessionToken: rawCredentials.SessionToken,
        expiration: rawCredentials.Expiration
          ? new Date(Number(rawCredentials.Expiration) * 1000)
          : undefined,
      };

      if (!credentials.accessKeyId || !credentials.secretAccessKey || !credentials.sessionToken) {
        throw new Error("Incomplete credentials");
      }

      const iotClient = new IoTClient({
        region: this.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      });

      const attachPolicyCommand = new AttachPolicyCommand({
        policyName: "DataStreamingIoTPolicy",
        target: IdentityId,
      });
      await iotClient.send(attachPolicyCommand);
      console.log("AWS IoT policy attached to identity");

      if (!IdentityId) {
        throw new Error("IdentityId is undefined");
      }

      const builder =
        iot.AwsIotMqttConnectionConfigBuilder.new_with_websockets()
          .with_clean_session(true)
          .with_client_id(IdentityId)
          .with_endpoint(ENV.IOT_ENDPOINT)
          .with_credentials(
        this.region,
        credentials.accessKeyId,
        credentials.secretAccessKey,
        credentials.sessionToken
          )
          .with_keep_alive_seconds(60);

      const config = builder.build();
      this.connection = this.client.new_connection(config);

      return new Promise<void>((resolve, reject) => {
        if(!this.connection){
          throw new Error("connection is null");
        }
        
        this?.connection.on("connect", () => {
          console.log("Connected to AWS IoT");
          resolve();
        });

        this.connection.on("error", (error) => {
          console.error("Connection error:", error);
          reject(error);
        });

        this.connection.on("disconnect", () => {
          console.log("Disconnected from AWS IoT");
        });

        this.connection.on("message", (topic, payload) => {
          this.handleMessage(topic, payload);
        });

        this.connection.connect();
      });
    } catch (error) {
      console.error("Failed to connect:", error);
      throw error;
    }
  }

  async subscribe(
    transferId: string,
    onDataBatch: (batchData: BatchData) => void,
    onComplete: (error: Error | null, stats?: CompletionStats) => void
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Client not connected");
    }

    console.log(`Setting up subscription for transfer ${transferId}`);

    const reconstructor = new StreamingReconstructor(
      transferId,
      onDataBatch,
      onComplete
    );

    this.streamingReconstructors.set(transferId, reconstructor);

    try {
      await this.connection.subscribe(
        ENV.IOT_TOPIC, // Use ENV.IOT_TOPIC instead of IOT_TOPIC
        mqtt.QoS.AtLeastOnce
      );
      console.log(`Subscribed to topic: ${ENV.IOT_TOPIC}`);
    } catch (error) {
      console.error("Subscribe error:", error);
      this.streamingReconstructors.delete(transferId);
      throw error;
    }
  }

  async testConnection() {
    if (!this.connection) {
      throw new Error("Not connected");
    }

    try {
      await this.connection.publish(
        ENV.IOT_TOPIC, // Use ENV.IOT_TOPIC instead of IOT_TOPIC
        JSON.stringify({ test: "connectivity" }),
        mqtt.QoS.AtLeastOnce
      );
      console.log("Test message published successfully");
    } catch (error) {
      console.error("Failed to publish test message:", error);
      throw error;
    }
  }

  async handleMessage(_topic: string, payloadBuffer: AllowSharedBufferSource | undefined) {
    try {
      // Convert ArrayBuffer to string properly
      let payload;
      if (payloadBuffer instanceof ArrayBuffer) {
        payload = new TextDecoder().decode(payloadBuffer);
      } else if (Buffer.isBuffer(payloadBuffer)) {
        payload = payloadBuffer.toString();
      } else {
        if (payloadBuffer === undefined) {
          console.warn("Received undefined payload buffer");
          return;
        }
        payload = payloadBuffer.toString();
      }

      const message = JSON.parse(payload);

      // Add detailed message logging
      // console.log('Received raw message:', payload);
      console.log("Parsed message type:", message.type);
      console.log("Message metadata:", message.metadata);

      if (!message || !message.metadata) {
        console.warn("Received invalid message format:", message);
        return;
      }

      // Add validation for required fields
      if (!message.type || message.type !== "arrow_data") {
        console.warn("Unexpected message type:", message.type);
        return;
      }

      if (!message.data) {
        console.warn("Message missing data field");
        return;
      }

      console.log(
        `Received message for sequence ${message.metadata.sequence}, chunk ${message.metadata.chunk_index}/${message.metadata.total_chunks}`
      );

      // Process message with all active reconstructors
      for (const reconstructor of this.streamingReconstructors.values()) {
        await reconstructor.processMessage(message);
      }
    } catch (error) {
      console.error("Error handling message:", error);
      console.error("Raw payload:", payloadBuffer ? payloadBuffer.toString() : "undefined");
    }
  }

  async disconnect() {
    if (this.connection) {
      try {
        await this.connection.disconnect();
        this.connection = null;
        console.log("Disconnected from AWS IoT");
      } catch (error) {
        console.error("Error disconnecting:", error);
        throw error;
      }
    }
  }
}

async function performStreamingQuery(iotClient: IoTClientWrapper, query: string, queryId: string, db: AsyncDuckDB, tableName: string, rowLimit: number) {
  try {
    const transferId = uuidv4();
    console.log(`Starting query execution with transfer ID: ${transferId}`);

    const dataReceptionPromise = new Promise((resolve, reject) => {
      const batchHandler = async (batchData: BatchData) => {
        const conn = await db.connect();
        await conn.insertArrowFromIPCStream(batchData.rows, {name: tableName, create: false});
        console.log((await conn.query(`select count(*) from ${tableName}`)).toString())
        console.log(batchData.metadata);
        // window.db = db
        await conn.close();
      };

      const completionHandler = (error: Error | null, stats?: CompletionStats) => {
        if (error) {
          console.error(`Transfer failed:`, error);
          reject(error);
        } else {
          console.log(`Transfer completed:`, stats);
          resolve(stats);
        }
      };

      iotClient
        .subscribe(transferId, batchHandler, completionHandler)
        .catch(reject);
    });

    // Wait for subscription to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Execute GraphQL query with CONFIG values
    const variables = {
      query,
      rowLimit: rowLimit,
      batchSize: CONFIG.BATCH_SIZE,
      transferId,
    };

    console.log("Executing GraphQL query with variables:", variables);

    const response = await axios.post(
      ENV.APP_SYNC_API_URL,
      {
      query: print(GET_DATA_QUERY),
      variables,
      },
      {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ENV.APP_SYNC_API_KEY,
      },
      }
    );

    console.log("GraphQL Response: ", response.data)

    if (response.data.errors) {
      throw new Error(
        `GraphQL query failed: ${JSON.stringify(response.data.errors)}`
      );
    }

    console.log("Query initiated successfully, waiting for data...");

    const result = await dataReceptionPromise;
    return result;
  } catch (error) {
    console.error(`Query ${queryId} failed:`, error);
    throw error;
  }
}

async function loadDuckDBQuery(sqlQuery: string, db: AsyncDuckDB, tableName: string, rowLimit: number) {
  console.log(`\n--- Starting streaming query ---`);
  const iotClient = new IoTClientWrapper();

  try {
    await iotClient.connect();
    console.log("Connected to IoT endpoint");

    await iotClient.testConnection();
    console.log("Connection test successful");

    const queryId = "single-query";
    const result = await performStreamingQuery(iotClient, sqlQuery, queryId, db, tableName, rowLimit);
    console.log(`Query completed successfully:`, result);
  } catch (error) {
    console.error("Error in query execution:", error);
    throw error;
  } finally {
    try {
      await iotClient.disconnect();
      console.log("Disconnected from IoT endpoint");
    } catch (disconnectError) {
      console.error("Error during disconnect:", disconnectError);
    }
  }
}

// Main execution
// (async () => {
//   try {
//     await startSingleQuery(ENV.SQL_QUERY);
//     console.log("\n--- Testing Completed Successfully ---");
//     process.exit(0);
//   } catch (error) {
//     console.error("Testing failed:", error);
//     process.exit(1);
//   }
// })();

export { loadDuckDBQuery as startSingleQuery };
