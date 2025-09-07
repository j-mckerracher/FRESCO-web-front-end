// src/components/FilterChips.tsx
import React from 'react';

export type Chip = { id: string; label: string };

export default function FilterChips({
  chips,
  onClearOne,
  onClearAll
}: {
  chips: Chip[];
  onClearOne(id: string): void;
  onClearAll(): void;
}) {
  if (!chips.length) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chips.map(ch => (
        <span key={ch.id} className="inline-flex items-center gap-2 bg-gray-100 text-gray-800 rounded-full px-3 py-1 text-xs">
          {ch.label}
          <button onClick={() => onClearOne(ch.id)} className="rounded-full w-4 h-4 text-xs leading-4 text-gray-600 hover:bg-gray-200">×</button>
        </span>
      ))}
      <button onClick={onClearAll} className="text-xs text-blue-600 hover:underline">Clear all</button>
    </div>
  );
}