'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { CityActivity } from '@/lib/stream-events';

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

interface GeoFeature {
  type: 'Feature';
  properties: { name: string; number: number };
  geometry: { type: string; coordinates: unknown };
}

interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

interface ProvCache {
  name: string;
  slug: string;
  path: Path2D;
  cx: number;
  cy: number;
  bx0: number;
  by0: number;
  bx1: number;
  by1: number;
}

interface Pulse {
  x: number;
  y: number;
  prov: number;
  user: boolean;
  born: number;
  phase: number;
  active: boolean;
}

interface TurkeyCanvasProps {
  cities: CityActivity[];
  userCityId: string | null;
  onCityClick: (cityId: string) => void;
}

/* ═══════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════ */

// Turkey bounding box (degrees)
const BD = { x0: 25.5, x1: 45.0, y0: 35.8, y1: 42.2 };
const PAD = 24;
const COS39 = Math.cos(39 * Math.PI / 180); // aspect ratio correction

const MAX_PULSES = 400;
const PULSE_LIFE = 25_000; // 25s

// Warm library color palette
const CLR = {
  bg: '#F4F5F7',
  stroke: 'rgba(180,170,155,0.3)',
  baseFill: 'rgba(237,232,224,0.3)',
  activeRGB: [212, 149, 107] as const, // #D4956B warm amber
  userRGB: [192, 87, 70] as const,     // #C05746 warm brick
  pulseRGB: [91, 138, 154] as const,   // #5B8A9A muted teal
  pUserRGB: [212, 149, 107] as const,  // #D4956B warm amber
  text: 'rgba(60,50,40,0.5)',
  hover: 'rgba(212,149,107,0.08)',
  hoverStroke: 'rgba(212,149,107,0.35)',
};

/* ═══════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════ */

/** Turkish-aware slugify for province name → city_id matching */
function toSlug(name: string): string {
  return name
    .replace(/İ/g, 'I')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/â/g, 'a')
    .replace(/[^a-z0-9]/g, '');
}

/** Project lng/lat → canvas CSS pixel coordinates */
function proj(lng: number, lat: number, w: number, h: number): [number, number] {
  const mapW = (BD.x1 - BD.x0) * COS39;
  const mapH = BD.y1 - BD.y0;
  const dw = w - PAD * 2;
  const dh = h - PAD * 2;
  const scale = Math.min(dw / mapW, dh / mapH);
  const ox = PAD + (dw - mapW * scale) / 2;
  const oy = PAD + (dh - mapH * scale) / 2;
  return [
    ox + (lng - BD.x0) * COS39 * scale,
    oy + (BD.y1 - lat) * scale,
  ];
}

/** Build Path2D cache for all 81 provinces */
function buildCache(geo: GeoCollection, w: number, h: number): ProvCache[] {
  return geo.features.map((f) => {
    const path = new Path2D();
    let sx = 0, sy = 0, n = 0;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;

    const polys: number[][][][] =
      f.geometry.type === 'MultiPolygon'
        ? (f.geometry.coordinates as number[][][][])
        : [f.geometry.coordinates as number[][][]];

    for (const poly of polys) {
      for (const ring of poly) {
        if (ring.length < 4) continue;

        // Island filter: skip tiny polygons (< 0.02° extent)
        let rlo0 = 1e9, rlo1 = -1e9, rla0 = 1e9, rla1 = -1e9;
        for (const [lo, la] of ring) {
          rlo0 = Math.min(rlo0, lo); rlo1 = Math.max(rlo1, lo);
          rla0 = Math.min(rla0, la); rla1 = Math.max(rla1, la);
        }
        if ((rlo1 - rlo0) < 0.02 && (rla1 - rla0) < 0.02) continue;

        let first = true;
        for (const [lo, la] of ring) {
          const [x, y] = proj(lo, la, w, h);
          if (first) { path.moveTo(x, y); first = false; }
          else path.lineTo(x, y);
          sx += x; sy += y; n++;
          bx0 = Math.min(bx0, x); by0 = Math.min(by0, y);
          bx1 = Math.max(bx1, x); by1 = Math.max(by1, y);
        }
        path.closePath();
      }
    }

    return {
      name: f.properties.name,
      slug: toSlug(f.properties.name),
      path,
      cx: n ? sx / n : 0,
      cy: n ? sy / n : 0,
      bx0, by0, bx1, by1,
    };
  });
}

