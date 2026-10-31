import type { ClipSettings } from './project';
import { previewCrop } from '../tools/crop/effects';

export interface ClipGeometry {
  /** Integer source pixels; shared by the CSS crop window and FFmpeg. */
  crop: { x: number; y: number; w: number; h: number };
  baseWidth: number; baseHeight: number;
  width: number; height: number; left: number; top: number;
}

export function validateGeometry(media: { w?: number; h?: number }, canvas: { w: number; h: number }, settings: ClipSettings) {
  const { crop } = settings;
  const values = [settings.zoom, settings.stretchX, settings.stretchY, settings.posX, settings.posY, crop.x, crop.y, crop.w, crop.h, canvas.w, canvas.h];
  if (!values.every(Number.isFinite) || canvas.w <= 0 || canvas.h <= 0
    || [settings.zoom, settings.stretchX, settings.stretchY].some(value => value < 0.01 || value > 100)
    || settings.zoom * settings.stretchX < 0.1 - 1e-8 || settings.zoom * settings.stretchX > 10 + 1e-8
    || settings.zoom * settings.stretchY < 0.1 - 1e-8 || settings.zoom * settings.stretchY > 10 + 1e-8
    || Math.abs(settings.posX) > canvas.w * 2 || Math.abs(settings.posY) > canvas.h * 2
    || crop.x < 0 || crop.y < 0 || crop.w < 2 / (media.w || canvas.w) - 1e-8 || crop.h < 2 / (media.h || canvas.h) - 1e-8
    || crop.x + crop.w > 1 + 1e-6 || crop.y + crop.h > 1 + 1e-6) {
    throw new Error('La geometría del clip no es válida. Usa escalas entre 10% y 1000% y un recorte dentro del original.');
  }
}

/** Crop, flip, fit, independent scale, then center/translate. Positive Y points down. */
export function calculateGeometry(media: { w?: number; h?: number }, canvas: { w: number; h: number }, settings: ClipSettings): ClipGeometry {
  validateGeometry(media, canvas, settings);
  const crop = previewCrop(media, canvas, settings);
  const fit = Math.min(canvas.w / crop.w, canvas.h / crop.h);
  const baseWidth = crop.w * fit, baseHeight = crop.h * fit;
  const width = baseWidth * settings.zoom * settings.stretchX;
  const height = baseHeight * settings.zoom * settings.stretchY;
  return { crop, baseWidth, baseHeight, width, height, left: (canvas.w - width) / 2 + settings.posX, top: (canvas.h - height) / 2 + settings.posY };
}
