// src/lib/duck.ts
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export async function getConn(db: AsyncDuckDB): Promise<AsyncDuckDBConnection> {
  const conn = await db.connect();
  return conn;
}

export async function createOrReplaceView(
  db: AsyncDuckDB,
  viewName: string,
  sql: string,
  params?: Record<string, unknown>
): Promise<void> {
  const conn = await getConn(db);
  try {
    // Optional paramization for clarity (simple string replace here; adopt prepared stmts if you prefer)
    let stmt = sql;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        const val = typeof v === 'string' ? `'${v}'` : String(v);
        stmt = stmt.replaceAll(`:${k}`, val);
      }
    }
    await conn.query(`DROP VIEW IF EXISTS ${viewName};`);
    await conn.query(`CREATE VIEW ${viewName} AS ${stmt};`);
  } finally {
    await conn.close();
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