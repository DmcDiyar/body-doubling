'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentSceneTime, SCENE_CONFIG, type SceneTime } from '@/lib/stream-events';

interface VideoSceneProps {
  focusMode: boolean;
}

/**
 * Video scene — ambient presence layer.
 * Time-based scene switching (morning/afternoon/evening/night).
 * Starts muted (browser autoplay policy), user can unmute via button.
 */
export function VideoScene({ focusMode }: VideoSceneProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [sceneTime, setSceneTime] = useState<SceneTime>(getCurrentSceneTime);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
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
    videoRef.current = el;
    if (el) {
      el.muted = true; // Start muted for autoplay
      el.play().catch(() => {/* autoplay blocked */});
    }
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
      // If unmuting and video paused, try to play
      if (!newMuted && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [isMuted]);

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
            loop
            playsInline
            className={`w-full h-full object-cover transition-all duration-1000 ${
              focusMode ? 'brightness-75 saturate-75' : 'brightness-75 saturate-75'
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
      {!focusMode && (
        <div className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none bg-gradient-to-t from-black/70 to-transparent" />
      )}

      {/* Sound toggle button */}
      <button
        onClick={toggleMute}
        className="absolute bottom-4 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-md border border-white/10 hover:bg-black/70 transition-all"
        title={isMuted ? 'Sesi Ac' : 'Sesi Kapat'}
      >
        <span className="text-sm">
          {isMuted ? '🔇' : '🔊'}
        </span>
      </button>
    </div>
  );
}
