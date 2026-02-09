'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CITIES } from '@/lib/city-detection';

interface CityPromptProps {
  onSelect: (cityId: string) => void;
  onSkip: () => void;
}

/**
 * Soft city prompt — not mandatory, shows after 1-2 days.
 * "Hangi şehirden odaklanıyorsun?"
 */
export function CityPrompt({ onSelect, onSkip }: CityPromptProps) {
  const [selected, setSelected] = useState<string | null>(null);

  // Show only Turkish cities (not 'abroad')
  const turkishCities = CITIES.filter((c) => c.id !== 'abroad');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 rounded-2xl p-5 border border-white/10"
    >
      <div className="text-center mb-4">
        <span className="text-3xl mb-2 block">🌆</span>
        <h3 className="text-white font-medium mb-1">Hangi şehirden odaklanıyorsun?</h3>
        <p className="text-gray-500 text-xs">
          Şehrini seç, sessiz enerjiyi hisset. Kimse senin kim olduğunu bilmeyecek.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4 max-h-48 overflow-y-auto">
        {turkishCities.map((city) => (
          <button
            key={city.id}
            onClick={() => setSelected(city.id)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl text-xs transition-all ${
              selected === city.id
                ? 'bg-[#ffcb77]/20 border border-[#ffcb77]/40 text-white'
                : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">{city.emoji}</span>
            <span className="truncate w-full text-center">{city.name}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => selected && onSelect(selected)}
          disabled={!selected}
          className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
            selected
              ? 'bg-[#ffcb77] text-[#1a1a2e]'
              : 'bg-white/10 text-gray-500 cursor-not-allowed'
          }`}
        >
          Şehrimi Seç
        </button>
        <button
          onClick={onSkip}
          className="text-gray-600 text-xs hover:text-gray-400 transition-colors"
        >
          Şimdi Değil
        </button>
      </div>
    </motion.div>
  );
}
