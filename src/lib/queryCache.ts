import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { createOrReplaceView } from './duck';

/**
 * Simple in-memory cache for DuckDB query results
 * Keyed by sql+params+selectionHash for cache invalidation on filter changes
 */
class QueryCache {
  private cache = new Map<string, { result: any; timestamp: number }>();
  private maxSize = 100; // Limit cache size
  private ttl = 5 * 60 * 1000; // 5 minutes TTL

  private generateKey(sql: string, params: Record<string, unknown> = {}, selectionHash = ''): string {
    return `${sql}:${JSON.stringify(params)}:${selectionHash}`;
  }

  set(sql: string, result: any, params: Record<string, unknown> = {}, selectionHash = ''): void {
    const key = this.generateKey(sql, params, selectionHash);
    
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  get(sql: string, params: Record<string, unknown> = {}, selectionHash = ''): any | null {
    const key = this.generateKey(sql, params, selectionHash);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.result;
  }

  clear(): void {
    this.cache.clear();
  }

  // Invalidate all entries with a specific selectionHash
  invalidateSelection(selectionHash: string): void {
    for (const [key, _] of this.cache) {
      if (key.endsWith(`:${selectionHash}`)) {
        this.cache.delete(key);
      }
    }
  }
}

export const queryCache = new QueryCache();

/**
 * Cached version of createOrReplaceView with memo support
 */
export async function createOrReplaceViewCached(
  db: AsyncDuckDB,
  viewName: string,
  sql: string,
  params: Record<string, unknown> = {},
  selectionHash = ''
): Promise<void> {
  const cached = queryCache.get(sql, params, selectionHash);
  if (cached) {
    console.log(`Cache hit for view ${viewName}`);
    return cached;
  }

  console.log(`Cache miss for view ${viewName}, executing query`);
  const result = await createOrReplaceView(db, viewName, sql, params);
  queryCache.set(sql, result, params, selectionHash);
  return result;
}