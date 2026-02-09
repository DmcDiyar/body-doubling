'use client';

import { motion } from 'framer-motion';

interface TimeRangeToggleProps {
  range: 'week' | 'month';
  onChange: (range: 'week' | 'month') => void;
}

/**
 * Toggle between week and month view.
 */
export function TimeRangeToggle({ range, onChange }: TimeRangeToggleProps) {
  return (
    <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
      {(['week', 'month'] as const).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className="relative flex-1 py-2 px-4 rounded-lg text-sm transition-colors"
        >
          {range === r && (
            <motion.div
              layoutId="range-indicator"
              className="absolute inset-0 bg-white/10 rounded-lg"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          <span className={`relative z-10 ${range === r ? 'text-white font-medium' : 'text-gray-500'}`}>
            {r === 'week' ? 'Bu Hafta' : 'Bu Ay'}
          </span>
        </button>
      ))}
    </div>
  );
}
