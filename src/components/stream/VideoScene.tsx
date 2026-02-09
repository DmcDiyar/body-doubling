'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentSceneTime, SCENE_CONFIG, type SceneTime } from '@/lib/stream-events';

interface VideoSceneProps {
  focusMode: boolean;
}

/**
 * Left panel video scene — ambient presence layer.
 * NOT interactive (no play/pause controls).
 * Time-based scene switching (morning/afternoon/evening/night).
 */
export function VideoScene({ focusMode }: VideoSceneProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sceneTime, setSceneTime] = useState<SceneTime>(getCurrentSceneTime);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const scene = SCENE_CONFIG[sceneTime];

  // Check scene time every 60s
  useEffect(() => {
    const check = () => {
      const newTime = getCurrentSceneTime();
      if (newTime !== sceneTime) {
        setIsTransitioning(true);
        setTimeout(() => {
          setSceneTime(newTime);
          setIsTransitioning(false);
        }, 1500);
      }
    };

    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [sceneTime]);

  // Auto-play video
  const handleVideoRef = useCallback((el: HTMLVideoElement | null) => {
    if (el) {
      (videoRef as React.MutableRefObject<HTMLVideoElement>).current = el;
      el.play().catch(() => {/* autoplay blocked, ignore */});
    }
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* Video layer */}
      <AnimatePresence mode="wait">
        <motion.div
          key={sceneTime}
          initial={{ opacity: 0 }}
          animate={{ opacity: isTransitioning ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.5 }}
          className="absolute inset-0"
        >
          <video
            ref={handleVideoRef}
            src={scene.video}
            muted
            loop
            playsInline
            className={`w-full h-full object-cover transition-all duration-1000 ${
              focusMode ? 'brightness-50 saturate-50' : 'brightness-75 saturate-75'
            }`}
          />
        </motion.div>
      </AnimatePresence>

      {/* Gradient overlay — mood-based */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-3000"
        style={{
          background: `linear-gradient(135deg, ${scene.gradient[0]}15, ${scene.gradient[1]}10)`,
        }}
      />

      {/* Bottom gradient for chat readability */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none bg-gradient-to-t from-black/70 to-transparent" />

      {/* Focus mode overlay */}
      {focusMode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/30 pointer-events-none"
        />
      )}
    </div>
  );
}
