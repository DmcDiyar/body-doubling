'use client';

import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CITIES } from '@/lib/city-detection';
import { CITY_GEO, TURKEY_CENTER, type CityActivity } from '@/lib/stream-events';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGl5YXJhbHRhbngiLCJhIjoiY21neHNoNnplMThveTJtcWs4cHFtdnBoMCJ9.6K0ic338OsVQsG5ZkT5BFQ';

interface MapboxCityMapProps {
  cities: CityActivity[];
  userCityId: string | null;
  onCityClick: (cityId: string) => void;
}

function getMarkerColor(activeUsers: number): string {
  if (activeUsers >= 50) return '#ef4444';
  if (activeUsers >= 10) return '#fb923c';
  if (activeUsers >= 1) return '#8b5cf6';
  return '#475569';
}

function getMarkerSize(activeUsers: number): number {
  if (activeUsers >= 50) return 28;
  if (activeUsers >= 10) return 22;
  if (activeUsers >= 1) return 16;
  return 10;
}

export function MapboxCityMap({ cities, userCityId, onCityClick }: MapboxCityMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, { marker: mapboxgl.Marker; el: HTMLDivElement }>>(new Map());

  // Build activity lookup
  const activityMap = useRef<Record<string, CityActivity>>({});
  useEffect(() => {
    const map: Record<string, CityActivity> = {};
    for (const c of cities) map[c.city_id] = c;
    activityMap.current = map;
  }, [cities]);

  // Create/update marker DOM
  const updateMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const activeCities = CITIES.filter((c) => CITY_GEO[c.id] && c.id !== 'abroad');

    for (const city of activeCities) {
      const geo = CITY_GEO[city.id];
      if (!geo) continue;

      const activity = activityMap.current[city.id];
      const activeUsers = activity?.active_users ?? 0;
      const isUser = city.id === userCityId;
      const color = getMarkerColor(activeUsers);
      const size = getMarkerSize(activeUsers);

      const existing = markersRef.current.get(city.id);

      if (existing) {
        // Update existing marker
        const el = existing.el;
        const dot = el.querySelector('.city-dot') as HTMLElement;
        const pulse = el.querySelector('.city-pulse') as HTMLElement;
        const label = el.querySelector('.city-label') as HTMLElement;
        const count = el.querySelector('.city-count') as HTMLElement;

        if (dot) {
          dot.style.width = `${size}px`;
          dot.style.height = `${size}px`;
          dot.style.backgroundColor = color;
          dot.style.boxShadow = activeUsers > 0
            ? `0 0 ${size}px ${color}80, 0 0 ${size * 2}px ${color}40`
            : 'none';
          dot.style.border = isUser ? '2px solid #ffcb77' : '1px solid rgba(255,255,255,0.2)';
        }
        if (pulse) {
          pulse.style.display = activeUsers > 0 ? 'block' : 'none';
          pulse.style.borderColor = color;
        }
        if (label) {
          label.style.color = isUser ? '#ffcb77' : 'rgba(255,255,255,0.7)';
          label.textContent = `${city.emoji} ${city.name}`;
        }
        if (count) {
          count.style.display = activeUsers > 0 ? 'block' : 'none';
          count.textContent = `${activeUsers} aktif`;
        }
      } else {
        // Create new marker
        const el = document.createElement('div');
        el.className = 'city-marker-container';
        el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;';

        el.innerHTML = `
          <span class="city-label" style="
            font-size:10px;
            color:${isUser ? '#ffcb77' : 'rgba(255,255,255,0.7)'};
            margin-bottom:4px;
            white-space:nowrap;
            text-shadow:0 1px 3px rgba(0,0,0,0.8);
            font-weight:${isUser ? 'bold' : 'normal'};
            pointer-events:none;
          ">${city.emoji} ${city.name}</span>
          <div style="position:relative;display:flex;align-items:center;justify-content:center;">
            <div class="city-pulse" style="
              position:absolute;
              width:${size * 2.5}px;
              height:${size * 2.5}px;
              border-radius:50%;
              border:1px solid ${color};
              opacity:0;
              display:${activeUsers > 0 ? 'block' : 'none'};
              animation:pulse-ring 2s ease-out infinite;
            "></div>
            <div class="city-dot" style="
              width:${size}px;
              height:${size}px;
              border-radius:50%;
              background-color:${color};
              border:${isUser ? '2px solid #ffcb77' : '1px solid rgba(255,255,255,0.2)'};
              box-shadow:${activeUsers > 0 ? `0 0 ${size}px ${color}80, 0 0 ${size * 2}px ${color}40` : 'none'};
              transition:all 0.5s ease;
            "></div>
          </div>
          <span class="city-count" style="
            font-size:9px;
            color:rgba(255,255,255,0.5);
            margin-top:2px;
            display:${activeUsers > 0 ? 'block' : 'none'};
            pointer-events:none;
            text-shadow:0 1px 3px rgba(0,0,0,0.8);
          ">${activeUsers} aktif</span>
        `;

        el.addEventListener('click', () => onCityClick(city.id));

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([geo.lng, geo.lat])
          .addTo(map);

        markersRef.current.set(city.id, { marker, el });
      }
    }
  }, [userCityId, onCityClick]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const userGeo = userCityId ? CITY_GEO[userCityId] : null;
    const center: [number, number] = userGeo
      ? [userGeo.lng, userGeo.lat]
      : [TURKEY_CENTER.lng, TURKEY_CENTER.lat];
    const zoom = userGeo ? 7 : TURKEY_CENTER.zoom;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center,
      zoom,
      attributionControl: false,
      pitch: 20,
      bearing: 0,
      minZoom: 3,
      maxZoom: 14,
    });

    // Anime atmosphere: fog + sky
    map.on('style.load', () => {
      map.setFog({
        color: 'rgb(15, 23, 42)',
        'high-color': 'rgb(30, 27, 75)',
        'horizon-blend': 0.08,
        'space-color': 'rgb(10, 10, 30)',
        'star-intensity': 0.3,
      });
    });

    map.on('load', () => {
      updateMarkers();
    });

    // Disable rotation for simplicity
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    mapRef.current = map;

    const currentMarkers = markersRef.current;
    return () => {
      currentMarkers.forEach(({ marker }) => marker.remove());
      currentMarkers.clear();
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers when data changes
  useEffect(() => {
    if (mapRef.current?.loaded()) {
      updateMarkers();
    }
  }, [cities, userCityId, updateMarkers]);

  // Fly to user city when it changes
  useEffect(() => {
    if (!mapRef.current || !userCityId) return;
    const geo = CITY_GEO[userCityId];
    if (!geo) return;

    mapRef.current.flyTo({
      center: [geo.lng, geo.lat],
      zoom: 7,
      duration: 2000,
      essential: true,
    });
  }, [userCityId]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* CSS for pulse animation */}
      <style jsx global>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.5); opacity: 0.6; }
          100% { transform: scale(1.2); opacity: 0; }
        }
        .mapboxgl-ctrl-logo { display: none !important; }
        .mapboxgl-ctrl-attrib { display: none !important; }
      `}</style>

      {/* Empty state overlay */}
      {cities.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <p className="text-white/20 text-sm text-center px-8 bg-black/40 rounded-xl px-4 py-2 backdrop-blur-md">
            Henuz aktif sehir yok. Sen ilk ol!
          </p>
        </div>
      )}
    </div>
  );
}
