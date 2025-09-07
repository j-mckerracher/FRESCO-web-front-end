import { useEffect, useRef, useCallback } from 'react';
import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { createOrReplaceViewCached, queryCache } from '@/lib/queryCache';

/**
 * Custom hook for debounced database queries with caching
 * Debounces re-queries on selection/zoom changes by ~200ms
 */
export function useDebouncedQuery(
  db: AsyncDuckDB | null,
  viewName: string,
  sql: string,
  dependencies: any[],
  params: Record<string, unknown> = {},
  selectionHash = '',
  debounceMs = 200
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastQueryRef = useRef<string>('');

  const executeQuery = useCallback(async () => {
    if (!db || !sql.trim()) return;

    const queryKey = `${sql}:${JSON.stringify(params)}:${selectionHash}`;
    
    // Skip if same query is already pending
    if (lastQueryRef.current === queryKey) return;
    lastQueryRef.current = queryKey;

    try {
      await createOrReplaceViewCached(db, viewName, sql, params, selectionHash);
    } catch (error) {
      console.error(`Error executing debounced query for ${viewName}:`, error);
    }
  }, [db, viewName, sql, params, selectionHash]);

  useEffect(() => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new debounced timeout
    timeoutRef.current = setTimeout(executeQuery, debounceMs);

    // Cleanup timeout on unmount or dependency change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [executeQuery, debounceMs, ...dependencies]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
}

/**
 * Hook to get current selection hash for cache invalidation
 * This should be called from components that need to track selection changes
 */
export function useSelectionHash(crossFilter: any): string {
  // Simple hash based on crossFilter state
  // In a real implementation, you'd extract the actual filter predicates
  return crossFilter ? JSON.stringify(crossFilter).slice(0, 50) : '';
}

/**
 * Hook to clear cache when selections change
 */
export function useCacheInvalidation(selectionHash: string) {
  const previousHashRef = useRef<string>('');

  useEffect(() => {
    if (previousHashRef.current && previousHashRef.current !== selectionHash) {
      console.log('Selection changed, invalidating cache');
      queryCache.invalidateSelection(previousHashRef.current);
    }
    previousHashRef.current = selectionHash;
  }, [selectionHash]);
}