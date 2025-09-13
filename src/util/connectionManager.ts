/**
 * Centralized DuckDB Connection Manager
 *
 * Provides thread-safe connection management with:
 * - Singleton connection pattern
 * - Connection health monitoring
 * - Automatic retry logic
 * - Proper cleanup and resource management
 */

import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

interface ConnectionState {
  connection: AsyncDuckDBConnection | null;
  isHealthy: boolean;
  lastHealthCheck: number;
  connectionCount: number;
}

export class DuckDBConnectionManager {
  private static instance: DuckDBConnectionManager;
  private db: AsyncDuckDB | null = null;
  private state: ConnectionState = {
    connection: null,
    isHealthy: false,
    lastHealthCheck: 0,
    connectionCount: 0
  };

  private connectionMutex = false;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

  private constructor() {}

  static getInstance(): DuckDBConnectionManager {
    if (!DuckDBConnectionManager.instance) {
      DuckDBConnectionManager.instance = new DuckDBConnectionManager();
    }
    return DuckDBConnectionManager.instance;
  }

  /**
   * Initialize the connection manager with a DuckDB instance
   */
  initialize(db: AsyncDuckDB): void {
    this.db = db;
    console.log('ConnectionManager: Initialized with DuckDB instance');
  }

  /**
   * Get or create a healthy database connection
   */
  async getConnection(): Promise<AsyncDuckDBConnection | null> {
    if (!this.db) {
      console.error('ConnectionManager: Database not initialized');
      return null;
    }

    // Use mutex to prevent concurrent connection creation
    if (this.connectionMutex) {
      console.log('ConnectionManager: Waiting for existing connection operation...');
      await this.waitForMutex();
    }

    this.connectionMutex = true;

    try {
      // Check if current connection is healthy
      if (this.state.connection && await this.isConnectionHealthy()) {
        console.log('ConnectionManager: Reusing existing healthy connection');
        return this.state.connection;
      }

      // Create new connection if needed
      console.log('ConnectionManager: Creating new connection');
      await this.createNewConnection();

      return this.state.connection;
    } catch (error) {
      console.error('ConnectionManager: Error getting connection:', error);
      return null;
    } finally {
      this.connectionMutex = false;
    }
  }

  /**
   * Check if the current connection is healthy
   */
  private async isConnectionHealthy(): Promise<boolean> {
    if (!this.state.connection) {
      return false;
    }

    const now = Date.now();

    // Skip health check if done recently
    if (this.state.isHealthy && (now - this.state.lastHealthCheck) < this.HEALTH_CHECK_INTERVAL) {
      return true;
    }

    try {
      // Simple health check query
      const result = await this.state.connection.query('SELECT 1 as health_check');
      const rows = result.toArray();

      this.state.isHealthy = rows.length === 1 && rows[0].health_check === 1;
      this.state.lastHealthCheck = now;

      if (this.state.isHealthy) {
        console.log('ConnectionManager: Health check passed');
      } else {
        console.warn('ConnectionManager: Health check failed - invalid response');
      }

      return this.state.isHealthy;
    } catch (error) {
      console.error('ConnectionManager: Health check failed with error:', error);
      this.state.isHealthy = false;
      return false;
    }
  }

  /**
   * Create a new database connection with proper setup
   */
  private async createNewConnection(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Close existing connection if it exists
      await this.closeCurrentConnection();

      // Create new connection
      const connection = await this.db.connect();
      this.state.connectionCount++;

      console.log(`ConnectionManager: Created connection #${this.state.connectionCount}`);

      // Apply essential settings
      await this.setupConnection(connection);

      // Update state
      this.state.connection = connection;
      this.state.isHealthy = true;
      this.state.lastHealthCheck = Date.now();

      console.log('ConnectionManager: New connection ready');
    } catch (error) {
      console.error('ConnectionManager: Failed to create connection:', error);
      this.state.connection = null;
      this.state.isHealthy = false;
      throw error;
    }
  }

  /**
   * Set up a new connection with essential configuration
   */
  private async setupConnection(connection: AsyncDuckDBConnection): Promise<void> {
    try {
      // Essential DuckDB setup
      await connection.query("LOAD icu");
      await connection.query("SET TimeZone='America/New_York'");
      await connection.query("SET temp_directory='browser-data/tmp'");

      // Conservative memory and threading settings
      await connection.query("PRAGMA threads=2");
      await connection.query("PRAGMA memory_limit='1GB'");

      console.log('ConnectionManager: Connection setup completed');
    } catch (error) {
      console.error('ConnectionManager: Connection setup failed:', error);
      throw error;
    }
  }

  /**
   * Execute a query with automatic retry on connection failure
   */
  async executeQuery(sql: string, retryCount = 0): Promise<any> {
    const connection = await this.getConnection();

    if (!connection) {
      throw new Error('No database connection available');
    }

    try {
      console.log(`ConnectionManager: Executing query (attempt ${retryCount + 1})`);
      const result = await connection.query(sql);
      return result;
    } catch (error) {
      console.error(`ConnectionManager: Query failed on attempt ${retryCount + 1}:`, error);

      // Check if this is a connection error that we can retry
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRetryableError = errorMessage.includes('index out of bounds') ||
                              errorMessage.includes('indirect call to null') ||
                              errorMessage.includes('connection');

      if (isRetryableError && retryCount < this.MAX_RETRY_ATTEMPTS) {
        console.log(`ConnectionManager: Retrying query after connection error...`);

        // Mark connection as unhealthy to force recreation
        this.state.isHealthy = false;

        // Wait before retry
        await this.sleep(this.RETRY_DELAY * (retryCount + 1));

        return this.executeQuery(sql, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Close the current connection properly
   */
  private async closeCurrentConnection(): Promise<void> {
    if (this.state.connection) {
      try {
        console.log('ConnectionManager: Closing existing connection');

        // Try to clean up temporary files
        try {
          await this.state.connection.query("CALL IF EXISTS delete_files_in_directory('browser-data/tmp')");
        } catch (cleanupError) {
          console.warn('ConnectionManager: Cleanup warning (non-critical):', cleanupError);
        }

        await this.state.connection.close();
        console.log('ConnectionManager: Connection closed successfully');
      } catch (error) {
        console.warn('ConnectionManager: Error closing connection (non-critical):', error);
      } finally {
        this.state.connection = null;
        this.state.isHealthy = false;
      }
    }
  }

  /**
   * Force refresh of the connection
   */
  async refreshConnection(): Promise<AsyncDuckDBConnection | null> {
    console.log('ConnectionManager: Forcing connection refresh');
    this.state.isHealthy = false;
    return this.getConnection();
  }

  /**
   * Get connection statistics
   */
  getStats(): { connectionCount: number; isHealthy: boolean; lastHealthCheck: number } {
    return {
      connectionCount: this.state.connectionCount,
      isHealthy: this.state.isHealthy,
      lastHealthCheck: this.state.lastHealthCheck
    };
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    console.log('ConnectionManager: Cleaning up resources');
    await this.closeCurrentConnection();
    this.db = null;
  }

  /**
   * Wait for mutex to be released
   */
  private async waitForMutex(): Promise<void> {
    const maxWait = 10000; // 10 seconds
    const startTime = Date.now();

    while (this.connectionMutex && (Date.now() - startTime) < maxWait) {
      await this.sleep(100);
    }

    if (this.connectionMutex) {
      console.warn('ConnectionManager: Mutex timeout - forcing release');
      this.connectionMutex = false;
    }
  }

  /**
   * Simple sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const connectionManager = DuckDBConnectionManager.getInstance();