import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { num } from './format';

export interface Series { key: string; label: string; color: string; }
interface Props<T> {
  title: string; unit: string; data: T[]; series: Series[]; x: (d: T) => number; xLabel: (v: number) => string;
  night?: (d: T) => boolean; decimals?: number; height?: number; zero?: boolean; cap?: number;
}

function niceTicks(lo: number, hi: number, n = 4) {
  if (hi - lo < 1e-6) { hi = lo + 1; }
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
  const st = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.floor(lo / st) * st; v <= hi + st * 0.999; v += st) out.push(+v.toFixed(8));
  return out;
}

export function Chart<T extends object>({ title, unit, data, series, x, xLabel, night, decimals = 1, height = 170, zero, cap }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(420);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(240, e[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const pts = useMemo(() => {
    const step = Math.max(1, Math.floor(data.length / 320));
    return data.filter((_, i) => i % step === 0 || i === data.length - 1);
  }, [data]);
  const m = { l: 46, r: 12, t: 8, b: 22 }, iw = w - m.l - m.r, ih = height - m.t - m.b;
  if (pts.length < 2) return <div className="chart" ref={ref}><h4>{title}</h4><p className="muted">Aguardando dados da simulação.</p></div>;
  const x0 = x(pts[0]), x1 = x(pts[pts.length - 1]);
  let lo = Infinity, hi = -Infinity;
  for (const d of pts) for (const s of series) { const v = (d as Record<string, number>)[s.key]; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (zero) lo = Math.min(0, lo);
  const pad = zero ? 0 : (hi - lo) * 0.06 + 0.2;
  let ticks = niceTicks(lo - pad, hi + pad);
  if (cap !== undefined) ticks = ticks.filter((t) => t <= cap);
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const sx = (v: number) => m.l + ((v - x0) / Math.max(1e-6, x1 - x0)) * iw;
  const sy = (v: number) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const bands: [number, number][] = [];
  if (night) { let st: number | null = null; pts.forEach((d, i) => { const n = night(d); if (n && st === null) st = x(d); if ((!n || i === pts.length - 1) && st !== null) { bands.push([st, x(d)]); st = null; } }); }
  const hd = hover !== null ? pts[hover] : null;
  const xt = Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4);
  const last = pts[pts.length - 1] as Record<string, number>;
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * w;
    const v = x0 + ((px - m.l) / iw) * (x1 - x0);
    let b = 0, bd = Infinity; pts.forEach((d, i) => { const dd = Math.abs(x(d) - v); if (dd < bd) { bd = dd; b = i; } });
    setHover(b);
  };
  return (
    <div className="chart" ref={ref}>
      <h4>{title} <span className="muted">{unit}</span></h4>
      {series.length > 1 && <div className="legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>}
      <div className="chartwrap">
        <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={`${title}: ${series.map((s) => `${s.label} ${num(last[s.key], decimals)} ${unit}`).join(', ')}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {bands.map(([a, b], i) => <rect key={i} x={sx(a)} y={m.t} width={Math.max(0, sx(b) - sx(a))} height={ih} className="nightband" />)}
          {ticks.map((t) => <g key={t}><line x1={m.l} x2={m.l + iw} y1={sy(t)} y2={sy(t)} className="grid" /><text x={m.l - 6} y={sy(t) + 3.5} textAnchor="end" className="tick">{num(t, Math.abs(yMax - yMin) < 6 ? 1 : 0)}</text></g>)}
          {xt.map((v, i) => <text key={i} x={sx(v)} y={height - 6} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} className="tick">{xLabel(v)}</text>)}
          {series.map((s) => <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pts.map((d) => `${sx(x(d)).toFixed(1)},${sy((d as Record<string, number>)[s.key]).toFixed(1)}`).join(' ')} />)}
          {series.map((s) => <circle key={s.key} cx={sx(x(pts[pts.length - 1]))} cy={sy(last[s.key])} r="3.5" fill={s.color} className="endpoint" />)}
          {hd && <line x1={sx(x(hd))} x2={sx(x(hd))} y1={m.t} y2={m.t + ih} className="cross" />}
          {hd && series.map((s) => <circle key={s.key} cx={sx(x(hd))} cy={sy((hd as Record<string, number>)[s.key])} r="4" fill={s.color} className="endpoint" />)}
        </svg>
        {hd && <div className="tip" style={{ left: Math.min(w - 170, Math.max(0, sx(x(hd)) + 10)), top: 10 }}>
          <b>{xLabel(x(hd))}</b>
          {series.map((s) => <div key={s.key}><i style={{ background: s.color }} />{s.label}<span>{num((hd as Record<string, number>)[s.key], decimals)} {unit}</span></div>)}
        </div>}
      </div>
    </div>
  );
}
