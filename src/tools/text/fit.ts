import type { Overlay, Project } from '../../core/project';
import { calculateGeometry } from '../../core/geometry';
import { clipAt, projectDuration } from '../../core/timeline';
import { measureTextBounds } from './render';

export type FitRect = { left: number; top: number; width: number; height: number };
export function visibleVideoRect(project: Project, time: number): FitRect {
  const { w, h, fps } = project.canvas;
  const current = clipAt(project, time >= projectDuration(project) ? Math.max(0, projectDuration(project) - 1 / fps) : time);
  const media = project.media.find(m => m.id === current?.mediaId);
  if (!current || !media) return { left: 0, top: 0, width: w, height: h };
  const g = calculateGeometry(media, project.canvas, current);
  const left = Math.max(0, g.left), top = Math.max(0, g.top);
  const right = Math.min(w, g.left + g.width), bottom = Math.min(h, g.top + g.height);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function fittedTextValue(project: Project, item: Overlay, time: number, property: 'size' | 'scale', centered = false) {
  if (!item.style) return null;
  const rect = visibleVideoRect(project, time);
  const target = centered ? { ...item, posX: rect.left + rect.width / 2 - project.canvas.w / 2, posY: rect.top + rect.height / 2 - project.canvas.h / 2 } : item;
  const candidate = (value: number): Overlay => property === 'size' ? { ...target, style: { ...item.style!, size: value } } : { ...target, scale: value };
  const fits = (value: number) => {
    const b = measureTextBounds(candidate(value), project.canvas);
    return b.left >= rect.left && b.top >= rect.top && b.left + b.width <= rect.left + rect.width && b.top + b.height <= rect.top + rect.height;
  };
  let low = property === 'size' ? 8 : 0.1, high = property === 'size' ? 500 : 10;
  if (!rect.width || !rect.height || !fits(low)) return null;
  if (fits(high)) return { value: high, rect, posX: target.posX, posY: target.posY, limited: false };
  for (let i = 0; i < 24; i++) { const middle = (low + high) / 2; if (fits(middle)) low = middle; else high = middle; }
  return { value: low, rect, posX: target.posX, posY: target.posY, limited: true };
}
