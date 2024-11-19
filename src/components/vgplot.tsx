"use client";
import * as vg from "@uwdata/vgplot";
import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { VgPlotProps } from "@/components/component_types";
import { BOIILERMAKER_GOLD, PlotType } from "./component_types";
import { column_pretty_names } from "@/pages/data_analysis";

const VgPlot: React.FC<VgPlotProps> = ({
  db,
  conn,
  crossFilter,
  dbLoading,
  dataLoading,
  tableName,
  xAxis = "",
  columnName,
  plotType,
  width,
  height,
}) => {
  const [windowWidth, setWindowWidth] = useState(0);
  const [windowHeight, setWindowHeight] = useState(0);
  const plotsRef = useRef<HTMLDivElement | null>(null);
  let title = "";
  switch (plotType) {
    case PlotType.CategoricalHistogram:
      title = `Frequency of ${column_pretty_names.get(columnName)}`;
      break;
    case PlotType.LinePlot:
      title = `${columnName} over ${xAxis}`;
      break;
    case PlotType.NumericalHistogram:
      title = `${column_pretty_names.get(columnName)} Distribution`;
      break;
  }

  const updateDimensions = () => {
    setWindowWidth(window.innerWidth);
    setWindowHeight(window.innerHeight);
  };

  useEffect(() => {
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  const setupDb = useCallback(async () => {
    if (!dbLoading && db && !dataLoading) {
      //@ts-expect-error idk
      vg.coordinator().databaseConnector(
        vg.wasmConnector({
          duckdb: db,
          connection: conn,
        })
      );

      let plot = undefined;
      switch (plotType) {
        case PlotType.LinePlot:
          plot = vg.plot(
            vg.lineY(vg.from(tableName, { filterBy: crossFilter }), {
              x: xAxis,
              y: columnName,
              inset: 0.5,
              stroke: BOIILERMAKER_GOLD,
            }),
            vg.dotY(vg.from(tableName, { filterBy: crossFilter }), {
              x: xAxis,
              y: columnName,
              inset: 0.5,
              stroke: BOIILERMAKER_GOLD,
            }),
            // vg.xDomain(vg.Fixed),
            vg.panZoomX(crossFilter),
            // vg.yDomain([-10, 110]),
            vg.marginLeft(75),
            vg.width(1200),
            vg.height(200)
          );
          break;
        case PlotType.NumericalHistogram:
          plot = vg.plot(
            vg.rectY(vg.from(tableName, { filterBy: crossFilter }), {
              x: vg.bin(columnName),
              y: vg.count(),
              inset: 1,
              fill: BOIILERMAKER_GOLD,
            }),
            vg.marginLeft(60),
            //@ts-expect-error idk
            vg.marginBottom(55),
            vg.intervalX({ as: crossFilter }),
            vg.xDomain(vg.Fixed),
            vg.width(width * windowWidth),
            vg.height(height * windowHeight),
            vg.style({
              "font-size": "0.8rem",
            })
          );
          break;
        case PlotType.CategoricalHistogram:
          const highlight = vg.Selection.intersect();

          plot = vg.plot(
            vg.rectY(vg.from(tableName, { filterBy: crossFilter }), {
              x: columnName,
              y: vg.count(),
              inset: 1,
              fill: BOIILERMAKER_GOLD,
            }),
            vg.marginLeft(60),
            //@ts-expect-error idk
            vg.marginBottom(55),
            vg.toggleX({ as: crossFilter }),
            vg.toggleX({ as: highlight }),
            vg.highlight({ by: highlight }),
            vg.xDomain(vg.Fixed),
            vg.width(width * windowWidth),
            // vg.height(height * windowHeight),
            vg.style({
              "font-size": "0.9rem",
            })
          );
          break;
      }

      //@ts-expect-error idk
      plotsRef.current?.replaceChildren(plot);
    }
  }, [
    dbLoading,
    db,
    dataLoading,
    conn,
    plotType,
    tableName,
    crossFilter,
    xAxis,
    columnName,
    width,
    windowWidth,
    height,
    windowHeight,
  ]);

  useEffect(() => {
    setupDb();
  }, [setupDb]);

  return (
    <div className="flex flex-col w-full text-white">
      <h1 className="text-center text-xl">{title}</h1>
      <div className="overflow-visible w-full" ref={plotsRef} />
    </div>
  );
};

export default React.memo(VgPlot);
