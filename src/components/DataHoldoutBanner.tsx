import React from "react";

const DataHoldoutBanner: React.FC = () => {
  return (
    <div
      role="alert"
      className="w-full bg-purdue-rush text-black px-6 py-6 md:px-10 md:py-8"
    >
      <div className="max-w-5xl mx-auto flex items-start gap-4 text-lg md:text-xl font-semibold leading-relaxed">
        <span className="text-3xl md:text-4xl flex-shrink-0" aria-hidden="true">
          🚧
        </span>
        <p className="m-0">
          Temporary Data Holdout: Certain FRESCO data partitions are currently
          reserved as blind evaluation data for the active IEEE Global Student
          Challenge 2026. The complete dataset will be reinstated December 12th,
          2026{" "}
          <a
            href="https://www.computer.org/publications/tech-news/events/global-student-challenge-2026"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-bold hover:text-purdue-steel"
          >
            https://www.computer.org/publications/tech-news/events/global-student-challenge-2026
          </a>
        </p>
      </div>
    </div>
  );
};

export default DataHoldoutBanner;
