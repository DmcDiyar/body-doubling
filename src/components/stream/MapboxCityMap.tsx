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

function getMarkerColor(activeUsers: number, isUser: boolean): string {
  if (isUser) return '#ffcb77'; // user's city always amber
  if (activeUsers >= 20) return '#ef4444'; // red hot
  if (activeUsers >= 5) return '#fb923c';  // orange warm
  if (activeUsers >= 1) return '#60a5fa';  // blue active
  return '#374151'; // gray inactive
}

function getMarkerSize(activeUsers: number): number {
  if (activeUsers >= 20) return 20;
  if (activeUsers >= 5) return 16;
  if (activeUsers >= 1) return 12;
  return 7;
}

function getGlowSize(activeUsers: number): number {
  if (activeUsers >= 20) return 40;
  if (activeUsers >= 5) return 28;
  if (activeUsers >= 1) return 18;
  return 0;
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
      const color = getMarkerColor(activeUsers, isUser);
      const size = getMarkerSize(activeUsers);
      const glowSize = getGlowSize(activeUsers);

      const existing = markersRef.current.get(city.id);

      if (existing) {
        // Update existing marker
        const el = existing.el;
        const dot = el.querySelector('.city-dot') as HTMLElement;
        const glow = el.querySelector('.city-glow') as HTMLElement;
        const pulse = el.querySelector('.city-pulse') as HTMLElement;
        const label = el.querySelector('.city-label') as HTMLElement;
        const count = el.querySelector('.city-count') as HTMLElement;

        if (dot) {
          dot.style.width = `${size}px`;
          dot.style.height = `${size}px`;
          dot.style.backgroundColor = color;
          dot.style.boxShadow = activeUsers > 0
            ? `0 0 ${size}px ${color}88`
            : 'none';
        }
        if (glow) {
          glow.style.width = `${glowSize}px`;
          glow.style.height = `${glowSize}px`;
          glow.style.backgroundColor = `${color}30`;
          glow.style.display = activeUsers > 0 ? 'block' : 'none';
        }
        if (pulse) {
          pulse.style.display = isUser ? 'block' : (activeUsers >= 5 ? 'block' : 'none');
          pulse.style.borderColor = color;
          pulse.style.width = `${size * 3}px`;
          pulse.style.height = `${size * 3}px`;
        }
        if (label) {
          label.style.color = isUser ? '#ffcb77' : (activeUsers > 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)');
          label.style.fontWeight = isUser ? 'bold' : 'normal';
          label.style.fontSize = isUser ? '11px' : '9px';
        }
        if (count) {
          count.style.display = activeUsers > 0 ? 'block' : 'none';
          count.textContent = `${activeUsers}`;
          count.style.backgroundColor = `${color}cc`;
        }
      } else {
        // Create new marker
        const el = document.createElement('div');
        el.className = 'city-marker-container';
        el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;position:relative;';

        el.innerHTML = `
          <span class="city-label" style="
            font-size:${isUser ? '11px' : '9px'};
            color:${isUser ? '#ffcb77' : (activeUsers > 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)')};
            margin-bottom:2px;
            white-space:nowrap;
            text-shadow:0 1px 4px rgba(0,0,0,0.9);
            font-weight:${isUser ? 'bold' : 'normal'};
            pointer-events:none;
            letter-spacing:0.3px;
          ">${city.name}</span>
          <div style="position:relative;display:flex;align-items:center;justify-content:center;">
            <div class="city-glow" style="
              position:absolute;
              width:${glowSize}px;
              height:${glowSize}px;
              border-radius:50%;
              background-color:${color}30;
              filter:blur(8px);
              display:${activeUsers > 0 ? 'block' : 'none'};
              pointer-events:none;
            "></div>
            <div class="city-pulse" style="
              position:absolute;
              width:${size * 3}px;
              height:${size * 3}px;
              border-radius:50%;
              border:1.5px solid ${color};
              opacity:0;
              display:${isUser || activeUsers >= 5 ? 'block' : 'none'};
              animation:pulse-ring ${isUser ? '1.5s' : '2.5s'} ease-out infinite;
              pointer-events:none;
            "></div>
            <div class="city-dot" style="
              width:${size}px;
              height:${size}px;
              border-radius:50%;
              background-color:${color};
              box-shadow:${activeUsers > 0 ? `0 0 ${size}px ${color}88` : 'none'};
              transition:all 0.5s ease;
            "></div>
          </div>
          <span class="city-count" style="
            font-size:8px;
            color:white;
            font-weight:bold;
            margin-top:2px;
            display:${activeUsers > 0 ? 'block' : 'none'};
            pointer-events:none;
            background-color:${color}cc;
            padding:1px 5px;
            border-radius:6px;
            line-height:1.3;
          ">${activeUsers}</span>
        `;

        el.addEventListener('click', () => onCityClick(city.id));

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([geo.lng, geo.lat])
          .addTo(map);

        markersRef.current.set(city.id, { marker, el });
      }
    }
  }, [userCityId, onCityClick]);

  // Initialize map — gray minimal style, limited zoom
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const userGeo = userCityId ? CITY_GEO[userCityId] : null;
    const center: [number, number] = userGeo
      ? [userGeo.lng, userGeo.lat]
      : [TURKEY_CENTER.lng, TURKEY_CENTER.lat];
    const zoom = userGeo ? 6.5 : TURKEY_CENTER.zoom;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center,
      zoom,
      attributionControl: false,
      pitch: 0,
      bearing: 0,
      minZoom: 5,    // Don't zoom out too far
      maxZoom: 8,    // Don't zoom in to district level
    });

    // Gray minimal atmosphere — hide distracting details
    map.on('style.load', () => {
      // Dark fog for space feel
      map.setFog({
        color: 'rgb(12, 12, 20)',
        'high-color': 'rgb(20, 18, 40)',
        'horizon-blend': 0.05,
        'space-color': 'rgb(8, 8, 18)',
        'star-intensity': 0.15,
      });

      // Hide distracting layers — roads, buildings, POIs, districts
      const layersToHide = [
        'road-simple', 'road-street', 'road-minor', 'road-major',
        'road-motorway', 'road-trunk', 'road-primary', 'road-secondary',
        'road-label', 'road-number-shield',
        'building', 'building-outline',
        'poi-label', 'transit-label',
        'place-neighborhood', 'place-suburb',
        'natural-point-label', 'natural-line-label',
        'waterway-label',
        'admin-1-boundary', 'admin-1-boundary-bg',
      ];

      for (const layerId of layersToHide) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', 'none');
        }
      }

      // Make remaining land/water more gray/muted
      if (map.getLayer('land')) {
        map.setPaintProperty('land', 'background-color', '#0d0d18');
      }
      if (map.getLayer('water')) {
        map.setPaintProperty('water', 'fill-color', '#080815');
      }

      // Hide city labels that Mapbox shows by default (we use our own markers)
      const labelLayers = ['place-city', 'place-town', 'place-village', 'place-label',
        'settlement-label', 'settlement-minor-label', 'settlement-major-label',
        'settlement-subdivision-label', 'state-label', 'country-label'];
      for (const layerId of labelLayers) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', 'none');
        }
      }

      // Make admin boundaries very subtle
      if (map.getLayer('admin-0-boundary')) {
        map.setPaintProperty('admin-0-boundary', 'line-color', 'rgba(255,255,255,0.06)');
      }
      if (map.getLayer('admin-0-boundary-bg')) {
        map.setPaintProperty('admin-0-boundary-bg', 'line-color', 'rgba(255,255,255,0.03)');
      }
    });

    map.on('load', () => {
      updateMarkers();
    });

    // Disable rotation + scroll zoom for simplicity
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
      zoom: 6.5,
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
          0% { transform: scale(0.4); opacity: 0.7; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        .mapboxgl-ctrl-logo { display: none !important; }
        .mapboxgl-ctrl-attrib { display: none !important; }
        .mapboxgl-canvas { outline: none; }
      `}</style>

      {/* Empty state overlay */}
      {cities.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <p className="text-white/20 text-sm text-center bg-black/40 rounded-xl px-4 py-2 backdrop-blur-md">
            Henuz aktif sehir yok. Sen ilk ol!
          </p>
        </div>
      )}
    </div>
  );
}
