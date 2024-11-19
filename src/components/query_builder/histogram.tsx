import * as vg from "@uwdata/vgplot";

import { useDuckDb } from "duckdb-wasm-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import ButtonPrimary from "../ButtonPrimary";
import stripTimezone from "@/util/util";
import { useRouter } from "next/router";

interface HistogramProps {
  readyToPlot: boolean;
}

const Histogram = ({ readyToPlot }: HistogramProps) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { db, loading, error } = useDuckDb();
  const plotsRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(window.innerWidth);
  const [height, setHeight] = useState(window.innerHeight);
  const [brush, setBrush] = useState(null);

  const updateDimensions = () => {
    setWidth(window.innerWidth);
    setHeight(window.innerHeight);
  };
  const getData = useCallback(async () => {
    if (db && !loading) {
      const conn = await db.connect();

      //@ts-expect-error idk
      vg.coordinator().databaseConnector(
        vg.wasmConnector({
          duckdb: db,
          connection: conn,
        })
      );
      const brush = vg.Selection.intersect();
      setBrush(brush);

      const plot = vg.plot(
        vg.rectY(vg.from("histogram"), {
          x: vg.bin("time"),
          y: vg.count(),
          inset: 1,
          fill: "#CFB991",
        }),
        vg.marginLeft(60),
        //@ts-expect-error idk
        vg.marginBottom(35),
        vg.intervalX({ as: brush }),
        vg.xDomain(vg.Fixed),
        vg.width(0.8 * width),
        vg.height(0.5 * height),
        vg.style({
          "font-size": "0.8rem",
        })
      );

      //@ts-expect-error idk
      plotsRef.current?.replaceChildren(plot);
    } else {
      console.error("Database is not initialized");
    }
  }, [db, height, loading, width]);

  const router = useRouter();

  useEffect(() => {
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  useEffect(() => {
    if (db && !loading && readyToPlot) {
      getData();
    }
  }, [getData, db, loading, readyToPlot]);

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <h1 className="text-xl font-medium mb-14">
        Drag across the histogram to select a slice of the dataset
      </h1>
      <div
        className="min-h-[60vh] overflow-visible text-base"
        ref={plotsRef}
      ></div>
      <ButtonPrimary
        onClick={() => {
          //@ts-expect-error idk
          if (brush.value) {
            const query = `SELECT * FROM job_data_small WHERE time BETWEEN '${stripTimezone(
              //@ts-expect-error idk
              brush.value[0]
              //@ts-expect-error idk
            )}' AND '${stripTimezone(brush.value[1])}'`;
            window.localStorage.setItem("SQLQuery", query);
            router.push("data_analysis");
          } else {
            alert("no selection made");
          }
        }}
        label="Query dataset"
      />
    </div>
  );
};

export default Histogram;
