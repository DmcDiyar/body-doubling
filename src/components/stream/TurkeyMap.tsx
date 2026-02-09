'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CITIES, getCityInfo } from '@/lib/city-detection';
import { CITY_COORDS, type CityActivity } from '@/lib/stream-events';

interface TurkeyMapProps {
  cities: CityActivity[];
  userCityId: string | null;
  onCityClick: (cityId: string) => void;
}

// Simplified Turkey outline SVG path
const TURKEY_PATH =
  'M85,130 L105,115 L125,108 L150,100 L175,95 L195,98 L210,90 L225,95 L240,88 ' +
  'L260,92 L280,88 L305,82 L330,78 L355,75 L380,80 L405,75 L430,70 L460,68 ' +
  'L490,72 L520,68 L545,75 L570,70 L600,78 L625,82 L650,88 L670,95 L685,105 ' +
  'L690,115 L685,128 L675,140 L660,155 L645,168 L625,180 L605,195 L585,210 ' +
  'L565,218 L545,222 L520,218 L498,225 L475,235 L450,245 L425,255 L400,262 ' +
  'L375,258 L355,262 L330,268 L305,272 L280,268 L255,275 L230,268 L205,260 ' +
  'L180,252 L155,245 L130,238 L110,228 L95,218 L82,205 L75,188 L72,168 L75,148 Z';

/**
 * Get heatmap color based on active user count
 */
function getHeatColor(activeUsers: number): string {
  if (activeUsers >= 50) return 'rgba(239, 68, 68, 0.8)';   // Red
  if (activeUsers >= 10) return 'rgba(251, 146, 60, 0.7)';   // Orange
  if (activeUsers >= 1)  return 'rgba(59, 130, 246, 0.6)';   // Blue
  return 'rgba(100, 116, 139, 0.3)';                          // Gray
}

/**
 * Get dot radius based on active user count
 */
function getDotRadius(activeUsers: number): number {
  if (activeUsers <= 0) return 4;
  return Math.min(4 + activeUsers / 5, 16);
}

/**
 * Get glow radius for heatmap effect
 */
function getGlowRadius(activeUsers: number): number {
  if (activeUsers <= 0) return 0;
  return Math.min(15 + activeUsers, 50);
}

export function TurkeyMap({ cities, userCityId, onCityClick }: TurkeyMapProps) {
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);

  // Build city activity lookup
  const activityMap = useMemo(() => {
    const map: Record<string, CityActivity> = {};
    for (const c of cities) {
      map[c.city_id] = c;
    }
    return map;
  }, [cities]);

  // Only show cities that have coordinates
  const mappedCities = useMemo(
    () => CITIES.filter((c) => CITY_COORDS[c.id] && c.id !== 'abroad'),
    [],
  );

  // Top 5 cities for label visibility
  const top5 = useMemo(() => {
    return [...cities]
      .sort((a, b) => b.active_users - a.active_users)
      .slice(0, 5)
      .map((c) => c.city_id);
  }, [cities]);

  return (
    <div className="relative w-full h-full bg-[#0f172a] overflow-hidden">
      {/* SVG Map */}
      <svg
        viewBox="50 50 670 280"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Defs for filters */}
        <defs>
          {mappedCities.map((city) => {
            const activity = activityMap[city.id];
            const glowR = getGlowRadius(activity?.active_users ?? 0);
            if (glowR <= 0) return null;
            return (
              <filter key={`glow-${city.id}`} id={`glow-${city.id}`} x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation={glowR / 3} result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            );
          })}
        </defs>

        {/* Turkey outline */}
        <path
          d={TURKEY_PATH}
          fill="rgba(30, 41, 59, 0.8)"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="1.5"
        />

        {/* Heatmap glow circles */}
        {mappedCities.map((city) => {
          const coords = CITY_COORDS[city.id];
          if (!coords) return null;
          const activity = activityMap[city.id];
          const activeUsers = activity?.active_users ?? 0;
          if (activeUsers <= 0) return null;

          return (
            <circle
              key={`heat-${city.id}`}
              cx={coords.x}
              cy={coords.y}
              r={getGlowRadius(activeUsers)}
              fill={getHeatColor(activeUsers)}
              opacity={0.3}
              filter={`url(#glow-${city.id})`}
            />
          );
        })}

        {/* City dots */}
        {mappedCities.map((city) => {
          const coords = CITY_COORDS[city.id];
          if (!coords) return null;
          const activity = activityMap[city.id];
          const activeUsers = activity?.active_users ?? 0;
          const isUser = city.id === userCityId;
          const isHovered = hoveredCity === city.id;
          const dotR = getDotRadius(activeUsers);
          const color = getHeatColor(activeUsers);

          return (
            <g
              key={city.id}
              className="cursor-pointer"
              onClick={() => onCityClick(city.id)}
              onMouseEnter={() => setHoveredCity(city.id)}
              onMouseLeave={() => setHoveredCity(null)}
            >
              {/* Pulse animation for active cities */}
              {activeUsers > 0 && (
                <circle
                  cx={coords.x}
                  cy={coords.y}
                  r={dotR}
                  fill="none"
                  stroke={color}
                  strokeWidth="1"
                  opacity="0.5"
                >
                  <animate
                    attributeName="r"
                    from={dotR}
                    to={dotR * 2}
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.5"
                    to="0"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* Main dot */}
              <circle
                cx={coords.x}
                cy={coords.y}
                r={isHovered ? dotR * 1.5 : dotR}
                fill={color}
                stroke={isUser ? '#ffcb77' : 'rgba(255,255,255,0.3)'}
                strokeWidth={isUser ? 2 : 0.5}
                className="transition-all duration-300"
              />

              {/* City label (top 5 or hovered) */}
              {(top5.includes(city.id) || isHovered || isUser) && (
                <text
                  x={coords.x}
                  y={coords.y - dotR - 6}
                  textAnchor="middle"
                  fill={isUser ? '#ffcb77' : 'rgba(255,255,255,0.7)'}
                  fontSize={isHovered ? 11 : 9}
                  fontWeight={isUser ? 'bold' : 'normal'}
                  className="pointer-events-none select-none"
                >
                  {city.emoji} {city.name}
                </text>
              )}

              {/* Active count on hover */}
              {isHovered && activeUsers > 0 && (
                <text
                  x={coords.x}
                  y={coords.y + dotR + 14}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.5)"
                  fontSize="9"
                  className="pointer-events-none select-none"
                >
                  {activeUsers} aktif
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Empty state when no city has activity */}
      {cities.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-white/20 text-sm text-center px-8">
            Henüz aktif şehir yok. Sen ilk ol!
          </p>
        </div>
      )}

      {/* Tooltip for hovered city (desktop) */}
      <AnimatePresence>
        {hoveredCity && (
          <CityTooltip
            cityId={hoveredCity}
            activity={activityMap[hoveredCity]}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CityTooltip({ cityId, activity }: { cityId: string; activity?: CityActivity }) {
  const info = getCityInfo(cityId);
  if (!info) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 5 }}
      className="absolute top-3 left-3 bg-black/80 backdrop-blur-md rounded-xl px-4 py-3 border border-white/10 pointer-events-none z-20"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{info.emoji}</span>
        <span className="text-white font-medium text-sm">{info.name}</span>
      </div>
      <div className="space-y-0.5">
        <p className="text-white/50 text-xs">
          Aktif: {activity?.active_users ?? 0} kişi
        </p>
        <p className="text-white/50 text-xs">
          Bugün: {activity?.today_minutes ?? 0} dk
        </p>
      </div>
    </motion.div>
  );
}
