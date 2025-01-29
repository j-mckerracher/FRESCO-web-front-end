"use client";
import * as vg from "@uwdata/vgplot";
import Header from "@/components/Header";
import VgPlot from "@/components/vgplot";
import { useDuckDb } from "duckdb-wasm-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { PlotType } from "@/components/component_types";
import MultiSelect from "@/components/multi-select";
import Vgmenu from "@/components/vgmenu";
import { startSingleQuery } from "@/util/client";
import LoadingAnimation from "@/components/LoadingAnimation";
// import { BounceLoader } from "react-spinners";

const COLUMN_NAMES = [
  { value: "time", label: "Time", numerical: true, linePlot: false },
  {
    value: "submit_time",
    label: "Submit Time",
    numerical: true,
    linePlot: false,
  },
  {
    value: "start_time",
    label: "Start Time",
    numerical: true,
    linePlot: false,
  },
  { value: "end_time", label: "End Time", numerical: true, linePlot: false },
  { value: "timelimit", label: "Time Limit", numerical: true, linePlot: false },
  {
    value: "nhosts",
    label: "Number of Hosts",
    numerical: false,
    linePlot: false,
  },
  {
    value: "ncores",
    label: "Number of Cores",
    numerical: true,
    linePlot: false,
  },
  { value: "account", label: "Account", numerical: false, linePlot: false },
  { value: "queue", label: "Queue", numerical: false, linePlot: false },
  { value: "host", label: "Host", numerical: false, linePlot: false },
  { value: "jid", label: "Job ID", numerical: false, linePlot: false },
  { value: "unit", label: "Unit", numerical: false, linePlot: false },
  { value: "jobname", label: "Job Name", numerical: false, linePlot: false },
  { value: "exitcode", label: "Exit Code", numerical: false, linePlot: false },
  { value: "host_list", label: "Host List", numerical: false, linePlot: false },
  { value: "username", label: "Username", numerical: false, linePlot: false },
  {
    value: "value_cpuuser",
    label: "CPU Usage",
    numerical: true,
    linePlot: true,
  },
  { value: "value_gpu", label: "GPU Usage", numerical: true, linePlot: true },
  {
    value: "value_memused",
    label: "Memory Used",
    numerical: true,
    linePlot: true,
  },
  {
    value: "value_memused_minus_diskcache",
    label: "Memory Used Minus Disk Cache",
    numerical: true,
    linePlot: true,
  },
  { value: "value_nfs", label: "NFS Usage", numerical: true, linePlot: true },
  {
    value: "value_block",
    label: "Block Usage",
    numerical: true,
    linePlot: true,
  },
];
const value_to_numerical = new Map(
  COLUMN_NAMES.map((col) => [col.value, col.numerical])
);
const column_to_formatted = new Map([
  ["time", "Time"],
  ["submit_time", "Submit Time"],
  ["start_time", "Start Time"],
  ["end_time", "End Time"],
  ["timelimit", "Time Limit"],
  ["nhosts", "Number of Hosts"],
  ["ncores", "Number of Cores"],
  ["account", "Account"],
  ["queue", "Queue"],
  ["host", "Host"],
  ["jid", "Job ID"],
  ["unit", "Unit"],
  ["jobname", "Job Name"],
  ["exitcode", "Exit Code"],
  ["host_list", "Host List"],
  ["username", "Username"],
  ["value_cpuuser", "CPU Usage"],
  ["value_gpu", "GPU Usage"],
  ["value_memused", "Memory Used"],
  ["value_memused_minus_diskcache", "Memory Used Minus Disk Cache"],
  ["value_nfs", "NFS Usage"],
  ["value_block", "Block Usage"],
]);

