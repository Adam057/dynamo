'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Point, SystemId } from '@/lib/science';

type Props = { points: Point[]; id: SystemId; progress?: number; dark?: boolean; comparison?: Point[] };
type XY = [number, number];

function project(point: Point, id: SystemId): XY {
  if (id === 'lorenz') return [point.state[0], point.state[2]];
  if (id === 'logistic') return [point.t, point.state[0]];
  return [point.state[0], point.state[1]];
}

export default function Plot({ points, id, progress = 1, dark = true, comparison }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const projected = useMemo(() => points.map(point => project(point, id)), [points, id]);
  const previous = useMemo(() => comparison?.map(point => project(point, id)), [comparison, id]);
  const bounds = useMemo(() => {
    const all = previous ? [...projected, ...previous] : projected;
    if (!all.length) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of all) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const dx = (maxX - minX) * .05 || 1, dy = (maxY - minY) * .05 || 1;
    return { minX: minX - dx, maxX: maxX + dx, minY: minY - dy, maxY: maxY + dy };
  }, [projected, previous]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const resize = () => setSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !projected.length || !size.width || !size.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2), w = size.width, h = size.height;
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    const c = canvas.getContext('2d'); if (!c) return;
    c.scale(ratio, ratio);
    c.fillStyle = dark ? '#171e1a' : '#fffcf6'; c.fillRect(0, 0, w, h);
    const pad = Math.min(40, Math.max(25, w * .09));
    const px = (x: number) => pad + (x - bounds.minX) / (bounds.maxX - bounds.minX) * (w - 2 * pad);
    const py = (y: number) => h - pad - (y - bounds.minY) / (bounds.maxY - bounds.minY) * (h - 2 * pad);
    c.strokeStyle = dark ? '#f4f5df17' : '#19191918'; c.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const x = pad + (w - 2 * pad) * i / 8, y = pad + (h - 2 * pad) * i / 8;
      c.beginPath(); c.moveTo(x, pad); c.lineTo(x, h - pad); c.moveTo(pad, y); c.lineTo(w - pad, y); c.stroke();
    }
    const path = (data: XY[], count: number, color: string, width: number) => {
      if (!data.length) return;
      c.beginPath();
      for (let i = 0; i < count; i++) { const [x, y] = data[i]; if (i) c.lineTo(px(x), py(y)); else c.moveTo(px(x), py(y)); }
      c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.stroke();
    };
    const n = Math.min(projected.length, Math.max(1, Math.floor(projected.length * progress)));
    if (previous) path(previous, previous.length, dark ? '#db9d6b' : '#bb6a35', 1.2);
    path(projected, n, dark ? '#c7e861' : '#648829', 1.8);
    const [tipX, tipY] = projected[n - 1];
    c.beginPath(); c.arc(px(tipX), py(tipY), 4, 0, Math.PI * 2); c.fillStyle = '#e4f4a4'; c.fill();
    c.fillStyle = dark ? '#b7c1b5' : '#5c655b'; c.font = '11px Arial';
    c.fillText(id === 'logistic' ? 'time' : id === 'predator' ? 'prey' : id === 'oscillator' ? 'position' : 'x', w / 2, h - 7);
    c.save(); c.translate(13, h / 2); c.rotate(-Math.PI / 2);
    c.fillText(id === 'lorenz' ? 'z' : id === 'logistic' ? 'population' : id === 'oscillator' ? 'velocity' : 'predator', 0, 0); c.restore();
  }, [projected, previous, progress, bounds, dark, id, size]);

  return <canvas ref={ref} className="plot" role="img" aria-label={`Computed ${id} trajectory plot`} />;
}
