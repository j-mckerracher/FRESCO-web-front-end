import { AsyncDuckDB } from "@duckdb/duckdb-wasm";

/**
 * Creates or replaces a view in DuckDB
 * @param db DuckDB database instance
 * @param viewName Name of the view to create or replace
 * @param sql SQL query to define the view
 */
export async function createOrReplaceView(
  db: AsyncDuckDB,
  viewName: string,
  sql: string
): Promise<void> {
  try {
    const conn = await db.connect();
    try {
      // Drop the view if it exists
      await conn.query(`DROP VIEW IF EXISTS ${viewName}`);
      
      // Create the new view
      await conn.query(`CREATE VIEW ${viewName} AS ${sql}`);
      
      console.log(`View ${viewName} created successfully`);
    } finally {
      await conn.close();
    }
  } catch (error) {
    console.error(`Error creating view ${viewName}:`, error);
    throw error;
  }
}

/**
 * Creates or replaces a temporary view in DuckDB
 * @param db DuckDB database instance
 * @param viewName Name of the temporary view to create or replace
 * @param sql SQL query to define the temporary view
 */
export async function createOrReplaceTempView(
  db: AsyncDuckDB,
  viewName: string,
  sql: string
): Promise<void> {
  try {
    const conn = await db.connect();
    try {
      // Drop the temporary view if it exists
      await conn.query(`DROP VIEW IF EXISTS ${viewName}`);
      
      // Create the new temporary view
      await conn.query(`CREATE TEMPORARY VIEW ${viewName} AS ${sql}`);
      
      console.log(`Temporary view ${viewName} created successfully`);
    } finally {
      await conn.close();
    }
  } catch (error) {
    console.error(`Error creating temporary view ${viewName}:`, error);
    throw error;
  }
}

/**
 * Checks if a view exists in DuckDB
 * @param db DuckDB database instance
 * @param viewName Name of the view to check
 * @returns true if the view exists, false otherwise
 */
export async function viewExists(
  db: AsyncDuckDB,
  viewName: string
): Promise<boolean> {
  try {
    const conn = await db.connect();
    try {
      const result = await conn.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.views 
        WHERE table_name = '${viewName}'
      `);
      
      const rows = result.toArray();
      return rows[0]?.count > 0;
    } finally {
      await conn.close();
    }
  } catch (error) {
    console.error(`Error checking if view ${viewName} exists:`, error);
    return false;
  }
}
