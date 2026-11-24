import { useRef } from 'react';
import type { PointerEvent } from 'react';
import type { CropRect } from '../core/project';

interface Props {
  crop: CropRect;
  sourceWidth: number;
  sourceHeight: number;
  onChange: (crop: CropRect, group: string) => void;
  onNotice: (message: string, error?: boolean) => void;
}

const percent = (n: number) => `${n * 100}%`;

export default function CropOverlay({ crop, sourceWidth, sourceHeight, onChange, onNotice }: Props) {
  const drag = useRef<{ x: number; y: number; width: number; height: number; crop: CropRect; handle: string; group: string } | null>(null);
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const handle = (event.target as HTMLElement).dataset.handle;
    if (!handle) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, crop: { ...crop }, handle, group: crypto.randomUUID() };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d) return;
    const dx = (event.clientX - d.x) / d.width, dy = (event.clientY - d.y) / d.height;
    const c = d.crop, clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    let crop = { ...c };
    if (d.handle === 'move') crop = { ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) };
    else {
      const minW = Math.min(1, 2 / sourceWidth), minH = Math.min(1, 2 / sourceHeight);
      const left = d.handle.includes('w') ? clamp(c.x + dx, 0, c.x + c.w - minW) : c.x;
      const top = d.handle.includes('n') ? clamp(c.y + dy, 0, c.y + c.h - minH) : c.y;
      const right = d.handle.includes('e') ? clamp(c.x + c.w + dx, c.x + minW, 1) : c.x + c.w;
      const bottom = d.handle.includes('s') ? clamp(c.y + c.h + dy, c.y + minH, 1) : c.y + c.h;
      crop = { x: left, y: top, w: right - left, h: bottom - top };
    }
    try { onChange(crop, d.group); }
    catch (error) { drag.current = null; onNotice(String(error instanceof Error ? error.message : error), true); }
  }
  return <div className="crop-overlay" onPointerDown={begin} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div className="crop-box" data-handle="move" style={{ left: percent(crop.x), top: percent(crop.y), width: percent(crop.w), height: percent(crop.h) }}>
          {['nw', 'ne', 'sw', 'se'].map(handle => <span key={handle} className={`crop-handle ${handle}`} data-handle={handle} />)}
        </div>
      </div>;
}
