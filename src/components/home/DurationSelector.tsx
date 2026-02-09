'use client';

import { motion } from 'framer-motion';

const DURATIONS = [
  { value: 25, label: '25', subtitle: 'Klasik' },
  { value: 50, label: '50', subtitle: 'Derin' },
  { value: 90, label: '90', subtitle: 'Maraton' },
] as const;

interface DurationSelectorProps {
  selected: number;
  onChange: (value: number) => void;
}

export function DurationSelector({ selected, onChange }: DurationSelectorProps) {
  return (
    <div className="flex items-center justify-center gap-4">
      {DURATIONS.map((d, i) => {
        const isSelected = selected === d.value;
        return (
          <motion.button
            key={d.value}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(d.value)}
            className={`relative flex flex-col items-center justify-center w-20 h-20 rounded-2xl transition-all ${
              isSelected
                ? 'bg-[#ffcb77]/20 border-2 border-[#ffcb77] shadow-lg shadow-[#ffcb77]/20'
                : 'bg-white/10 border-2 border-transparent hover:bg-white/15'
            }`}
          >
            {isSelected && (
              <motion.div
                layoutId="duration-glow"
                className="absolute inset-0 rounded-2xl bg-[#ffcb77]/10"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
            <span className={`text-2xl font-bold relative z-10 ${
              isSelected ? 'text-[#ffcb77]' : 'text-white/70'
            }`}>
              {d.label}
            </span>
            <span className={`text-[10px] relative z-10 ${
              isSelected ? 'text-[#ffcb77]/70' : 'text-white/40'
            }`}>
              {d.subtitle}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
