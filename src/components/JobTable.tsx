// src/components/JobTable.tsx
import React, { useEffect, useState } from 'react';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { getConn } from '@/lib/duck';

type JobRow = {
  jid: string;
  username: string | null;
  queue: string | null;
  exitcode: string | null;
  nhosts: number | null;
  ncores: number | null;
  timelimit: number | null;
  start_t: string;
  end_t: string;
  cpu_avg: number | null;
  mem_max: number | null;
};

export default function JobTable({
  db, table, limit = 1000
}: {
  db: AsyncDuckDB;
  table: string;
  limit?: number;
}) {
  const [rows, setRows] = useState<JobRow[]>([]);

  useEffect(() => {
    (async () => {
      const conn = await getConn(db);
      try {
        const q = await conn.query(`
          SELECT
            jid::VARCHAR AS jid,
            username,
            queue,
            exitcode,
            nhosts,
            ncores,
            timelimit,
            MIN(time) AS start_t,
            MAX(time) AS end_t,
            AVG(value_cpuuser) AS cpu_avg,
            MAX(value_memused) AS mem_max
          FROM ${table}
          GROUP BY 1,2,3,4,5,6,7
          ORDER BY end_t DESC
          LIMIT ${limit};
        `);
        const data: JobRow[] = [];
        for (let i = 0; i < q.rows; i++) {
          const r: any = {};
          for (const c of q.schema.fields) {
            r[c.name] = q.get(c.name, i);
          }
          data.push(r as JobRow);
        }
        setRows(data);
      } finally {
        await conn.close();
      }
    })();
  }, [db, table, limit]);

  return (
    <div className="rounded border bg-white overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            {['jid', 'username', 'queue', 'exitcode', 'nhosts', 'ncores', 'timelimit', 'start_t', 'end_t', 'cpu_avg', 'mem_max'].map(h => (
              <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="px-3 py-2 font-mono">{r.jid}</td>
              <td className="px-3 py-2">{r.username ?? ''}</td>
              <td className="px-3 py-2">{r.queue ?? ''}</td>
              <td className="px-3 py-2">{r.exitcode ?? ''}</td>
              <td className="px-3 py-2">{r.nhosts ?? ''}</td>
              <td className="px-3 py-2">{r.ncores ?? ''}</td>
              <td className="px-3 py-2">{r.timelimit ?? ''}</td>
              <td className="px-3 py-2">{r.start_t}</td>
              <td className="px-3 py-2">{r.end_t}</td>
              <td className="px-3 py-2">{r.cpu_avg?.toFixed(2) ?? ''}</td>
              <td className="px-3 py-2">{r.mem_max?.toFixed(2) ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}