// src/lib/duck.ts
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { connectionManager } from '@/util/connectionManager';

export async function getConn(db: AsyncDuckDB): Promise<AsyncDuckDBConnection> {
  // Use connection manager instead of creating new connections
  const conn = await connectionManager.getConnection();
  if (!conn) {
    throw new Error('Failed to get database connection');
  }
  return conn;
}

export async function createOrReplaceView(
  db: AsyncDuckDB,
  viewName: string,
  sql: string,
  params?: Record<string, unknown>
): Promise<void> {
  try {
    // Optional paramization for clarity (simple string replace here; adopt prepared stmts if you prefer)
    let stmt = sql;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        const val = typeof v === 'string' ? `'${v}'` : String(v);
        stmt = stmt.replaceAll(`:${k}`, val);
      }
    }

    // Use connection manager to execute queries with automatic retry
    await connectionManager.executeQuery(`DROP VIEW IF EXISTS ${viewName};`);
    await connectionManager.executeQuery(`CREATE VIEW ${viewName} AS ${stmt};`);

    console.log(`Successfully created view: ${viewName}`);
  } catch (error) {
    console.error(`Failed to create view ${viewName}:`, error);
    throw error;
  }
}

/** Rough resolution helper based on current span in ms */
export function timeResolution(start: Date, end: Date): '15m' | '5m' | '1m' | 'raw' {
  const span = end.getTime() - start.getTime();
  if (span > 2 * 24 * 3600_000) return '15m';
  if (span > 6 * 3600_000) return '5m';
  if (span > 1 * 3600_000) return '1m';
  return 'raw';
}

/** DuckDB date_trunc expression for the chosen resolution */
export function truncExpr(res: ReturnType<typeof timeResolution>, col = 'time'): string {
  switch (res) {
    case '15m': return `date_trunc('minute', ${col}) - ((extract(minute from ${col})::INT % 15) * interval '1 minute')`;
    case '5m':  return `date_trunc('minute', ${col}) - ((extract(minute from ${col})::INT % 5) * interval '1 minute')`;
    case '1m':  return `date_trunc('minute', ${col})`;
    case 'raw': return col;
  }
}