const DataAnalysis = () => {
  const { db, loading, error } = useDuckDb();
  const [dataloading, setDataLoading] = useState(true);
  const [histogramColumns, setHistogramColumns] = useState<
    { value: string; label: string }[]
  >([{ value: "time", label: "Time" }]);
  const [linePlotColumns, setLinePlotColumns] = useState<
    { value: string; label: string }[]
  >([]);
  const conn = useRef<AsyncDuckDBConnection | undefined>(undefined);
  const crossFilter = useRef(null);

  const loadData = useCallback(async () => {
    if (!loading && db && dataloading && window) {
      setDataLoading(true);
      conn.current = await db.connect();
      await conn.current.query(
        "CREATE TABLE IF NOT EXISTS job_data ( time timestamptz NULL, submit_time timestamptz NULL, start_time timestamptz NULL, end_time timestamptz NULL, timelimit float8 NULL, nhosts int8 NULL, ncores int8 NULL, account text NULL, queue text NULL, host text NULL, jid text NULL, unit text NULL, jobname text NULL, exitcode text NULL, host_list text NULL, username text NULL, value_cpuuser float8 NULL, value_gpu float8 NULL, value_memused float8 NULL, value_memused_minus_diskcache float8 NULL, value_nfs float8 NULL, value_block float8 NULL );"
      );

      console.log(window.localStorage.getItem("SQLQuery"));
      const sqlQuery = window.localStorage.getItem("SQLQuery");
      if (sqlQuery) {
        await startSingleQuery(sqlQuery, db, "job_data", 500000);
      } else {
        console.error("SQLQuery is null");
      }
      await conn.current.query("LOAD icu");
      await conn.current.query("SET TimeZone='America/New_York'");
      await conn.current.query(
        "ALTER TABLE job_data ALTER time TYPE TIMESTAMP"
      );
      await conn.current.query(
        "ALTER TABLE job_data ALTER submit_time TYPE TIMESTAMP"
      );
      await conn.current.query(
        "ALTER TABLE job_data ALTER start_time TYPE TIMESTAMP"
      );
      await conn.current.query(
        "ALTER TABLE job_data ALTER end_time TYPE TIMESTAMP"
      );

      //@ts-expect-error idk
      vg.coordinator().databaseConnector(
        vg.wasmConnector({
          duckdb: db,
          connection: conn.current,
        })
      );
      crossFilter.current = vg.Selection.crossfilter();
      setDataLoading(false);
    }
    if (error) {
      console.log(error);
    }
  }, [dataloading, db, error, loading]);

  useEffect(() => {
    loadData();
    // window.selection = crossFilter;
  }, [loadData]);

  return (
    <div className="bg-black min-h-screen flex flex-col">
      <Header />
      {db == undefined || conn.current == undefined || dataloading ? (
        <LoadingAnimation />
      ) : (
        <div className="flex flex-row-reverse min-w-scren">
          <div className="w-1/4 px-4 flex flex-col  gap-4">
            <div>
              <h1 className="text-white text-lg">
                Choose columns to show as histograms:
              </h1>
              <MultiSelect
                options={COLUMN_NAMES}
                selected={histogramColumns}
                onChange={setHistogramColumns}
                className=""
              />
            </div>
            <div>
              <h1 className="text-white text-lg">
                Choose columns to show as line plots:
              </h1>
              <MultiSelect
                options={COLUMN_NAMES.filter((item) => {
                  return item.linePlot;
                })}
                selected={linePlotColumns}
                onChange={setLinePlotColumns}
                className=""
              />
            </div>
            <Vgmenu
              db={db}
              conn={conn.current}
              crossFilter={crossFilter.current}
              dbLoading={loading}
              dataLoading={dataloading}
              tableName={"job_data"}
              columnName={"host"}
              width={1200}
              label={"Choose a specific host: "}
            />
          </div>
          <div className="flex gap-y-6 flex-row flex-wrap min-w-[25%] max-w-[75%] justify-between px-5">
            {histogramColumns.map((col) => {
              if (!conn.current) return null;
              return (
                <VgPlot
                  key={col.value}
                  db={db}
                  conn={conn.current}
                  crossFilter={crossFilter.current}
                  dbLoading={loading}
                  dataLoading={dataloading}
                  tableName={"job_data"}
                  columnName={col.value}
                  width={0.75}
                  height={0.4}
                  plotType={
                    value_to_numerical.get(col.value)
                      ? PlotType.NumericalHistogram
                      : PlotType.CategoricalHistogram
                  }
                />
              );
            })}
            {linePlotColumns.map((col) => {
              if (!conn.current) return null;
              return (
                <VgPlot
                  key={col.value}
                  db={db}
                  conn={conn.current}
                  crossFilter={crossFilter.current}
                  dbLoading={loading}
                  dataLoading={dataloading}
                  tableName={"job_data"}
                  xAxis="time"
                  columnName={col.value}
                  width={0.75}
                  height={0.4}
                  plotType={PlotType.LinePlot}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default DataAnalysis;
export { column_to_formatted as column_pretty_names };
