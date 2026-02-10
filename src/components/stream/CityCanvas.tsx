'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase-client';
import { CANVAS_SIZE, COLOR_PALETTE } from '@/lib/stream-events';

interface CityCanvasProps {
  cityId: string;
  cityName: string;
  cityEmoji: string;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * CityCanvas — 64x64 pixel art canvas for each city.
 * r/place style: click to place a pixel with trust-based cooldown.
 * Realtime updates via pixel_log subscription.
 */
export function CityCanvas({
  cityId,
  cityName,
  cityEmoji,
  isExpanded,
  onToggle,
}: CityCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixelBufferRef = useRef<Uint8Array>(new Uint8Array(CANVAS_SIZE * CANVAS_SIZE));
  const [selectedColor, setSelectedColor] = useState(2); // amber default
  const [isPlacing, setIsPlacing] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState(0);
  const [version, setVersion] = useState(0);

  const scale = isExpanded ? 6 : 3; // pixel size in CSS pixels
  const canvasPixelSize = CANVAS_SIZE * scale;

  // Render full canvas from buffer
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    for (let y = 0; y < CANVAS_SIZE; y++) {
      for (let x = 0; x < CANVAS_SIZE; x++) {
        const colorIdx = pixelBufferRef.current[y * CANVAS_SIZE + x];
        ctx.fillStyle = COLOR_PALETTE[colorIdx] || COLOR_PALETTE[0];
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }, [scale]);

  // Load canvas data
  useEffect(() => {
    async function loadCanvas() {
      const supabase = createClient();
      const { data } = await supabase.rpc('get_canvas', { p_city_id: cityId });

      if (data && typeof data === 'object' && 'pixels' in data) {
        const base64 = (data as { pixels: string }).pixels;
        const binary = atob(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          buffer[i] = binary.charCodeAt(i);
        }
        pixelBufferRef.current = buffer;
        setVersion((data as { version: number }).version);
      }

      renderCanvas();
    }
    loadCanvas();
  }, [cityId, renderCanvas]);

  // Re-render when scale changes (expand/collapse)
  useEffect(() => {
    renderCanvas();
  }, [scale, renderCanvas]);

  // Realtime: pixel_log subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`canvas-${cityId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pixel_log',
          filter: `city_id=eq.${cityId}`,
        },
        (payload) => {
          const { x, y, color } = payload.new as { x: number; y: number; color: number };
          // Update local buffer
          pixelBufferRef.current[y * CANVAS_SIZE + x] = color;
          // Render single pixel (efficient)
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.fillStyle = COLOR_PALETTE[color] || COLOR_PALETTE[0];
          ctx.fillRect(x * scale, y * scale, scale, scale);
          setVersion((v) => v + 1);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cityId, scale]);

  // Handle pixel click
  const handleCanvasClick = useCallback(
    async (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPlacing || Date.now() < cooldownEnd) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / scale);
      const y = Math.floor((e.clientY - rect.top) / scale);

      if (x < 0 || x >= CANVAS_SIZE || y < 0 || y >= CANVAS_SIZE) return;

      setIsPlacing(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc('place_pixel', {
          p_city_id: cityId,
          p_x: x,
          p_y: y,
          p_color: selectedColor,
        });

        if (!error && data === true) {
          // Optimistic update
          pixelBufferRef.current[y * CANVAS_SIZE + x] = selectedColor;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = COLOR_PALETTE[selectedColor];
            ctx.fillRect(x * scale, y * scale, scale, scale);
          }
          // Set cooldown (will be checked server-side anyway)
          setCooldownEnd(Date.now() + 15_000);
        }
      } finally {
        setIsPlacing(false);
      }
    },
    [cityId, selectedColor, isPlacing, cooldownEnd, scale],
  );

  const isOnCooldown = Date.now() < cooldownEnd;

  return (
    <div className="flex flex-col items-center">
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
      >
        <span className="text-sm">{cityEmoji}</span>
        <span className="text-white/70 text-xs font-medium">{cityName} Canvas</span>
        <span className="text-white/30 text-[9px]">v{version}</span>
        <span className="text-white/20 text-[10px]">{isExpanded ? '▼' : '▶'}</span>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center overflow-hidden"
          >
            {/* Canvas */}
            <div
              className="relative border border-white/10 rounded-lg overflow-hidden"
              style={{ width: canvasPixelSize, height: canvasPixelSize }}
            >
              <canvas
                ref={canvasRef}
                width={canvasPixelSize}
                height={canvasPixelSize}
                onClick={handleCanvasClick}
                className={`cursor-crosshair ${isPlacing || isOnCooldown ? 'opacity-70 cursor-wait' : ''}`}
              />

              {/* Grid overlay (expanded only) */}
              {isExpanded && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `
                      linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
                    `,
                    backgroundSize: `${scale}px ${scale}px`,
                  }}
                />
              )}
            </div>

            {/* Color palette */}
            <div className="flex gap-1.5 mt-3">
              {COLOR_PALETTE.map((color, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedColor(idx)}
                  className={`w-6 h-6 rounded-md border-2 transition-all ${
                    selectedColor === idx
                      ? 'border-[#ffcb77] scale-110 shadow-lg'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                  style={{ backgroundColor: color }}
                  title={`Renk ${idx}`}
                />
              ))}
            </div>

            {/* Status */}
            <p className="text-white/20 text-[9px] mt-2">
              {isOnCooldown
                ? 'Bekleniyor...'
                : isPlacing
                  ? 'Yerlestiriliyor...'
                  : 'Piksel yerlestirmek icin tikla'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