/** Draw a rounded rectangle path */
function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ═══════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════ */

export function TurkeyCanvas({ cities, userCityId, onCityClick }: TurkeyCanvasProps) {
  // Canvas refs (3 layers)
  const boxRef = useRef<HTMLDivElement>(null);
  const c1Ref = useRef<HTMLCanvasElement>(null); // Layer 1: static provinces
  const c2Ref = useRef<HTMLCanvasElement>(null); // Layer 2: breathing + pulses
  const c3Ref = useRef<HTMLCanvasElement>(null); // Layer 3: hover + tooltips

  // State refs (no re-renders needed)
  const provsRef = useRef<ProvCache[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const hovRef = useRef(-1);
  const rafRef = useRef(0);
  const szRef = useRef({ w: 0, h: 0 });
  const geoRef = useRef<GeoCollection | null>(null);
  const actRef = useRef(new Map<string, CityActivity>());
  const uidRef = useRef('');
  const spawnAccRef = useRef(0);
  const prevTRef = useRef(0);
  const lowFpsRef = useRef(false);

  // ─── Sync activity data ───
  useEffect(() => {
    const m = new Map<string, CityActivity>();
    for (const c of cities) m.set(c.city_id, c);
    actRef.current = m;
  }, [cities]);

  useEffect(() => {
    uidRef.current = userCityId ?? '';
  }, [userCityId]);

  // ─── Resize all 3 canvases (DPR-aware) ───
  const resize = useCallback(() => {
    const el = boxRef.current;
    if (!el || !geoRef.current) return;

    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w < 10 || h < 10) return;
    if (w === szRef.current.w && h === szRef.current.h) return;

    szRef.current = { w, h };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    for (const ref of [c1Ref, c2Ref, c3Ref]) {
      const cv = ref.current;
      if (!cv) continue;
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      const ctx = cv.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Rebuild province Path2D cache for new dimensions
    provsRef.current = buildCache(geoRef.current, w, h);
    drawL1();
  }, []);

  // ─── Layer 1: Province outlines + activity fills (mostly static) ───
  const drawL1 = useCallback(() => {
    const ctx = c1Ref.current?.getContext('2d');
    if (!ctx) return;
    const { w, h } = szRef.current;
    ctx.clearRect(0, 0, w, h);

    const provinces = provsRef.current;
    const activity = actRef.current;
    const userSlug = uidRef.current;

    for (const p of provinces) {
      const a = activity.get(p.slug);
      const users = a?.active_users ?? 0;
      const mins = a?.today_minutes ?? 0;
      const isUser = p.slug === userSlug;

      // Fill opacity based on activity level (0→base, high→vivid)
      const fillLevel = Math.min(1, (users * 8 + mins / 30) / 100);

      if (fillLevel > 0.01) {
        const rgb = isUser ? CLR.userRGB : CLR.activeRGB;
        const alpha = 0.08 + fillLevel * 0.42;
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
      } else {
        ctx.fillStyle = CLR.baseFill;
      }
      ctx.fill(p.path);

      // Province stroke
      ctx.strokeStyle = CLR.stroke;
      ctx.lineWidth = 0.5;
      ctx.stroke(p.path);
    }

    // Province name labels (only large enough provinces)
    ctx.font = '8px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = CLR.text;
    for (const p of provinces) {
      const bw = p.bx1 - p.bx0;
      const bh = p.by1 - p.by0;
      if (bw * bh > 800) {
        ctx.fillText(p.name, p.cx, p.cy);
      }
    }
  }, []);

  // ─── Layer 2: Breathing + Pulses (animated via rAF) ───
  const drawL2 = useCallback((now: number) => {
    const ctx = c2Ref.current?.getContext('2d');
    if (!ctx) return;
    const { w, h } = szRef.current;
    ctx.clearRect(0, 0, w, h);

    // FPS monitoring for adaptive quality
    const dt = now - prevTRef.current;
    prevTRef.current = now;
    if (dt > 0) lowFpsRef.current = (1000 / dt) < 40;

    const provinces = provsRef.current;
    const isLowFps = lowFpsRef.current;

    // Breathing: very subtle opacity oscillation (6-10s cycle per province)
    if (!isLowFps) {
      for (let i = 0; i < provinces.length; i++) {
        const breath = Math.sin(now / 5000 + i * 0.8) * 0.012 + 0.012;
        ctx.fillStyle = `rgba(212,149,107,${breath})`;
        ctx.fill(provinces[i].path);
      }
    }

    // Spawn pulses based on city activity
    spawnAccRef.current += dt;
    if (spawnAccRef.current > 1000) {
      spawnAccRef.current = 0;
      const activity = actRef.current;
      const userSlug = uidRef.current;

      for (let i = 0; i < provinces.length; i++) {
        const p = provinces[i];
        const a = activity.get(p.slug);
        if (!a || a.active_users < 1) continue;

        const chance = Math.min(0.35, a.active_users * 0.04);
        if (Math.random() < chance) {
          spawnPulse(i, p, p.slug === userSlug, now);
        }
      }
    }

    // Draw pulses
    const ps = pulsesRef.current;
    for (let i = ps.length - 1; i >= 0; i--) {
      const pl = ps[i];
      if (!pl.active) continue;

      const age = now - pl.born;
      if (age > PULSE_LIFE) { pl.active = false; continue; }

      const t = age / PULSE_LIFE;

      // Scale: birth animation → breathing
      let sc: number;
      if (t < 0.06) {
        sc = 0.5 + (t / 0.06) * 0.5; // scale 0.5→1.0
      } else if (!isLowFps) {
        sc = 1 + Math.sin(now / 2800 + pl.phase) * 0.04; // gentle breathing
      } else {
        sc = 1;
      }

      // Opacity: fade in → sustain → fade out
      let op: number;
      if (t < 0.06) op = t / 0.06;
      else if (t > 0.75) op = (1 - t) / 0.25;
      else op = 1;

      const rgb = pl.user ? CLR.pUserRGB : CLR.pulseRGB;
      const baseAlpha = pl.user ? 0.65 : 0.45;
      const r = (pl.user ? 3.5 : 2.5) * sc;

      // User pulse: soft outer halo
      if (pl.user && !isLowFps) {
        ctx.beginPath();
        ctx.arc(pl.x, pl.y, r * 2.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${op * 0.06})`;
        ctx.fill();
      }

      // Main dot
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${op * baseAlpha})`;
      ctx.fill();
    }
  }, []);

  /** Object-pooled pulse spawning */
  const spawnPulse = useCallback(
    (provIdx: number, prov: ProvCache, isUser: boolean, now: number) => {
      // Reuse dead pulse or create new one
      let pl = pulsesRef.current.find((p) => !p.active);
      if (!pl && pulsesRef.current.length < MAX_PULSES) {
        pl = { x: 0, y: 0, prov: 0, user: false, born: 0, phase: 0, active: false };
        pulsesRef.current.push(pl);
      }
      if (!pl) return;

      // Position: province center + random offset within bounds
      const bw = prov.bx1 - prov.bx0;
      const bh = prov.by1 - prov.by0;
      pl.x = prov.cx + (Math.random() - 0.5) * bw * 0.55;
      pl.y = prov.cy + (Math.random() - 0.5) * bh * 0.55;
      pl.prov = provIdx;
      pl.user = isUser;
      pl.born = now;
      pl.phase = Math.random() * Math.PI * 2;
      pl.active = true;
    },
    [],
  );

  // ─── Layer 3: Hover highlight + tooltip ───
  const drawL3 = useCallback(() => {
    const ctx = c3Ref.current?.getContext('2d');
    if (!ctx) return;
    const { w, h } = szRef.current;
    ctx.clearRect(0, 0, w, h);

    const i = hovRef.current;
    if (i < 0 || i >= provsRef.current.length) return;

    const p = provsRef.current[i];

    // Highlight fill
    ctx.fillStyle = CLR.hover;
    ctx.fill(p.path);
    ctx.strokeStyle = CLR.hoverStroke;
    ctx.lineWidth = 1.2;
    ctx.stroke(p.path);

    // Tooltip label
    const a = actRef.current.get(p.slug);
    const users = a?.active_users ?? 0;
    const label = users > 0 ? `${p.name} · ${users} aktif` : p.name;

    ctx.font = '600 10px system-ui, -apple-system, sans-serif';
    const tw = ctx.measureText(label).width + 14;
    const tx = Math.min(Math.max(p.cx, tw / 2 + 4), w - tw / 2 - 4);
    const ty = p.cy - 14;

    // Tooltip background pill
    rrect(ctx, tx - tw / 2, ty - 14, tw, 22, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.93)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,170,155,0.25)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Tooltip text
    ctx.fillStyle = 'rgba(60,50,40,0.88)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, tx, ty - 3);
  }, []);

  // ─── Hit test: find province under pointer ───
  const hitTest = useCallback((clientX: number, clientY: number): number => {
    const cv = c3Ref.current;
    if (!cv) return -1;

    const rect = cv.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const ctx = cv.getContext('2d');
    if (!ctx) return -1;

    // Use identity transform for hit testing (paths are in CSS coords)
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    let found = -1;
    for (let i = 0; i < provsRef.current.length; i++) {
      const p = provsRef.current[i];
      // Quick bounding box check
      if (mx < p.bx0 - 2 || mx > p.bx1 + 2) continue;
      if (my < p.by0 - 2 || my > p.by1 + 2) continue;

      if (ctx.isPointInPath(p.path, mx, my)) {
        found = i;
        break;
      }
    }

    ctx.restore();
    return found;
  }, []);

  // ─── Mouse / Pointer handlers ───
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Skip touch move (would conflict with scroll)
      if (e.pointerType === 'touch') return;

      const found = hitTest(e.clientX, e.clientY);
      if (found !== hovRef.current) {
        hovRef.current = found;
        drawL3();
      }
    },
    [hitTest, drawL3],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const found = hitTest(e.clientX, e.clientY);
      if (found >= 0) {
        onCityClick(provsRef.current[found].slug);
      }
    },
    [hitTest, onCityClick],
  );

  const onPointerLeave = useCallback(() => {
    hovRef.current = -1;
    drawL3();
  }, [drawL3]);

  // ─── Init: load GeoJSON + ResizeObserver ───
  useEffect(() => {
    import('@/data/turkey-provinces.json').then((mod) => {
      geoRef.current = mod.default as unknown as GeoCollection;
      resize();
    });

    const ro = new ResizeObserver(() => resize());
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [resize]);

  // ─── Redraw Layer 1 when activity/user data changes ───
  useEffect(() => {
    if (provsRef.current.length > 0) drawL1();
  }, [cities, userCityId, drawL1]);

  // ─── Animation loop (Layer 2) ───
  useEffect(() => {
    let running = true;
    let frameCount = 0;
    prevTRef.current = performance.now();

    const tick = (now: number) => {
      if (!running) return;

      drawL2(now);

      // Periodic Layer 1 refresh for slow data changes
      frameCount++;
      if (frameCount % 180 === 0) drawL1();

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [drawL1, drawL2]);

  return (
    <div
      ref={boxRef}
      className="relative w-full h-full overflow-hidden"
      style={{ background: CLR.bg }}
    >
      {/* Layer 1: Static province outlines + fills */}
      <canvas ref={c1Ref} className="absolute inset-0" style={{ pointerEvents: 'none' }} />

      {/* Layer 2: Breathing animation + contribution pulses */}
      <canvas ref={c2Ref} className="absolute inset-0" style={{ pointerEvents: 'none' }} />

      {/* Layer 3: Hover highlight + tooltips (receives pointer events) */}
      <canvas
        ref={c3Ref}
        className="absolute inset-0 cursor-pointer"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerLeave={onPointerLeave}
      />

      {/* Empty state */}
      {cities.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <p className="text-[#3C3228]/20 text-sm text-center bg-white/50 rounded-xl px-4 py-2 backdrop-blur-md">
            Harita yukleniyor...
          </p>
        </div>
      )}
    </div>
  );
}
