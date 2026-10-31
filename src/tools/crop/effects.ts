import type { ClipSettings } from '../../core/project';

export function previewCrop(media: { w?: number; h?: number }, canvas: { w: number; h: number }, settings: ClipSettings) {
  const sourceW = media.w && Number.isFinite(media.w) && media.w > 0 ? Math.round(media.w) : canvas.w;
  const sourceH = media.h && Number.isFinite(media.h) && media.h > 0 ? Math.round(media.h) : canvas.h;
  const x = Math.min(sourceW - 1, Math.round(settings.crop.x * sourceW));
  const y = Math.min(sourceH - 1, Math.round(settings.crop.y * sourceH));
  const right = Math.min(sourceW, Math.max(x + 1, Math.round((settings.crop.x + settings.crop.w) * sourceW)));
  const bottom = Math.min(sourceH, Math.max(y + 1, Math.round((settings.crop.y + settings.crop.h) * sourceH)));
  return { x, y, w: right - x, h: bottom - y };
}
export const exportCrop = (crop: { x: number; y: number; w: number; h: number }): string[] => [`crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}:exact=1`];
