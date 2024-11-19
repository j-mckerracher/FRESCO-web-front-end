import { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

enum PlotType {
  LinePlot,
  NumericalHistogram,
  CategoricalHistogram,
}

export interface VgPlotProps {
  db: AsyncDuckDB;
  conn: AsyncDuckDBConnection;
  crossFilter: unknown;
  dbLoading: boolean;
  dataLoading: boolean;
  tableName: string;
  xAxis?: string;
  columnName: string;
  plotType: PlotType;
  width: number;
  height: number;
}

const FILL_COLOR = "#CFB991";

export {FILL_COLOR as BOIILERMAKER_GOLD, PlotType};