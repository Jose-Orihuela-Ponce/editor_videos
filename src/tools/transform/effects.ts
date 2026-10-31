import { calculateGeometry } from '../../core/geometry';
import type { ClipGeometry } from '../../core/geometry';
import type { ClipSettings } from '../../core/project';

export const previewTransform = (media: { w?: number; h?: number }, canvas: { w: number; h: number }, settings: ClipSettings) => calculateGeometry(media, canvas, settings);
export function exportTransform(geometry: ClipGeometry, output: { w: number; h: number }, canvas: { w: number; h: number }, settings: ClipSettings) {
  const scale = output.w / canvas.w;
  const width = Math.max(2, Math.floor(geometry.width * scale / 2) * 2);
  const height = Math.max(2, Math.floor(geometry.height * scale / 2) * 2);
  return { width, height, left: (output.w - width) / 2 + settings.posX * scale, top: (output.h - height) / 2 + settings.posY * scale, filters: [`scale=${width}:${height}`, 'setsar=1'] };
}
