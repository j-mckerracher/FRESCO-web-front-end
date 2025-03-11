import React, { useState } from "react";
import ButtonPrimary from "@/components/ButtonPrimary";

interface DateRangeSelectorProps {
    maxTimeWindowDays: number;
    onContinue: (startDate: Date, endDate: Date) => void;
}

const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
                                                                 maxTimeWindowDays,
                                                                 onContinue,
                                                             }) => {
    const [startDate, setStartDate] = useState<string>("");
    const [endDate, setEndDate] = useState<string>("");
    const [error, setError] = useState<string | null>(null);

    // Helper to validate the date range
    const validateDateRange = () => {
        if (!startDate || !endDate) {
            setError("Please select both start and end dates");
            return false;
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (end < start) {
            setError("End date cannot be before start date");
            return false;
        }

        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > maxTimeWindowDays) {
            setError(`Time window cannot exceed ${maxTimeWindowDays} days`);
            return false;
        }

        setError(null);
        return true;
    };

    const handleContinue = () => {
        if (validateDateRange()) {
            onContinue(new Date(startDate), new Date(endDate));
        }
    };

    return (
        <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto p-8 bg-zinc-900 rounded-lg border border-zinc-800">
            <h1 className="text-2xl font-medium mb-8 text-purdue-boilermakerGold">
                Select Time Window
            </h1>

            <div className="w-full flex flex-col space-y-6 mb-8">
                <div className="flex flex-col">
                    <label htmlFor="start-date" className="text-white mb-2 text-lg">
                        Start Date:
                    </label>
                    <input
                        id="start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="p-3 rounded bg-zinc-800 text-white border border-zinc-700 focus:border-purdue-boilermakerGold focus:outline-none"
                    />
                </div>

                <div className="flex flex-col">
                    <label htmlFor="end-date" className="text-white mb-2 text-lg">
                        End Date:
                    </label>
                    <input
                        id="end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="p-3 rounded bg-zinc-800 text-white border border-zinc-700 focus:border-purdue-boilermakerGold focus:outline-none"
                    />
                </div>
            </div>

            {error && <p className="text-red-500 mb-6 text-center">{error}</p>}

            <div className="text-white mb-8 text-center">
                <span className="block mb-2">Maximum allowed time window:</span>
                <span className="text-xl font-semibold text-purdue-boilermakerGold">
          {maxTimeWindowDays} days
        </span>
            </div>

            <ButtonPrimary
                label="Continue to Histogram"
                onClick={handleContinue}
                disabled={!startDate || !endDate}
            />
        </div>
    );
};

export default DateRangeSelector;